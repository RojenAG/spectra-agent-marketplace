# 🔮 Spectra Dashboard

Real-time localhost dashboard for monitoring agent runs, pipeline state, and sprint progress.

## Quick Start

### 1. Backend (FastAPI)
```bash
cd spectra-symphony/dashboard
cp .env.example .env
# Fill in SPECTRA_API_TOKEN, SPRINT_ID, WHATSAPP_RECIPIENT

pip install -r requirements.txt
python dashboard.py
```

### 2. Frontend (React + Vite)
```bash
cd spectra-symphony/dashboard/frontend
npm install
npm run build
```

Then restart `dashboard.py` — it serves the built frontend automatically.

### Dev mode (hot reload)
```bash
# Terminal 1
python dashboard.py

# Terminal 2
cd frontend && npm run dev
# Opens on localhost:5173 with proxy to localhost:8044
```

---

## What you see

| Panel | Description |
|---|---|
| **Sprint Header** | Sprint name, status badge, goal, progress bar (done/total issues + %) |
| **Active Runs** | Live agent runs with type emoji, issue title, status, and ticking MM:SS timer |
| **Pipeline Queue** | All non-done issues ordered by status then priority, scrollable |
| **Recent Completions** | Last 5 completed agent runs with duration and elapsed time |
| **📱 Request Approval** | Sends WhatsApp message to PO with sprint summary + APPROVE/REJECT prompt |

---

## Config (`.env`)

| Variable | Description |
|---|---|
| `BASE44_APP_ID` | Your Base44 app ID (pre-filled) |
| `SPECTRA_API_TOKEN` | Scoped API token — READ-ONLY on AgentRun and Sprint entities only (see Token Scope Policy below) |
| `SPRINT_ID` | ID of the sprint to monitor |
| `WHATSAPP_RECIPIENT` | PO's WhatsApp number (e.g. `+491234567890`) |
| `PORT` | Dashboard port (default: `8044`) |

---

## 🔐 Token Scope Policy (SPECTRA_API_TOKEN)

The dashboard uses a scoped token — NOT a full service role token.

**Allowed operations:**
- `AgentRun` — READ only (list, get)
- `Sprint` — READ only (list, get)

**Forbidden operations (must use service-role via backend functions):**
- Any WRITE to AgentRun, Sprint, or any other entity
- Any access to AgentListing, AgentListingVersion, SpaceLog, AgentAnalytics
- Any moderation_status updates (service-role only, enforced in publishAgent function)

**Why:** The dashboard is a read-only monitoring surface. If the token is ever leaked (e.g. in browser network logs), an attacker can only read run and sprint data — they cannot modify records, approve agents, or access author data.

**Rotation:** Rotate SPECTRA_API_TOKEN immediately if you suspect it has been exposed. The token has no write permissions so exposure is low-risk, but rotation is still best practice.

---

## 🔒 RLS Policy — Entity Isolation

The following entities have Row-Level Security enforced. Non-admin users can only access their own records.

| Entity | RLS | Read policy | Write policy |
|---|---|---|---|
| AgentListing | ✅ Required | Public read (is_published=true) via searchAgents function; draft read = own only | Own only |
| AgentListingVersion | ✅ Required | Own only (author); service-role for moderation_status | Own only; moderation_status via service-role only |
| SpaceLog | ✅ Required | Own only (author) | Own only |
| AgentAnalytics | ✅ Required | Own only (author) | Service-role only (system writes) |

**Moderation bypass prevention:** The `publishAgent` backend function uses `base44.asServiceRole` to create records, but sets `moderation_status: "pending"` explicitly — authors cannot self-approve by passing a different status in the request body.

---

## Architecture

```
dashboard.py  (FastAPI)
  ├── Background task: polls Base44 REST API every 3s → in-memory cache
  ├── GET /api/status → returns cached sprint + runs + pipeline + completions
  ├── POST /api/approve → sends WhatsApp message to PO
  └── Serves frontend/dist/ as static files

frontend/  (React + Vite)
  ├── App.jsx — polls /api/status every 3s, renders panels
  ├── SprintHeader — progress bar
  ├── ActiveRuns — live timers (tick locally every 1s)
  ├── PipelineQueue — ordered issue list
  ├── RecentCompletions — last 5 done runs
  └── ApprovalButton — POST /api/approve
```
