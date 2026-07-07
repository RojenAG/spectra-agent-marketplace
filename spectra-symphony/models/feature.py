from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class Feature(BaseModel):
    """Top-level feature as described by the PO."""
    id: str
    title: str
    description: str
    linear_issue_id: Optional[str] = None
    dev_stage: Optional[str] = None  # greenfield | prototype | active | production
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
