"""
Linear integration — polls for new issues and cycles (sprints).
Uses Linear's GraphQL API.
"""

import os
import httpx
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)
LINEAR_API_URL = "https://api.linear.app/graphql"


class LinearClient:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("LINEAR_API_KEY")
        if not self.api_key:
            logger.warning("[Linear] No API key configured. Set LINEAR_API_KEY to enable.")
        self.headers = {
            "Authorization": self.api_key or "",
            "Content-Type": "application/json",
        }
        self._seen_issue_ids: set = set()

    async def fetch_new_issues(self) -> List[Dict[str, Any]]:
        """Fetch issues from Linear that haven't been ingested yet."""
        if not self.api_key:
            logger.warning("[Linear] Skipping fetch — no API key configured.")
            return []

        query = """
        query {
          issues(filter: { state: { name: { eq: "Todo" } } }, first: 10) {
            nodes {
              id
              title
              description
              priority
              cycle {
                id
                name
              }
              labels {
                nodes { name }
              }
            }
          }
        }
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    LINEAR_API_URL,
                    json={"query": query},
                    headers=self.headers,
                )
                response.raise_for_status()
                data = response.json()

            if "errors" in data:
                logger.error(f"[Linear] GraphQL error: {data['errors']}")
                return []

            issues = data.get("data", {}).get("issues", {}).get("nodes", [])
            new_issues = []
            for issue in issues:
                if issue["id"] not in self._seen_issue_ids:
                    self._seen_issue_ids.add(issue["id"])
                    new_issues.append({
                        "id": issue["id"],
                        "title": issue["title"],
                        "description": issue.get("description") or "",
                        "cycle_id": issue.get("cycle", {}).get("id") if issue.get("cycle") else None,
                        "labels": [l["name"] for l in issue.get("labels", {}).get("nodes", [])],
                    })

            logger.info(f"[Linear] Fetched {len(new_issues)} new issues.")
            return new_issues

        except Exception as e:
            logger.error(f"[Linear] Fetch failed: {e}")
            return []

    async def update_issue_status(self, issue_id: str, state_name: str):
        """Update a Linear issue's state (e.g. 'In Progress', 'Done')."""
        if not self.api_key:
            return

        try:
            # First get the state ID
            query = """
            query GetStates {
              workflowStates {
                nodes { id name }
              }
            }
            """
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    LINEAR_API_URL,
                    json={"query": query},
                    headers=self.headers,
                )
                data = response.json()

            states = data.get("data", {}).get("workflowStates", {}).get("nodes", [])
            state = next((s for s in states if s["name"].lower() == state_name.lower()), None)
            if not state:
                return

            mutation = """
            mutation UpdateIssue($id: String!, $stateId: String!) {
              issueUpdate(id: $id, input: { stateId: $stateId }) {
                success
              }
            }
            """
            async with httpx.AsyncClient() as client:
                await client.post(
                    LINEAR_API_URL,
                    json={"query": mutation, "variables": {"id": issue_id, "stateId": state["id"]}},
                    headers=self.headers,
                )
        except Exception as e:
            logger.error(f"[Linear] Update failed: {e}")
