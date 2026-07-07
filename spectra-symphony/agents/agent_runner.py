"""
AgentRunner — executes a specialist agent run using OpenAI's Chat Completions API.
Each run is isolated: it gets a read-only snapshot of SpecContext and proposes updates.
"""

from dataclasses import dataclass
from typing import Dict, Any
from openai import AsyncOpenAI
from models.agent_run import AgentRun, AgentMessage
from models.spec_context import SpecContext
from orchestrator.specialist_pool import SPECIALIST_POOL
import json
import os
import logging

logger = logging.getLogger(__name__)


@dataclass
class AgentRunResult:
    output: str
    proposed_updates: Dict[str, Any]


class AgentRunner:
    def __init__(self):
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("[AgentRunner] No OpenAI API key configured. Set OPENAI_API_KEY to enable.")
        self.client = AsyncOpenAI(api_key=api_key or "sk-test")
        self.model = "gpt-4o"

    async def run(self, run: AgentRun, context: SpecContext) -> AgentRunResult:
        """Execute the agent run and return output + proposed context updates."""
        spec = SPECIALIST_POOL.get(run.agent_type)
        if not spec:
            raise ValueError(f"Unknown agent type: {run.agent_type}")

        system_prompt = self._build_system_prompt(spec, context)
        user_prompt = self._build_user_prompt(run, context)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # Add previous messages if this is a continuation
        for msg in run.messages:
            messages.append({"role": msg.role, "content": msg.content})

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.4,
                response_format={"type": "json_object"},
            )

            raw = response.choices[0].message.content
            parsed = json.loads(raw)

            # Record the message
            run.messages.append(AgentMessage(
                role="agent",
                agent_name=spec["display_name"],
                content=parsed.get("output", raw),
            ))

            return AgentRunResult(
                output=parsed.get("output", ""),
                proposed_updates=parsed.get("proposed_context_updates", {}),
            )
        except Exception as e:
            logger.error(f"[AgentRunner] {spec['display_name']} run failed: {e}")
            return AgentRunResult(
                output=f"Error: {str(e)}",
                proposed_updates={},
            )

    def _build_system_prompt(self, spec: dict, context: SpecContext) -> str:
        return f"""
{spec['instructions']}

You are part of Spectra — a spec-driven development orchestrator. You are running as an isolated agent for a single task.

The shared spec context (read-only) is provided to you. You must:
1. Analyse the task
2. Produce your specialist output
3. Propose updates to the shared spec context

You MUST respond with valid JSON in this exact format:
{{
  "output": "<your full specialist output as markdown>",
  "proposed_context_updates": {{
    // Only include fields you want to update in SpecContext
    // e.g. "api_contracts": {{}}, "acceptance_criteria": [], "system_design": ""
  }},
  "questions_for_po": [
    // Any questions you need the PO to answer (will be added to open_questions)
  ]
}}

Current SpecContext:
{context.model_dump_json(indent=2)}
"""

    def _build_user_prompt(self, run: AgentRun, context: SpecContext) -> str:
        return f"""
Task: {run.task_id}
Your role: {run.agent_type}

Please complete your specialist analysis and produce your output.
Remember to propose any updates to the shared spec context.
"""
