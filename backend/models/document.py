from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class DocumentInDB(BaseModel):
    doc_id: str
    user_id: Optional[str] = None
    file_name: str
    file_path: str
    sha256: str
    mime_type: str
    status: str = "uploaded"
    error: Optional[str] = None
    summary: Optional[str] = None
    summary_detailed: Optional[str] = None
    key_points: list[str] = Field(default_factory=list)
    precomputed_qa: list[dict[str, str]] = Field(default_factory=list)
    embedding_provider: Optional[str] = None
    llm_provider: Optional[str] = None
    precompute_provider: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    extra: dict[str, Any] = Field(default_factory=dict)

