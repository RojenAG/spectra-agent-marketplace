# Sprint History (1–7)

Condensed record of early sprints — these built the foundation but are
superseded by later work, so they're kept here as one file rather than
individually named specs. Sprints 8 and 9 are still actively referenced
(they describe what's currently live) and keep their own files:
`SPRINT8_SPEC.md`, `SPRINT9_SPEC.md`.

---

## Sprint 1 — Agent Marketplace foundation
**Approved:** 2026-05-02

Built the first version of the marketplace: `AgentListing`/`AgentReview`
entities, a 3-tier architecture (MarketplaceService → AgentRunnerService →
SpectraOrchestrator), and the core UI flows (`/marketplace`,
`/marketplace/:id`, `/marketplace/publish`). Established the sandbox +
30s-kill safety model and role-gated auth (publish requires `publisher`
role, review requires a completed run).

## Sprint 2 — Versioning, moderation gate & sandboxing
**Approved:** 2026-05-08 · **Completed:** 2026-06-06 · 15/15 issues

Three tracks, all delivered:
- **Versioning:** introduced the immutable `AgentListingVersion` entity —
  each publish is a new version, `AgentRun` pins to a specific version.
  Orchestrator consistency checks on publish: auto-upgrade, soft-flag (PO
  WhatsApp ping), or hard-block on breaking schema changes.
- **Moderation gate:** hybrid model — automated hard-rejection rules
  (dangerous keywords, oversized schemas, unmasked secret-like field names)
  plus human review for flagged versions. Revocation cascades to pausing
  active runs and blocking the sprint.
- **Sandboxing:** one Hugging Face Space per version, Docker-based,
  polyglot runtime, hybrid warm/pause lifecycle (hot during sprint, paused
  between sprints, hard-paused after 7 days idle).

Open questions carried forward: moderation queue SLA, max Docker image
size, author Dockerfile vs. Spectra base image, author access to Space logs
(later answered — yes, author-only, see Sprint 3).

## Sprint 3 — Discovery & author experience
**Completed:** 2026-06-13 · 13/13 issues

Server-side search and discovery (`searchAgents`, `/marketplace` search +
filters + sort) plus a full author dashboard: `getAuthorAnalytics`
(time-series runs/success rate/duration), `syncSpaceLogs` (HF Spaces logs
piped into the new `SpaceLog` entity, RLS author-only), and the `/my-agents`
page tying it together. Added the `SpaceLog` and `AgentAnalytics` entities.

## Sprint 4 — Agent collaboration & runtime
**Approved:** 2026-06-15

Validated a WhatsApp `@mention` agent-chaining spike (agents collaborating
autonomously in a group chat, ~30-60s latency per hop, 5-min timeout
escalation) as a viable pattern. Built the first localhost run dashboard
(FastAPI + Vite, 5s client-side polling): active run panel, pipeline queue,
sprint progress bar, and a WhatsApp approval button.

## Sprint 5 — Hygiene, debt & self-serve readiness
**Approved:** 2026-06-17

Fixed a credit-waste bug: replaced the 5-min WhatsApp approval polling
automation (288 runs/day, mostly idle) with an entity-triggered notifier
that only fires when a Sprint actually moves to `pending_approval` — the
pattern still in use today (with the `from_me = false` loop guard). Closed
dangling Sprint 3/4 backlog issues and ran a full self-serve onboarding
audit (publish → discover → run) ahead of monetisation.

## Sprint 6 — Publish flow UI
**Delivered:** PublishWizard, ModerationStatusBanner, and EmptyStates
components for the author publish flow.

Note: these components were originally pushed to a malformed path
(`dashboard/frontend/...` instead of `spectra-symphony/dashboard/frontend/...`),
creating an orphaned, unreachable folder. This was caught and fixed at the
start of Sprint 7 — components moved to the correct path, orphaned folder
removed.

## Sprint 7 — Marketplace integration & analytics
**Completed**, branch `feat/sprint-7-marketplace-integration-analytics`

Wired the Sprint 6 UI into a real running Author Dashboard (3-tab nav: Sprint
Ops / My Agents / Marketplace), verified `searchAgents` end-to-end, and
shipped time-series analytics charts (`RunsChart`, `SuccessRateChart`,
`AnalyticsPanel` — lightweight inline SVG, no external chart library). Found
and fixed a bug where `getAuthorAnalytics` 500'd on an unknown
`agent_listing_id` instead of returning a clean 404.

---

For current, load-bearing sprint detail see `SPRINT8_SPEC.md` (marketplace
completion — detail page, reviews, run trigger) and `SPRINT9_SPEC.md`
(trust & safety hardening — first-time-author review gate). Recurring
operational patterns across all sprints are in `LOOPS.md`.
