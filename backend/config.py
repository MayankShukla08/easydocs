import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent
REPO_ROOT = ROOT_DIR.parent
DATA_DIR = ROOT_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
FAISS_DIR = DATA_DIR / "faiss"


def _load_env() -> None:
    # Repo root first, then backend/.env wins (so keys in backend/.env apply even if
    # empty vars exist in the process environment from a partial Windows user env).
    load_dotenv(dotenv_path=REPO_ROOT / ".env", override=False)
    load_dotenv(dotenv_path=ROOT_DIR / ".env", override=True)


def _env_secret(name: str) -> str | None:
    val = os.getenv(name)
    if val is None:
        return None
    val = val.strip()
    return val if val else None


@dataclass(frozen=True)
class Settings:
    app_name: str = "EasyDocs"
    env: str = "dev"

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "easydocs"

    max_upload_mb: int = 100
    ocr_text_threshold_chars: int = 250

    embedding_dim: int = 384

    gemini_api_key: str | None = None
    openai_api_key: str | None = None

    groq_api_key: str | None = None
    openrouter_api_key: str | None = None

    request_timeout_s: int = 30
    cors_origins: list[str] = field(default_factory=list)


def get_settings() -> Settings:
    _load_env()

    def _get_int(name: str, default: int) -> int:
        val = os.getenv(name)
        if not val:
            return default
        try:
            return int(val)
        except ValueError:
            return default

    def _get_list(name: str, default: list[str]) -> list[str]:
        val = os.getenv(name)
        if not val:
            return default
        items = [part.strip() for part in val.split(",")]
        return [item for item in items if item]

    default_cors_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
        "https://easydocs-mu.vercel.app",
    ]

    return Settings(
        app_name=os.getenv("APP_NAME", "EasyDocs"),
        env=os.getenv("ENV", "dev"),
        mongo_uri=os.getenv("MONGO_URI", "mongodb://localhost:27017"),
        mongo_db=os.getenv("MONGO_DB", "easydocs"),
        max_upload_mb=_get_int("MAX_UPLOAD_MB", 100),
        ocr_text_threshold_chars=_get_int("OCR_TEXT_THRESHOLD_CHARS", 250),
        embedding_dim=_get_int("EMBEDDING_DIM", 384),
        gemini_api_key=_env_secret("GEMINI_API_KEY"),
        openai_api_key=_env_secret("OPENAI_API_KEY"),
        groq_api_key=_env_secret("GROQ_API_KEY"),
        openrouter_api_key=_env_secret("OPENROUTER_API_KEY"),
        request_timeout_s=_get_int("REQUEST_TIMEOUT_S", 30),
        cors_origins=_get_list("CORS_ORIGINS", default_cors_origins),
    )


def ensure_data_dirs() -> None:
    for p in (DATA_DIR, UPLOADS_DIR, FAISS_DIR):
        p.mkdir(parents=True, exist_ok=True)

