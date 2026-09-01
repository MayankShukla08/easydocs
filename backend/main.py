import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Allow running this file directly from the `backend` folder.
if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parent.parent))

from backend.api.v1.router import router as v1_router
from backend.config import ensure_data_dirs, get_settings
from backend.db.mongo import close_mongo, connect_mongo


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


@asynccontextmanager
async def _lifespan(_: FastAPI):
    connect_mongo()
    try:
        yield
    finally:
        close_mongo()


def create_app() -> FastAPI:
    _configure_logging()
    settings = get_settings()
    ensure_data_dirs()

    app = FastAPI(title=settings.app_name, lifespan=_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=r"^https:\/\/.*\.vercel\.app$|^http:\/\/localhost(:\d+)?$|^http:\/\/127\.0\.0\.1(:\d+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    @app.head("/")
    async def root():
        return {"status": "ok", "app": settings.app_name, "version": "1.0.0"}

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    app.include_router(v1_router)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    # Prefer package-mode startup from project root:
    #   uvicorn backend.main:app --reload
    # Keep script-mode fallback for `py .\main.py` inside `backend`.
    target = "backend.main:app" if __package__ else "main:app"
    uvicorn.run(target, host=host, port=port, reload=True)

