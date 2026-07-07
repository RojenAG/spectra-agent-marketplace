"""
Spectra Orchestrator — adapted for Base44-native board (no Linear dependency).

Flow:
  Base44 Issues (todo) → decompose → child Issues per specialist
  → parallel AgentRuns → merge into SpecContext
  → Sprint pending_approval → WhatsApp PO
  → approved: GitHub repo + SprintLearning saved
  → rejected: feedback into SpecContext → reset issues → re-run
"""

import asyncio
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, List, Optional, Any

from models.spec_context import SpecContext as SpecContextModel
from orchestrator.specialist_pool import pick_specialists, SPECIALIST_POOL, Specialist
from orchestrator.context_merger import ContextMerger
from agents.agent_runner import AgentRunner
from integrations.base44_board import Base44BoardClient
from integrations.github_client import GitHubClient
from integrations.whatsapp_client import WhatsAppClient


class Orchestrator:
    def __init__(
        self,
        board: Base44BoardClient,
        github: GitHubClient,
        whatsapp: WhatsAppClient,
        max_parallel_runs: int = 5,
    ):
        self.board = board
        self.github = github
        self.whatsapp = whatsapp
        self.merger = ContextMerger()
        self.runner = AgentRunner()
        self.executor = ThreadPoolExecutor(max_workers=max_parallel_runs)

    # -------------------------------------------------------------------------
    # ENTITY TRIGGER ENTRY POINTS
    # -------------------------------------------------------------------------

    async def on_issue_created_or_updated(self, event_type: str, issue: dict, old_issue: dict = None):
        """Called by Base44 entity automation on Issue create/update."""
        status = issue.get("status")
        issue_type = issue.get("type")

        # New top-level feature/story dropped into todo → decompose it
        if event_type == "create" and status == "todo" and issue_type in ("feature", "story"):
            await self.decompose_issue(issue)

        # A child task (assigned to agent) moved to todo → run the agent
        elif status == "todo" and issue.get("assigned_agent"):
            await self._run_agent_for_issue(issue)

        # A child task completed → check if sprint is done
        elif status == "done" and issue.get("sprint_id"):
            await self._check_sprint_completion(issue["sprint_id"])

    async def on_sprint_status_changed(self, sprint: dict):
        """Called by Base44 entity automation on Sprint update."""
        status = sprint.get("status")
        if status == "approved":
            await self._create_github_repo(sprint)
        elif status == "rejected":
            await self._handle_rejection(sprint)

    # -------------------------------------------------------------------------
    # ISSUE DECOMPOSITION
    # -------------------------------------------------------------------------

    async def decompose_issue(self, issue: dict):
        """Split a top-level issue into specialist sub-issues and queue agent runs."""
        print(f"[Spectra] Decomposing issue: {issue['title']}")

        specialists = pick_specialists(
            issue.get("description", "") + " " + issue.get("title", "")
        )

        # Mark parent as in_progress
        await self.board.update_issue(issue["id"], {
            "status": "in_progress",
            "assigned_agent": "orchestrator",
        })

        # Create SpecContext for this issue
        await self.board.upsert_spec_context(issue["id"], {
            "sprint_id": issue.get("sprint_id", ""),
            "dev_stage": "greenfield",
            "version": 0,
            "tech_stack": [],
            "acceptance_criteria": [],
            "edge_cases": [],
            "test_scenarios": [],
            "risk_notes": [],
            "open_questions": [],
        })

        # Spawn child issues — one per specialist
        for specialist in specialists:
            spec = SPECIALIST_POOL[specialist]
            child = await self.board.create_issue({
                "title": f"[{spec['display_name']}] {issue['title']}",
                "description": f"Define the {spec['focus']} for:\n\n{issue.get('description', '')}",
                "project_id": issue.get("project_id", ""),
                "sprint_id": issue.get("sprint_id", ""),
                "parent_issue_id": issue["id"],
                "type": "task",
                "status": "todo",
                "priority": issue.get("priority", "medium"),
                "assigned_agent": specialist.value,
            })
            print(f"[Spectra] Created child issue for {spec['display_name']}: {child['id']}")

    # -------------------------------------------------------------------------
    # PARALLEL AGENT EXECUTION
    # -------------------------------------------------------------------------

    async def run_pending_agent_issues(self):
        """
        Fetch all todo issues with an assigned_agent and run them in parallel.
        Called by cron or triggered by entity automation.
        """
        issues = await self.board.fetch_new_issues(status="todo")
        agent_issues = [i for i in issues if i.get("assigned_agent") and i["assigned_agent"] != "orchestrator"]

        if not agent_issues:
            return

        print(f"[Spectra] Running {len(agent_issues)} agent issues in parallel")
        loop = asyncio.get_event_loop()
        await asyncio.gather(*[
            loop.run_in_executor(self.executor, lambda i=issue: asyncio.run(self._run_agent_for_issue(i)))
            for issue in agent_issues
        ])

    async def _run_agent_for_issue(self, issue: dict):
        """Run a specialist agent for a single child issue."""
        agent_type = issue.get("assigned_agent")
        spec = SPECIALIST_POOL.get(agent_type)  # type: ignore
        if not spec:
            return

        print(f"[{agent_type}] Running on: {issue['title']}")

        # Create AgentRun record
        run_record = await self.board.create_agent_run({
            "issue_id": issue["id"],
            "sprint_id": issue.get("sprint_id", ""),
            "agent_type": agent_type,
            "status": "running",
            "started_at": datetime.utcnow().isoformat(),
        })

        # Update issue to in_progress
        await self.board.update_issue(issue["id"], {"status": "in_progress"})

        # Load current SpecContext
        parent_context_raw = await self.board.get_spec_context(issue.get("parent_issue_id", issue["id"]))
        context = SpecContextModel(
            feature_id=issue.get("parent_issue_id", issue["id"]),
            **(parent_context_raw or {}),
        )

        # Import here to avoid circular at module level
        from models.agent_run import AgentRun as AgentRunModel, AgentRunStatus

        run_model = AgentRunModel(
            id=run_record["id"],
            task_id=issue["id"],
            story_id=issue.get("parent_issue_id", issue["id"]),
            feature_id=issue.get("parent_issue_id", issue["id"]),
            agent_type=agent_type,
            status=AgentRunStatus.RUNNING,
            started_at=datetime.utcnow(),
            context_snapshot=context.model_dump(),
        )

        try:
            result = await self.runner.run(run_model, context)

            # Merge proposed updates into SpecContext
            updated_context = self.merger.merge(
                context=context,
                proposed_updates=result.proposed_updates,
                agent_type=agent_type,
            )
            await self.board.upsert_spec_context(
                issue.get("parent_issue_id", issue["id"]),
                updated_context.model_dump(),
            )

            # Update AgentRun record
            await self.board.update_agent_run(run_record["id"], {
                "status": "completed",
                "output": result.output,
                "proposed_context_updates": result.proposed_updates,
                "completed_at": datetime.utcnow().isoformat(),
            })

            # Mark issue done + post comment with output
            await self.board.update_issue(issue["id"], {
                "status": "done",
                "completed_at": datetime.utcnow().isoformat(),
            })
            await self.board.add_comment(
                issue_id=issue["id"],
                content=result.output,
                agent_role=spec["display_name"],
            )

            print(f"[{agent_type}] Completed: {issue['title']}")

        except Exception as e:
            await self.board.update_agent_run(run_record["id"], {
                "status": "failed",
                "error": str(e),
                "completed_at": datetime.utcnow().isoformat(),
            })
            await self.board.update_issue(issue["id"], {"status": "todo"})  # requeue
            print(f"[{agent_type}] Failed: {e}")

    # -------------------------------------------------------------------------
    # SPRINT COMPLETION CHECK
    # -------------------------------------------------------------------------

    async def _check_sprint_completion(self, sprint_id: str):
        """Check if all agent tasks in a sprint are done. If so, request PO approval."""
        issues = await self.board.get_sprint_issues(sprint_id)
        agent_tasks = [i for i in issues if i.get("assigned_agent") and i["assigned_agent"] != "orchestrator"]

        if not agent_tasks:
            return

        all_done = all(i["status"] == "done" for i in agent_tasks)
        if not all_done:
            return

        print(f"[Spectra] All tasks done for sprint {sprint_id} — requesting approval")

        # Find parent feature issue for spec context
        parent_issues = [i for i in issues if i.get("type") in ("feature", "story") and not i.get("parent_issue_id")]
        parent = parent_issues[0] if parent_issues else None
        context_raw = await self.board.get_spec_context(parent["id"]) if parent else {}

        spec_output = self._compile_spec(context_raw, agent_tasks, parent)

        # Update sprint to pending_approval
        sprint = await self.board.get_sprint(sprint_id)
        await self.board.update_sprint(sprint_id, {
            "status": "pending_approval",
            "spec_output": spec_output,
            "completed_at": datetime.utcnow().isoformat(),
        })

        # WhatsApp approval request
        preview = spec_output[:600] + "..." if len(spec_output) > 600 else spec_output
        await self.whatsapp.send_message(
            f"🎯 *Spectra — Sprint Ready for Review*\n\n"
            f"Sprint *{sprint.get('name', sprint_id)}* is complete.\n\n"
            f"📋 *Spec Preview:*\n_{preview}_\n\n"
            f"Reply *APPROVE {sprint_id}* to create the GitHub repo and lock the spec.\n"
            f"Reply *REJECT {sprint_id}: <your feedback>* to send the team back for revisions."
        )

    # -------------------------------------------------------------------------
    # APPROVAL HANDLERS
    # -------------------------------------------------------------------------

    async def _create_github_repo(self, sprint: dict):
        """On approval: create GitHub repo and push SPEC.md."""
        repo_name = sprint.get("name", f"spec-{sprint['id'][:8]}")
        print(f"[Spectra] Creating GitHub repo: {repo_name}")

        repo_url = await self.github.create_repo_and_push_spec(
            repo_name=repo_name,
            spec_content=sprint.get("spec_output", ""),
            description=sprint.get("goal", ""),
        )

        await self.board.update_sprint(sprint["id"], {
            "github_repo_url": repo_url,
            "status": "completed",
            "approved_at": datetime.utcnow().isoformat(),
        })

        await self._save_sprint_learnings(sprint)

        await self.whatsapp.send_message(
            f"✅ *Spectra — Approved & Shipped!*\n\n"
            f"Repo created: {repo_url}\n\n"
            f"Sprint learnings have been memorized for future projects. 🧠"
        )

    async def _handle_rejection(self, sprint: dict):
        """On rejection: inject feedback, reset tasks, re-run."""
        feedback = sprint.get("rejection_feedback", "")
        print(f"[Spectra] Sprint rejected. Feedback: {feedback}")

        # Inject feedback into SpecContext open_questions
        issues = await self.board.get_sprint_issues(sprint["id"])
        parent = next((i for i in issues if i.get("type") in ("feature", "story")), None)
        if parent:
            ctx = await self.board.get_spec_context(parent["id"])
            if ctx:
                oq = ctx.get("open_questions", [])
                oq.append(f"[PO Rejection Feedback] {feedback}")
                await self.board.upsert_spec_context(parent["id"], {"open_questions": oq})

        # Reset all agent task issues to todo
        for issue in issues:
            if issue.get("assigned_agent") and issue["assigned_agent"] != "orchestrator":
                await self.board.update_issue(issue["id"], {"status": "todo"})

        await self.board.update_sprint(sprint["id"], {"status": "active"})

        await self.whatsapp.send_message(
            f"🔄 *Spectra* — Feedback received. Team has been briefed and tasks reset.\n"
            f"We'll revise and come back with an updated spec."
        )

    # -------------------------------------------------------------------------
    # SPEC COMPILATION
    # -------------------------------------------------------------------------

    def _compile_spec(self, context: dict, tasks: List[dict], parent: Optional[dict]) -> str:
        lines = [f"# Spec: {parent['title'] if parent else 'Feature'}\n"]
        if parent and parent.get("description"):
            lines.append(f"_{parent['description']}_\n")

        if context.get("system_design"):
            lines.append(f"## System Design\n{context['system_design']}\n")
        if context.get("tech_stack"):
            lines.append(f"## Tech Stack\n" + "\n".join(f"- {t}" for t in context["tech_stack"]) + "\n")
        if context.get("data_models"):
            lines.append(f"## Data Models\n{context['data_models']}\n")
        if context.get("api_contracts"):
            lines.append(f"## API Contracts\n{context['api_contracts']}\n")
        if context.get("acceptance_criteria"):
            lines.append("## Acceptance Criteria\n" + "\n".join(f"- {a}" for a in context["acceptance_criteria"]) + "\n")
        if context.get("edge_cases"):
            lines.append("## Edge Cases\n" + "\n".join(f"- {e}" for e in context["edge_cases"]) + "\n")
        if context.get("open_questions"):
            lines.append("## Open Questions\n" + "\n".join(f"- {q}" for q in context["open_questions"]) + "\n")

        lines.append("## Agent Outputs\n")
        for task in tasks:
            lines.append(f"### {task.get('title', task['id'])}")
            lines.append(f"_{task.get('assigned_agent', '')}_\n")

        return "\n".join(lines)

    # -------------------------------------------------------------------------
    # SPRINT LEARNINGS
    # -------------------------------------------------------------------------

    async def _save_sprint_learnings(self, sprint: dict):
        issues = await self.board.get_sprint_issues(sprint["id"])
        parent = next((i for i in issues if i.get("type") in ("feature", "story")), None)
        ctx = await self.board.get_spec_context(parent["id"]) if parent else {}

        await self.board.save_sprint_learning({
            "sprint_id": sprint["id"],
            "project_name": sprint.get("name", ""),
            "tech_stack": ctx.get("tech_stack", []) if ctx else [],
            "patterns_used": ctx.get("system_design", "") if ctx else "",
            "data_models": list((ctx.get("data_models") or {}).keys()) if ctx else [],
            "key_decisions": ctx.get("system_design", "") if ctx else "",
            "reusable_skills": [],
        })
        print(f"[Spectra] Sprint learnings saved.")
