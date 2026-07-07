from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    BLOCKED = "blocked"
    DONE = "done"
    FAILED = "failed"


class Task(BaseModel):
    """An atomic unit of work within a story, executed by a sub-agent."""
    id: str
    story_id: str
    feature_id: str
    title: str
    description: str
    assigned_agent: str
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = Field(default_factory=list)  # task_ids that must complete first
    output: Optional[str] = None
    error: Optional[str] = None
    linear_issue_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
