"""
Spectra Run Dashboard — localhost:8044
Run: python dashboard.py
"""

import os
import time
import asyncio
import httpx
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Provider-agnostic token resolution
# Priority: SPECTRA_API_TOKEN → BASE44_SERVICE_TOKEN (legacy fallback)
# To switch providers, update SPECTRA_API_BASE + SPECTRA_API_TOKEN in .env
# ---------------------------------------------------------------------------
PROVIDER        = os.getenv("SPECTRA_PROVIDER", "base44")
BASE44_APP_ID   = os.getenv("BASE44_APP_ID", "69f19298360c8dc869b3fd9b")

API_TOKEN       = (
    os.getenv("SPECTRA_API_TOKEN") or
    os.getenv("BASE44_SERVICE_TOKEN", "")
)
API_BASE        = os.getenv(
    "SPECTRA_API_BASE",
    f"https://api.base44.com/api/apps/{BASE44_APP_ID}/entities"
)

# Header format per provider — extend this dict when adding new providers
_HEADER_FORMATS = {
    "base44":   lambda t: {"x-api-key": t, "Content-Type": "application/json"},
    "supabase": lambda t: {"Authorization": f"Bearer {t}", "apikey": t, "Content-Type": "application/json"},
    "custom":   lambda t: {"Authorization": f"Bearer {t}", "Content-Type": "application/json"},
}
HEADERS = _HEADER_FORMATS.get(PROVIDER, _HEADER_FORMATS["custom"])(API_TOKEN)

# WhatsApp send URL — also provider-resolved
WA_SEND_URL = os.getenv(
    "SPECTRA_WA_SEND_URL",
    f"https://api.base44.com/api/apps/{BASE44_APP_ID}/whatsapp/send"
)

SPRINT_ID       = os.getenv("SPRINT_ID", "")
WA_RECIPIENT    = os.getenv("WHATSAPP_RECIPIENT", "")
PORT            = int(os.getenv("PORT", "8044"))
POLL_INTERVAL   = 3  # seconds

# In-memory cache
_cache: dict = {}
_last_poll: float = 0


def iso_to_elapsed(iso: str) -> str:
    """Convert ISO timestamp to human-readable elapsed time string."""
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        elapsed = int((datetime.now(timezone.utc) - dt).total_seconds())
        if elapsed < 60:
            return f"{elapsed}s ago"
        elif elapsed < 3600:
            return f"{elapsed // 60}m {elapsed % 60}s ago"
        else:
            return f"{elapsed // 3600}h {(elapsed % 3600) // 60}m ago"
    except Exception:
        return "—"


def iso_to_timer(iso: str) -> str:
    """Convert start ISO to MM:SS elapsed timer string."""
    if not iso:
        return "00:00"
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        elapsed = int((datetime.now(timezone.utc) - dt).total_seconds())
        return f"{elapsed // 60:02d}:{elapsed % 60:02d}"
    except Exception:
        return "00:00"


def duration_seconds(start: str, end: str) -> int:
    if not start or not end:
        return 0
    try:
        s = datetime.fromisoformat(start.replace("Z", "+00:00"))
        e = datetime.fromisoformat(end.replace("Z", "+00:00"))
        return int((e - s).total_seconds())
    except Exception:
        return 0


async def fetch_entity(client: httpx.AsyncClient, entity: str, params: dict = None) -> list:
    url = f"{API_BASE}/{entity}"
    resp = await client.get(url, headers=HEADERS, params=params or {})
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data if isinstance(data, list) else data.get("records", [])


async def poll_backend():
    """Poll entity store and update in-memory cache."""
    global _cache, _last_poll

    async with httpx.AsyncClient(timeout=10) as client:
        # Fetch sprint
        sprints = await fetch_entity(client, "Sprint", {"id": SPRINT_ID} if SPRINT_ID else {})
        sprint = next((s for s in sprints if s.get("id") == SPRINT_ID), sprints[0] if sprints else {})

        # Fetch all issues for sprint
        issues = await fetch_entity(client, "Issue", {"sprint_id": sprint.get("id", "")} if sprint else {})

        # Fetch recent agent runs
        runs = await fetch_entity(client, "AgentRun", {"sprint_id": sprint.get("id", "")} if sprint else [])

        # Sprint progress
        total = len(issues)
        done = sum(1 for i in issues if i.get("status") == "done")
        progress_pct = round((done / total * 100) if total > 0 else 0)

        # Active runs
        active_runs = [
            {
                "id": r.get("id"),
                "issue_title": next((i.get("title", "Unknown") for i in issues if i.get("id") == r.get("issue_id")), "Unknown"),
                "agent_type": r.get("agent_type", "—"),
                "status": r.get("status", "—"),
                "started_at": r.get("started_at", ""),
                "elapsed": iso_to_timer(r.get("started_at", "")),
            }
            for r in runs if r.get("status") in ("running", "in_progress")
        ]

        # Pipeline queue: in_progress first, then backlog, ordered by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        status_order = {"in_progress": 0, "backlog": 1, "todo": 2}
        pipeline = sorted(
            [i for i in issues if i.get("status") not in ("done", "cancelled")],
            key=lambda i: (
                status_order.get(i.get("status", ""), 9),
                priority_order.get(i.get("priority", ""), 9)
            )
        )

        # Recent completions (last 5)
        completed_runs = sorted(
            [r for r in runs if r.get("status") == "completed" and r.get("completed_at")],
            key=lambda r: r.get("completed_at", ""),
            reverse=True
        )[:5]

        recent_completions = [
            {
                "id": r.get("id"),
                "issue_title": next((i.get("title", "Unknown") for i in issues if i.get("id") == r.get("issue_id")), "Unknown"),
                "agent_type": r.get("agent_type", "—"),
                "completed_at": r.get("completed_at", ""),
                "elapsed": iso_to_elapsed(r.get("completed_at", "")),
                "duration_seconds": duration_seconds(r.get("started_at", ""), r.get("completed_at", "")),
            }
            for r in completed_runs
        ]

        _cache = {
            "provider": PROVIDER,
            "sprint": {
                "id": sprint.get("id", ""),
                "name": sprint.get("name", "No active sprint"),
                "status": sprint.get("status", "—"),
                "goal": sprint.get("goal", ""),
                "total_issues": total,
                "done_issues": done,
                "progress_pct": progress_pct,
            },
            "active_runs": active_runs,
            "pipeline": [
                {
                    "id": i.get("id"),
                    "title": i.get("title", ""),
                    "status": i.get("status", ""),
                    "priority": i.get("priority", ""),
                    "type": i.get("type", ""),
                    "assigned_agent": i.get("assigned_agent", ""),
                }
                for i in pipeline
            ],
            "recent_completions": recent_completions,
            "polled_at": datetime.now(timezone.utc).isoformat(),
        }
        _last_poll = time.time()


async def background_poller():
    """Background task that polls the entity store every POLL_INTERVAL seconds."""
    while True:
        try:
            await poll_backend()
        except Exception as e:
            print(f"[poll error] {e}")
        await asyncio.sleep(POLL_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(background_poller())
    yield
    task.cancel()


app = FastAPI(title="Spectra Dashboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
async def get_status():
    if not _cache:
        try:
            await poll_backend()
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
    return JSONResponse(_cache)


@app.post("/api/approve")
async def send_approval():
    """Trigger WhatsApp approval message to PO."""
    sprint = _cache.get("sprint", {})
    if not sprint:
        raise HTTPException(status_code=400, detail="No active sprint data")
    if not WA_RECIPIENT:
        raise HTTPException(status_code=400, detail="WHATSAPP_RECIPIENT not configured")

    message = (
        f"🔮 *Spectra Sprint Update*\n\n"
        f"*{sprint.get('name', 'Sprint')}* is ready for review.\n\n"
        f"✅ {sprint.get('done_issues', 0)}/{sprint.get('total_issues', 0)} issues complete "
        f"({sprint.get('progress_pct', 0)}%)\n\n"
        f"Reply *APPROVE* to merge & push spec to GitHub, or *REJECT <feedback>* to send back for revision."
    )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            WA_SEND_URL,
            headers=HEADERS,
            json={"to": WA_RECIPIENT, "message": message},
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"WhatsApp send failed: {resp.text}")

    return {"ok": True, "message": "Approval request sent to PO"}


# Serve React frontend
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(FRONTEND_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{path:path}")
    async def serve_spa(path: str):
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
else:
    @app.get("/")
    async def dev_mode():
        return {"message": "Frontend not built yet. Run: cd frontend && npm install && npm run build"}


if __name__ == "__main__":
    import uvicorn
    print(f"\n🔮 Spectra Dashboard [{PROVIDER}] starting on http://localhost:{PORT}\n")
    uvicorn.run("dashboard:app", host="0.0.0.0", port=PORT, reload=False)
