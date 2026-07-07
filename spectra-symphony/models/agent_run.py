from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class AgentRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_PO = "waiting_po"  # blocked on PO response
    COMPLETED = "completed"
    FAILED = "failed"


class AgentMessage(BaseModel):
    """A single message in an agent's conversation."""
    role: str  # system | user | agent
    agent_name: Optional[str] = None
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AgentRun(BaseModel):
    """
    An isolated execution run for a specialist agent on a task or story.
    Inspired by Symphony's isolated run primitive.
    """
    id: str
    task_id: str
    story_id: str
    feature_id: str
    agent_type: str  # architect | backend_engineer | frontend_engineer | qa_engineer | etc.
    status: AgentRunStatus = AgentRunStatus.QUEUED
    messages: List[AgentMessage] = Field(default_factory=list)
    context_snapshot: Dict[str, Any] = Field(default_factory=dict)  # read-only copy of SpecContext at run start
    proposed_context_updates: Dict[str, Any] = Field(default_factory=dict)  # agent proposes, orchestrator merges
    output: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
