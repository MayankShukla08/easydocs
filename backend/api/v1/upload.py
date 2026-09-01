from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.config import UPLOADS_DIR, get_settings
from backend.core.process_document import process_document
from backend.db.collections import Collections
from backend.dependencies import db_dep

logger = logging.getLogger(__name__)

router = APIRouter()


ALLOWED_MIME = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}


def _now() -> datetime:
    return datetime.utcnow()


async def _save_and_hash(upload: UploadFile, dest: Path, max_bytes: int) -> tuple[str, int]:
    sha = hashlib.sha256()
    size = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(status_code=413, detail="File too large (max 100MB)")
            sha.update(chunk)
            f.write(chunk)
    return sha.hexdigest(), size


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(db_dep),
):
    settings = get_settings()
    cols = Collections()

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")

    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_MIME:
        raise HTTPException(status_code=415, detail="Only PDF/DOCX supported")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    doc_id = str(uuid4())
    job_id = str(uuid4())

    ext = ALLOWED_MIME[mime]
    safe_name = Path(file.filename).name
    dest = UPLOADS_DIR / doc_id / f"{safe_name}"
    if dest.suffix.lower() != ext:
        dest = dest.with_suffix(ext)

    try:
        sha256, size = await _save_and_hash(file, dest, max_bytes=max_bytes)
    finally:
        await file.close()

    if size == 0:
        # Remove empty file
        try:
            dest.unlink(missing_ok=True)  # type: ignore[arg-type]
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Empty file")

    # Duplicate detection by hash
    existing = await db[cols.documents].find_one({"sha256": sha256})
    if existing:
        existing_doc_id = existing["doc_id"]
        status = existing.get("status", "uploaded")
        if status == "completed":
            await db[cols.jobs].insert_one(
                {
                    "job_id": job_id,
                    "doc_id": existing_doc_id,
                    "status": status,
                    "created_at": _now(),
                    "updated_at": _now(),
                }
            )
            logger.info("Duplicate upload reused completed doc_id", extra={"doc_id": existing_doc_id, "job_id": job_id})
            return {"job_id": job_id, "doc_id": existing_doc_id, "status": status}
        
        # If previous attempt failed or is incomplete, re-process with latest pipeline
        doc_id = existing_doc_id

    if not existing:
        # Insert document + job
        await db[cols.documents].insert_one(
            {
                "doc_id": doc_id,
                "user_id": None,
                "file_name": safe_name,
                "file_path": str(dest),
                "sha256": sha256,
                "mime_type": mime,
                "status": "uploaded",
                "summary": None,
                "created_at": _now(),
                "updated_at": _now(),
            }
        )
    
    await db[cols.jobs].insert_one(
        {"job_id": job_id, "doc_id": doc_id, "status": "uploaded", "created_at": _now(), "updated_at": _now()}
    )

    # Synchronous MVP processing (inline)
    try:
        await process_document(db, doc_id=doc_id, job_id=job_id)
    except Exception as exc:
        logger.error("Processing failed for doc_id=%s, job_id=%s: %s", doc_id, job_id, exc)
        job = await db[cols.jobs].find_one({"job_id": job_id})
        err_msg = (job or {}).get("error") or str(exc)
        raise HTTPException(
            status_code=422,
            detail=f"Document processing failed: {err_msg}",
        )

    job = await db[cols.jobs].find_one({"job_id": job_id})
    return {"job_id": job_id, "doc_id": doc_id, "status": (job or {}).get("status", "completed")}

