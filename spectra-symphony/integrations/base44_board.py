"""
Base44 Board Client — replaces LinearClient entirely.
Reads/writes Issues, Sprints, SpecContext, AgentRuns, and SprintLearnings
directly via Base44 entity CRUD. No external API calls. No credits burned.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx
import os

BASE44_API = "https://api.base44.com/api/apps"
APP_ID = os.environ.get("BASE44_APP_ID", "69f19298360c8dc869b3fd9b")


class Base44BoardClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("BASE44_API_KEY", "")
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        self.base = f"{BASE44_API}/{APP_ID}/entities"

    # -------------------------------------------------------------------------
    # ISSUES
    # -------------------------------------------------------------------------

    async def fetch_new_issues(self, status: str = "todo") -> List[Dict[str, Any]]:
        """Fetch issues with a given status that haven't been assigned an agent yet."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base}/Issue",
                params={"status": status, "assigned_agent": ""},
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json().get("records", [])

    async def create_issue(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base}/Issue",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def update_issue(self, issue_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base}/Issue/{issue_id}",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_sprint_issues(self, sprint_id: str) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base}/Issue",
                params={"sprint_id": sprint_id},
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json().get("records", [])

    # -------------------------------------------------------------------------
    # SPRINTS
    # -------------------------------------------------------------------------

    async def get_sprint(self, sprint_id: str) -> Optional[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base}/Sprint/{sprint_id}",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def update_sprint(self, sprint_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base}/Sprint/{sprint_id}",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    # -------------------------------------------------------------------------
    # SPEC CONTEXT
    # -------------------------------------------------------------------------

    async def get_spec_context(self, issue_id: str) -> Optional[Dict[str, Any]]:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base}/SpecContext",
                params={"issue_id": issue_id},
                headers=self.headers,
            )
            response.raise_for_status()
            records = response.json().get("records", [])
            return records[0] if records else None

    async def upsert_spec_context(self, issue_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.get_spec_context(issue_id)
        async with httpx.AsyncClient() as client:
            if existing:
                response = await client.put(
                    f"{self.base}/SpecContext/{existing['id']}",
                    json={**data, "version": existing.get("version", 0) + 1},
                    headers=self.headers,
                )
            else:
                response = await client.post(
                    f"{self.base}/SpecContext",
                    json={**data, "issue_id": issue_id, "version": 1},
                    headers=self.headers,
                )
            response.raise_for_status()
            return response.json()

    # -------------------------------------------------------------------------
    # AGENT RUNS
    # -------------------------------------------------------------------------

    async def create_agent_run(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base}/AgentRun",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def update_agent_run(self, run_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{self.base}/AgentRun/{run_id}",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    # -------------------------------------------------------------------------
    # SPRINT LEARNINGS
    # -------------------------------------------------------------------------

    async def save_sprint_learning(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base}/SprintLearning",
                json=data,
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_all_learnings(self) -> List[Dict[str, Any]]:
        """Retrieve all accumulated sprint learnings for reuse in future projects."""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base}/SprintLearning",
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json().get("records", [])

    # -------------------------------------------------------------------------
    # COMMENTS
    # -------------------------------------------------------------------------

    async def add_comment(self, issue_id: str, content: str, agent_role: str = "", author_type: str = "agent") -> Dict[str, Any]:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base}/IssueComment",
                json={
                    "issue_id": issue_id,
                    "content": content,
                    "author_type": author_type,
                    "agent_role": agent_role,
                    "author_name": agent_role or "Spectra",
                },
                headers=self.headers,
            )
            response.raise_for_status()
            return response.json()
