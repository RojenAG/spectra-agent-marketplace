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

**Test & Security Suite** (`spectra-symphony/tests/`) — 332 tests across 12
suites covering unit, integration, E2E, load, OWASP Top 10, RLS verification,
input validation, rate limiting, secret management, GDPR, PII handling,
data retention, and compliance audit logging.

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

## Testing & Security

Sprint 10 introduced a comprehensive test and security hardening layer:

### Test suites (332 tests total)

| Suite | Tests | Coverage |
|---|---|---|
| Unit tests | 94 | All 6 backend functions — schema validation, filter logic, authorization, SSRF prevention |
| Integration | 24 | Publish → moderate → publish flow, version bumping, auto-approval, first-author review gate |
| E2E agent run | 21 | Full run lifecycle — trigger, validate, invoke, log sync, idempotency |
| E2E reviews | 17 | Review submission, self-review block, duplicate prevention, rating recalculation |
| Load tests | 18 | 1000 concurrent searches, sort performance, filter combination stress |
| OWASP Top 10 | 31 | All 10 categories — injection, broken auth, XSS, IDOR, SSRF, misconfig, etc. |
| RLS verification | 15 | Cross-user access prevention, admin override, email spoofing, case sensitivity |
| Input validation | 30 | Max lengths, XSS/NoSQL injection detection, HF URL pattern, config schema types |
| Rate limiting | 16 | Per-user/per-IP buckets, 429 + Retry-After, window reset, run/publish/search limits |
| Secret management | 14 | Token scope, rotation runbook, no secrets in logs/errors/responses |
| GDPR | 17 | Right to erasure with cascade, data export, consent tracking, data minimization |
| PII handling | 15 | Sensitivity classification (public/internal/restricted), no PII in analytics |
| Data retention | 10 | Retention windows (90d runs, 30d logs, 365d analytics), cleanup triggers |
| Audit logging | 10 | Tamper-evident hash, before/after state, 8 compliance-sensitive actions |
| E2E marketplace | 18 | Full consumer + author lifecycle — browse → search → run → review → dashboard |

### Security hardening highlights

1. *OWASP Top 10* — all 10 categories audited with dedicated test suites
2. *Row-Level Security* — verified per entity, including admin override and email spoofing prevention
3. *Input validation* — max-length enforcement, XSS/NoSQL injection detection, HF Space URL pattern matching
4. *Rate limiting* — 5 runs/user/min, 3 publishes/user/min, 30 searches/IP/min, with 429 + Retry-After headers
5. *Secret management* — tokens read from env vars only, never logged, rotation runbook documented
6. *HF token exposure* — identified risk of Authorization headers in Space logs; sanitization filter recommended

### Compliance highlights

1. *GDPR* — right to erasure with full cascade (listings → versions → reviews → runs → analytics → space logs), data export as JSON, consent tracking
2. *PII handling* — sensitivity classification (public, internal, restricted) across all entity fields, no PII in analytics aggregations
3. *Data retention* — AgentRun 90d (delete), SpaceLog 30d (delete), AgentAnalytics 365d (archive), AgentReview/Listing indefinite (until deletion request)
4. *Audit logging* — tamper-evident hash, before/after state capture, covers publish, approve, reject, run, RLS change, secret rotation, erasure, export

---

## Sprint history

| Sprint | Theme |
|---|---|
| 1–5 | Core orchestrator, sprint lifecycle, marketplace foundations, Space sandboxing/versioning |
| 6 | Publish flow UI (PublishWizard, ModerationStatusBanner, EmptyStates) |
| 7 | Wired Sprint 6 UI into a real Author Dashboard, verified server-side search, shipped time-series analytics charts |
| 8 | Marketplace completion — agent detail page, reviews & ratings, run-trigger flow with idempotency guards |
| 9 | Trust & safety hardening — first-time-author human review gate on top of auto-moderation |
| 10 | Testing, cybersecurity & data compliance — 332 tests, OWASP Top 10 audit, GDPR/PII/retention/audit logging |

Sprints 1–7 are condensed into `HISTORY.md` — they built the foundation but
are superseded by later work. Sprints 8–10 still describe what's currently
live, so they keep their own files: `SPRINT8_SPEC.md`, `SPRINT9_SPEC.md`,
`SPRINT10_SPEC.md`. Recurring operational patterns (sprint approval loop,
auto-moderation resubmit loop, credit budget alert loop) are documented in
`LOOPS.md`.

---

## Approval flows (WhatsApp)

Two independent keyword flows, kept intentionally distinct:

- *Sprint approval:* PO replies `APPROVE` or `REJECT <feedback>` to a
  pending sprint. Approve merges the branch to main; reject logs feedback
  and resets affected issues to `in_progress`.
- *First-time-author agent review:* PO replies `APPROVE AGENT <version_id>`
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
- Testing: Deno test runner (`spectra-symphony/tests/`)

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

Run the test suite:

```bash
npx deno test spectra-symphony/tests/ --no-check --allow-env
```

---

## Extending

- Add new specialists in `spectra-symphony/orchestrator/specialist_pool.py`
- Add new output-format renderers in `orchestrator.py` -> `_compile_spec`
- Swap the board integration (Linear/Jira/GitHub Issues) by implementing the
  same interface under `spectra-symphony/integrations/`
- Recurring automation patterns are catalogued in `LOOPS.md` — check there
  before designing a new one from scratch
- Security tests live in `spectra-symphony/tests/security/` — extend when
  adding new endpoints or changing auth/RLS policies
- Compliance tests live in `spectra-symphony/tests/compliance/` — extend
  when adding new entities or changing data handling
