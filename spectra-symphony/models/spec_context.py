from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime


class SpecContext(BaseModel):
    """
    Shared spec context for a feature.
    All agents can READ this. Only the orchestrator can WRITE to it.
    Agents propose updates via AgentRun.proposed_context_updates.
    """
    feature_id: str

    # Architecture
    system_design: Optional[str] = None
    tech_stack: List[str] = Field(default_factory=list)
    architecture_diagram: Optional[str] = None  # Mermaid or ASCII

    # Data
    data_models: Dict[str, Any] = Field(default_factory=dict)  # entity_name -> schema

    # API
    api_contracts: Dict[str, Any] = Field(default_factory=dict)  # endpoint -> spec

    # Frontend
    ui_flows: Optional[str] = None
    component_tree: Optional[str] = None

    # QA
    acceptance_criteria: List[str] = Field(default_factory=list)
    edge_cases: List[str] = Field(default_factory=list)
    test_scenarios: List[str] = Field(default_factory=list)

    # Security
    auth_requirements: Optional[str] = None
    risk_notes: List[str] = Field(default_factory=list)

    # Open questions (PO must answer)
    open_questions: List[str] = Field(default_factory=list)

    # Dev stage
    dev_stage: Optional[str] = None  # greenfield | prototype | active | production
    recommended_output_format: Optional[str] = None

    # Audit
    last_updated_by: Optional[str] = None  # agent_type that last proposed a merge
    version: int = 0
    updated_at: datetime = Field(default_factory=datetime.utcnow)
