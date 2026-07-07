from typing import Dict, Any
from models.spec_context import SpecContext
from datetime import datetime


class ContextMerger:
    """
    Orchestrator-owned merger. Agents propose updates via AgentRun.proposed_context_updates.
    Only the orchestrator calls merge() — agents never write directly to SpecContext.
    """

    def merge(
        self,
        context: SpecContext,
        proposed_updates: Dict[str, Any],
        agent_type: str,
    ) -> SpecContext:
        """
        Merge an agent's proposed updates into the shared SpecContext.
        List fields are appended (deduped). String fields are overwritten if non-empty.
        Dict fields are shallow-merged.
        """
        updated = context.model_copy(deep=True)

        for field, value in proposed_updates.items():
            if not hasattr(updated, field):
                continue  # ignore unknown fields

            current = getattr(updated, field)

            if isinstance(current, list) and isinstance(value, list):
                # Append and deduplicate
                merged = current + [v for v in value if v not in current]
                setattr(updated, field, merged)

            elif isinstance(current, dict) and isinstance(value, dict):
                # Shallow merge — agent additions win on key conflicts
                merged_dict = {**current, **value}
                setattr(updated, field, merged_dict)

            elif isinstance(value, str) and value.strip():
                # Overwrite string fields if agent provides a non-empty value
                setattr(updated, field, value)

            elif value is not None:
                setattr(updated, field, value)

        updated.last_updated_by = agent_type
        updated.version += 1
        updated.updated_at = datetime.utcnow()

        return updated
