# spectra-agent-marketplace

Spec-driven development orchestrator + a live marketplace for the specialist
agents it produces: discover, publish, run, and review AI agents, all backed
by a full sprint lifecycle with WhatsApp-driven approvals.

This repo is maintained entirely by **Spectra**, a Base44 Superagent acting
as orchestrator — it plans sprints, assembles specialist engineers, builds
the features, runs QA, and pushes to GitHub on a branch-per-sprint basis
once the PO approves over WhatsApp.

---

## What's in here

**Spectra Symphony** (`spectra-symphony/`) — the orchestrator itself: polls
the board for work, spins up parallel specialist agents (Architect, Backend,
Frontend, QA, Security, Data, DevOps — summoned only as relevant per
feature), merges their output into a locked spec, and manages the
sprint → approval → merge cycle.

**The Marketplace** (`base44/`, `functions/`) — the product Spectra has been
building sprint over sprint: a place where authors publish agents (backed by
Hugging Face Spaces), other users discover and run them, leave reviews, and
authors get their own analytics dashboard.

---

## Architecture

```
Board (source of work)
    ↓ [cron poll]
Orchestrator (Spectra)
    ↓ [spawn parallel specialist agents per issue]
Specialist Agents (Architect, Backend, Frontend, QA, Security, Data, DevOps)
    ↓ [shared SpecContext — read all, propose writes]
Orchestrator merges -> Sprint spec locked -> QA pass
    ↓ [notify PO via WhatsApp for approval]
PO approves -> merge sprint branch to main, spec pushed, Sprint marked completed
PO rejects  -> feedback logged -> issues reset to in_progress -> loop
```

The marketplace itself follows a parallel publish -> moderate -> run cycle:

```
Author publishes AgentListingVersion
    ↓
Auto-moderation checks (name, description, space_url, capabilities)
    ↓ fail -> rejected, author fixes + resubmits
    ↓ pass, repeat author       -> auto_approved, published immediately
    ↓ pass, author's first ever -> pending_human_review, PO notified on WhatsApp
                                    -> PO replies APPROVE AGENT <id> / REJECT AGENT <id> <reason>
    ↓
Published listing is discoverable (server-side search), runnable
(deployAgentRun, idempotency-guarded), and reviewable (1 review/user,
self-review blocked) by any user. Author gets a private analytics dashboard
(runs/day, success rate) and Space log access.
```

---

## Data model

| Entity | Purpose |
|---|---|
| `Workspace` / `Project` | Top-level org and project containers |
| `Sprint` | Groups issues, tracks status through the approval lifecycle |
| `Issue` / `IssueComment` / `IssueLabel` | Work items, discussion, tagging |
| `SpecContext` | Shared spec state per issue/sprint — system design, data models, API contracts, acceptance criteria, edge cases, open questions |
| `AgentRun` | One execution of a specialist agent (or a deployed marketplace agent) |
| `SprintLearning` | Reusable patterns/decisions captured per completed sprint |
| `AgentListing` / `AgentListingVersion` | A published agent and its versioned releases, including moderation state |
| `AgentReview` | Ratings + comments on a listing |
| `SpaceLog` | Hugging Face Space logs, piped in for author-only access |
| `AgentAnalytics` | Daily run counts, success counts, durations per listing/version |

Every record includes `id`, `created_date`, `updated_date`, `created_by`
automatically.

---

## Sprint history

| Sprint | Theme |
|---|---|
| 1–5 | Core orchestrator, sprint lifecycle, marketplace foundations, Space sandboxing/versioning |
| 6 | Publish flow UI (PublishWizard, ModerationStatusBanner, EmptyStates) |
| 7 | Wired Sprint 6 UI into a real Author Dashboard, verified server-side search, shipped time-series analytics charts |
| 8 | Marketplace completion — agent detail page, reviews & ratings, run-trigger flow with idempotency guards |
| 9 | Trust & safety hardening — first-time-author human review gate on top of auto-moderation |

Full detail for recent sprints: `SPRINT7_SPEC.md`, `SPRINT8_SPEC.md`,
`SPRINT9_SPEC.md`. Recurring operational patterns (sprint approval loop,
auto-moderation resubmit loop, credit budget alert loop) are documented in
`LOOPS.md`.

---

## Approval flows (WhatsApp)

Two independent keyword flows, kept intentionally distinct:

- **Sprint approval:** PO replies `APPROVE` or `REJECT <feedback>` to a
  pending sprint. Approve merges the branch to main; reject logs feedback
  and resets affected issues to `in_progress`.
- **First-time-author agent review:** PO replies `APPROVE AGENT <version_id>`
  or `REJECT AGENT <version_id> <reason>` to a listing flagged
  `pending_human_review`. This only fires for a brand-new author's first
  listing that passed the automatic checks — repeat authors publish
  instantly with no human step.

---

## Tech stack

- Backend: Base44 entities + TypeScript backend functions (`functions/`)
- Frontend: React (Vite) dashboard (`spectra-symphony/dashboard/frontend/`)
- Orchestrator: Python (`spectra-symphony/orchestrator/`, `main.py`, cron scheduler)
- Hosting for published agents: Hugging Face Spaces
- Approvals + notifications: WhatsApp

---

## Setup

```bash
git clone <this repo>
cd spectra-symphony
pip install -r requirements.txt
cp .env.example .env
# fill in your .env values
python main.py
```

Dashboard frontend:

```bash
cd spectra-symphony/dashboard/frontend
npm install
npm run dev
```

---

## Extending

- Add new specialists in `spectra-symphony/orchestrator/specialist_pool.py`
- Add new output-format renderers in `orchestrator.py` -> `_compile_spec`
- Swap the board integration (Linear/Jira/GitHub Issues) by implementing the
  same interface under `spectra-symphony/integrations/`
- Recurring automation patterns are catalogued in `LOOPS.md` — check there
  before designing a new one from scratch
