from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ApprovalRequest(BaseModel):
    """Sent to the PO via WhatsApp when a sprint is ready for review."""
    id: str
    sprint_id: str
    feature_id: str
    message: str  # WhatsApp message content
    status: ApprovalStatus = ApprovalStatus.PENDING
    feedback: Optional[str] = None  # PO's rejection feedback
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    responded_at: Optional[datetime] = None
