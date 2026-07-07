from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class StoryStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"
    REJECTED = "rejected"


class Story(BaseModel):
    """A user story derived from a feature, owned by a specialist agent."""
    id: str
    feature_id: str
    title: str
    description: str
    assigned_agent: str  # e.g. "backend_engineer", "frontend_engineer"
    status: StoryStatus = StoryStatus.PENDING
    linear_issue_id: Optional[str] = None
    task_ids: List[str] = Field(default_factory=list)
    output: Optional[str] = None  # agent's spec output for this story
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
