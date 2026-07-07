from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SprintStatus(str, Enum):
    ACTIVE = "active"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    COMPLETED = "completed"


class Sprint(BaseModel):
    """A sprint groups stories for a feature and tracks completion + approval."""
    id: str
    feature_id: str
    name: str
    story_ids: List[str] = Field(default_factory=list)
    status: SprintStatus = SprintStatus.ACTIVE
    linear_cycle_id: Optional[str] = None
    spec_output: Optional[str] = None  # final merged spec doc
    github_repo_url: Optional[str] = None
    rejection_feedback: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
