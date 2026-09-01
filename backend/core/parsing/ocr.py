from __future__ import annotations

import io
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def ocr_pdf_images(path: Path, max_pages: int = 25) -> list[tuple[int, str]]:
    """
    Extract embedded images from PDF pages and run OCR on each page's images if pytesseract and Pillow are available.
    Returns a list of (page_num, extracted_ocr_text) tuples.
    """
    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow is not installed; skipping OCR image extraction")
        return []

    try:
        import pytesseract
    except ImportError:
        logger.warning("pytesseract is not installed; skipping OCR image extraction")
        return []

    try:
        import pypdf
        reader = pypdf.PdfReader(str(path))
    except Exception as e:
        logger.warning("Failed to open PDF %s for OCR: %s", path.name, e)
        return []

    results: list[tuple[int, str]] = []
    total_images_scanned = 0
    tesseract_available = True

    for page_idx, page in enumerate(reader.pages[:max_pages], start=1):
        if not tesseract_available:
            break

        page_texts: list[str] = []
        try:
            images = list(getattr(page, "images", []))
            for img_obj in images:
                total_images_scanned += 1
                try:
                    img_data = getattr(img_obj, "data", None)
                    if not img_data:
                        continue
                    img = Image.open(io.BytesIO(img_data))
                    # Skip tiny thumbnail/icon images
                    if img.width < 50 or img.height < 50:
                        continue
                    text = pytesseract.image_to_string(img)
                    cleaned = text.strip()
                    if cleaned:
                        page_texts.append(cleaned)
                except pytesseract.TesseractNotFoundError:
                    logger.warning("Tesseract OCR binary not found on system PATH; OCR unavailable on this host.")
                    tesseract_available = False
                    break
                except Exception as img_err:
                    logger.debug("Failed OCR on image in page %d: %s", page_idx, img_err)
        except Exception as page_err:
            logger.debug("Failed extracting images from page %d: %s", page_idx, page_err)

        if page_texts:
            results.append((page_idx, "\n".join(page_texts)))

    logger.info(
        "OCR image scan complete for %s: %d images scanned, %d pages produced OCR text",
        path.name,
        total_images_scanned,
        len(results),
    )
    return results


def ocr_fallback(path: Path) -> str:
    """
    OCR fallback returning merged text across all OCR'd pages.
    """
    page_results = ocr_pdf_images(path)
    return "\n\n".join(text for _, text in page_results if text.strip())


