from __future__ import annotations

import hashlib
import logging
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.config import UPLOADS_DIR, get_settings
from backend.core.chunking.chunker import chunk_text
from backend.core.embedding.provider import embed_texts
from backend.core.parsing.ocr import ocr_fallback, ocr_pdf_images
from backend.core.parsing.parser import ParsedPage, parse_file
from backend.core.summarization.map_reduce import map_reduce_summarize
from backend.core.qa.precompute import precompute_from_text
from backend.core.qa.indexing import index_precomputed_qa, index_summary_segments
from backend.core.vector_store.faiss_store import get_faiss_store
from backend.db.collections import Collections

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.utcnow()


def _clean_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\x00", " ")
    # collapse whitespace
    text = " ".join(text.split())
    return text.strip()


def _embedding_id(doc_id: str, chunk_id: str) -> int:
    h = hashlib.sha256(f"{doc_id}:{chunk_id}".encode("utf-8")).digest()
    return int.from_bytes(h[:8], "little", signed=False) & ((1 << 63) - 1)


async def _set_status(db: AsyncIOMotorDatabase, *, doc_id: str, job_id: str, status: str, error: str | None = None) -> None:
    cols = Collections()
    update_data: dict[str, Any] = {"status": status, "updated_at": _now()}
    if error is not None:
        update_data["error"] = error
    await db[cols.documents].update_one(
        {"doc_id": doc_id},
        {"$set": update_data},
    )
    await db[cols.jobs].update_one(
        {"job_id": job_id},
        {"$set": update_data},
    )


async def process_document(db: AsyncIOMotorDatabase, *, doc_id: str, job_id: str) -> None:
    """
    Synchronous MVP pipeline (invoked inline from upload endpoint):
      parse -> OCR fallback (if low text) -> clean -> chunk -> embed -> store (FAISS+Mongo) -> summarize -> status complete
    """
    settings = get_settings()
    cols = Collections()

    doc = await db[cols.documents].find_one({"doc_id": doc_id})
    if not doc:
        raise RuntimeError(f"Document not found: {doc_id}")

    file_path = Path(doc["file_path"])
    mime_type = doc.get("mime_type") or ""
    file_name = doc.get("file_name") or file_path.name
    file_size = file_path.stat().st_size if file_path.exists() else 0

    logger.info(
        "Starting document processing for doc_id=%s, file=%s, size=%d bytes, mime=%s",
        doc_id,
        file_name,
        file_size,
        mime_type,
    )

    if not file_path.exists():
        err_msg = f"Uploaded file not found at path: {file_path}"
        await _set_status(db, doc_id=doc_id, job_id=job_id, status="failed", error=err_msg)
        raise RuntimeError(err_msg)

    try:
        await _set_status(db, doc_id=doc_id, job_id=job_id, status="parsing")
        pages = parse_file(file_path, mime_type=mime_type)
        page_count = len(pages)
        initial_chars = sum(len(p.text) for p in pages if p.text)

        logger.info(
            "Parsed file doc_id=%s: %d pages/sections, %d raw chars extracted",
            doc_id,
            page_count,
            initial_chars,
        )

        ocr_attempted = False
        ocr_chars = 0
        if initial_chars < settings.ocr_text_threshold_chars and (
            mime_type == "application/pdf" or file_path.suffix.lower() == ".pdf"
        ):
            ocr_attempted = True
            logger.info(
                "Extracted text (%d chars) is below OCR threshold (%d chars). Attempting OCR fallback for doc_id=%s",
                initial_chars,
                settings.ocr_text_threshold_chars,
                doc_id,
            )
            ocr_pages = ocr_pdf_images(file_path)
            if ocr_pages:
                ocr_dict = {p_num: p_txt for p_num, p_txt in ocr_pages}
                new_pages = []
                for p in pages:
                    existing_text = p.text or ""
                    ocr_page_text = ocr_dict.get(p.page, "") if p.page is not None else ""
                    merged = f"{existing_text}\n{ocr_page_text}".strip()
                    new_pages.append(ParsedPage(page=p.page, text=merged))

                if not pages:
                    for p_num, p_txt in ocr_pages:
                        new_pages.append(ParsedPage(page=p_num, text=p_txt))

                pages = new_pages
                ocr_chars = sum(len(txt) for _, txt in ocr_pages)
                logger.info(
                    "OCR completed for doc_id=%s: extracted %d OCR chars across %d pages",
                    doc_id,
                    ocr_chars,
                    len(ocr_pages),
                )
            else:
                logger.warning("OCR fallback did not produce additional text for doc_id=%s", doc_id)

        cleaned_pages: list[dict[str, Any]] = []
        for p in pages:
            cleaned = _clean_text(p.text or "")
            if cleaned:
                cleaned_pages.append({"page": p.page, "text": cleaned})

        full_text = "\n\n".join(p["text"] for p in cleaned_pages).strip()
        total_cleaned_chars = len(full_text)

        logger.info(
            "Document text extraction summary for doc_id=%s: page_count=%d, initial_chars=%d, ocr_attempted=%s, ocr_chars=%d, final_cleaned_chars=%d",
            doc_id,
            page_count,
            initial_chars,
            ocr_attempted,
            ocr_chars,
            total_cleaned_chars,
        )

        if not full_text:
            raise RuntimeError(
                "Document contains no readable text. The file may be empty, image-only/scanned without OCR text, or password-protected."
            )

        await _set_status(db, doc_id=doc_id, job_id=job_id, status="chunking")
        chunks = []
        for p in cleaned_pages:
            if not p["text"]:
                continue
            chunks.extend(chunk_text(p["text"], page=p["page"]))

        if not chunks:
            raise RuntimeError("No chunks produced from document")

        await _set_status(db, doc_id=doc_id, job_id=job_id, status="embedding")
        texts = [c.text for c in chunks]
        vecs, embed_provider = embed_texts(texts, expected_dim=settings.embedding_dim)

        store = get_faiss_store("easydocs")
        embedding_ids = [_embedding_id(doc_id, c.chunk_id) for c in chunks]
        store.add(vecs, embedding_ids)

        # persist chunk docs
        chunk_docs = []
        for c, emb_id in zip(chunks, embedding_ids):
            if not c.text or len(c.text) < 10:
                continue
            chunk_docs.append(
                {
                    "doc_id": doc_id,
                    "chunk_id": c.chunk_id,
                    "text": c.text,
                    "page": c.page,
                    "embedding_id": emb_id,
                    "embedding_provider": embed_provider,
                    "created_at": _now(),
                }
            )

        if chunk_docs:
            await db[cols.chunks].delete_many({"doc_id": doc_id})
            await db[cols.chunks].insert_many(chunk_docs)

        await _set_status(db, doc_id=doc_id, job_id=job_id, status="summarizing")
        # Map-reduce over chunk texts (bounded for MVP)
        summary, llm_provider = map_reduce_summarize([c["text"] for c in chunk_docs][:12])

        # Precompute artifacts to reduce future LLM calls (detailed summary, key points, and Q&A).
        pre = precompute_from_text("\n\n".join([c["text"] for c in chunk_docs][:12]))

        await db[cols.documents].update_one(
            {"doc_id": doc_id},
            {
                "$set": {
                    "summary": summary,
                    "summary_detailed": pre.summary_detailed,
                    "key_points": pre.key_points,
                    "precomputed_qa": pre.qa_pairs,
                    "embedding_provider": embed_provider,
                    "llm_provider": llm_provider,
                    "precompute_provider": pre.provider_used,
                    "updated_at": _now(),
                }
            },
        )

        # Index summary segments and precomputed questions for semantic retrieval.
        await index_summary_segments(db, doc_id=doc_id, summary_text=pre.summary_detailed)
        await index_precomputed_qa(db, doc_id=doc_id, qa_pairs=pre.qa_pairs)

        await _set_status(db, doc_id=doc_id, job_id=job_id, status="completed")
        logger.info("Document processing completed", extra={"doc_id": doc_id, "job_id": job_id})
    except Exception as e:
        err = str(e)
        await _set_status(db, doc_id=doc_id, job_id=job_id, status="failed", error=err)
        logger.exception("Document processing failed", extra={"doc_id": doc_id, "job_id": job_id})
        raise

