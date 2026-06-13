# 🔮 Spectra Dashboard

Real-time localhost dashboard for monitoring agent runs, pipeline state, and sprint progress.

## Quick Start

### 1. Backend (FastAPI)
```bash
cd spectra-symphony/dashboard
cp .env.example .env
# Fill in BASE44_SERVICE_TOKEN, SPRINT_ID, WHATSAPP_RECIPIENT

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
| `BASE44_SERVICE_TOKEN` | Service token from Base44 app settings |
| `SPRINT_ID` | ID of the sprint to monitor |
| `WHATSAPP_RECIPIENT` | PO's WhatsApp number (e.g. `+491234567890`) |
| `PORT` | Dashboard port (default: `8044`) |

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
