# Sprint 5 Spec — Hygiene, Debt & Self-Serve Readiness

**Sprint:** Sprint 5 — Hygiene, Debt & Self-Serve Readiness
**Status:** Approved ✅
**Approved At:** 2026-06-17T11:23:00
**Branch:** feat/sprint-5-hygiene-self-serve-readiness

## Goal
Fix automation credit waste by replacing the approval poller with an event-driven trigger, close Sprint 3/4 gaps, and complete a full self-serve author onboarding audit so any new user can publish, discover, and run an agent without hand-holding — ready for monetisation.

---

## Track A — Hygiene & Debt

### A1. Replace WhatsApp Approval Poller with Entity Trigger ✅
BEFORE: Scheduled automation polling every 5 min (288 runs/day, ~1.9 credits/day wasted on idle checks).
AFTER: Entity trigger fires only when Sprint.status changes to pending_approval. Zero idle runs.
Actions taken:
- Archived WhatsApp Approval Reply Poller (scheduled)
- Created Sprint Pending Approval — WhatsApp Notifier (entity trigger)
- Added loop guard: trigger_condition from_me = false

### A2. Push SPRINT3_COMPLETE.md to GitHub ✅
File pushed to feat/sprint-3-discovery-author-experience branch.
Sprint 3 record updated with GitHub repo URL.

### A3. Resolve Dangling Sprint 4 Backlog Issues ✅
Two backlog issues closed:
- WhatsApp approval flow integration → superseded by Sprint 5 entity trigger
- QA dashboard acceptance criteria → absorbed into Sprint 5 Track A

### A4. QA — Dashboard & Agent Collaboration Acceptance Criteria ✅
13 Gherkin scenarios written covering:
- Dashboard active run display
- Pipeline queue rendering
- Approval button trigger and state
- WhatsApp APPROVE/REJECT parsing
- from_me loop guard
- @mention routing and agent sequencing
- Edge cases: no active runs, null started_at, stale data, two agents simultaneous

### A5. Automation Audit — Anti-Pattern Report ✅
7 automations reviewed. Findings:
- 1 anti-pattern FIXED (WhatsApp Poller — archived)
- 1 anti-pattern RISK RESOLVED (Linear Poller — archived before reactivation)
- Sprint Approval Trigger hardened with status condition filter (approved/rejected only)
- Budget Alert flagged as low-priority optimisation (24h interval recommended)
- 3 automations confirmed correct event-driven pattern

---

## Track B — Self-Serve Author Readiness

### B1. Architect — Onboarding Flow Design & Gaps Spec ✅

Current state gaps identified:
- No welcome or role-selection screen
- No onboarding checklist
- Empty state on /my-agents shows nothing
- No moderation status explainer
- Empty analytics chart (no placeholder)
- No Space URL hint on version form
- No post-publish marketplace link
- Two-step publish requires 2 manual record creates
- No single publish wizard or API

Target state:
1. Welcome screen with Author / Consumer path split
2. 5-step onboarding checklist for authors
3. Empty state improvements across all author views
4. Moderation status banners (pending / approved / rejected)
5. Post-publish marketplace link

Architecture recommendations:
- publishAgent backend function (atomic: creates AgentListing + AgentListingVersion)
- User.onboarding_step field (0-5) for server-side checklist tracking
- Entity automation: AgentListingVersion approved → AgentListing.is_published = true
- HF Space URL pattern validation (SSRF prevention)

Open Questions:
Q1: Welcome screen shown once per account or every first login?
Q2: Auto-approval acceptable for v1 beta?
Q3: Publish wizard — multi-step modal or dedicated /publish page?

### B2. Frontend — New Author Onboarding UX Audit ✅

7 friction points found (2 CRITICAL, 3 HIGH, 2 MEDIUM):
1. No entry point for authors (CRITICAL)
2. Create Agent Listing CTA is hidden (HIGH)
3. Two-step publish is confusing (HIGH)
4. Moderation status unexplained (HIGH)
5. Analytics empty state is blank chart (MEDIUM)
6. No marketplace link after publish (MEDIUM)
7. Space log tab empty without HF URL (LOW)

6 components specified:
- WelcomeScreen (new)
- OnboardingChecklist (new)
- PublishWizard multi-step modal (new)
- ModerationStatusBanner (new)
- EmptyAnalyticsPlaceholder (update)
- SpaceLogEmptyState (update)

### B3. Backend — Self-Serve Publish Flow Validation ✅

4 critical gaps found:
1. No atomic publish endpoint (orphaned listings possible)
2. moderation_status defaults to null (invisible to moderation queue)
3. No auto-moderation path (fully manual today)
4. is_published not synced to moderation approval (approved agents dont appear in search)

Recommended actions:
1. Deploy publishAgent backend function
2. Set moderation_status default = pending on AgentListingVersion
3. Entity automation: version approved → set is_published = true on parent listing
4. Entity automation: version created → run basic auto-moderation check

### B4. Security — Multi-Tenant Author Isolation Audit ✅

Status: CONDITIONAL SIGN-OFF
RLS must be confirmed enabled on:
- AgentListing (read-public / write-own pattern)
- AgentListingVersion (write-own; admin/service-role for moderation_status)
- SpaceLog (author-only, no public read)
- AgentAnalytics (author-only, no public read)

Additional findings:
- SPECTRA_API_TOKEN over-scoped → restrict to AgentRun + Sprint read-only
- HF Space URL free-text → validate pattern: https://huggingface.co/spaces/<user>/<space>
- Moderation bypass via direct API → add server-side guard in backend function

### B5. QA — Self-Serve Author Journey Acceptance Criteria ✅

15 Gherkin scenarios written covering:
- Welcome screen and role selection
- Publish wizard atomic create
- Moderation pending / approved / rejected states
- Agent appearance in marketplace after approval
- Version bump and timeline display
- Marketplace visibility isolation (unpublished agents hidden)
- Search results correctness
- Run trigger from marketplace
- Analytics after first run + empty state
- RLS isolation (cross-author read/write blocked)

Definition of Done for Track B:
All 15 scenarios pass.
RLS confirmed on 4 entities.
Publish wizard creates records atomically.
Auto-moderation or manual moderation path fully functional.
Security conditional sign-off cleared.

---

## Issues Completed: 10/10
## Automations improved: -2 polling automations removed, +1 event-driven trigger added
## Credit waste eliminated: ~1.9 credits/day saved
## Sprint approved: 2026-06-17
