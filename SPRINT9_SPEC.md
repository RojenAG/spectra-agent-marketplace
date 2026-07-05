# Sprint 9 — Trust & Safety Hardening

## Goal
Close the one heavy-engineering gap surfaced by the Loopy audit of the
auto-moderation loop (LOOPS.md #2): structural-only checks were letting any
new agent go fully public with zero human review.

## What shipped
1. **Schema:** `AgentListingVersion.moderation_status` gained a new value,
   `pending_human_review`, sitting between the automatic checks and full
   publication.
2. **Auto-moderation automation** ("Auto-Moderation — AgentListingVersion
   Created") now branches after structural checks pass:
   - Author has a prior `auto_approved`/`approved` version → unchanged,
     auto-approved and published immediately.
   - Author's first-ever listing to pass checks → `pending_human_review`,
     stays unpublished, PO gets a WhatsApp ping with listing name, author,
     and version id.
3. **WhatsApp approval keywords** (new standing rule,
   `first_author_review_flow.md`): `APPROVE AGENT <version_id>` →
   approved + published. `REJECT AGENT <version_id> <reason>` → rejected
   with notes. Kept distinct from the existing Sprint approval keywords.
4. **Frontend:** `ModerationStatusBanner` renders a new state for
   `pending_human_review` — explains to the author this is a one-time
   first-listing check and future submissions publish automatically.

## Why this design
Repeat authors keep the fast, fully automatic path — no added friction for
anyone who's already published something the marketplace has accepted.
Only a brand-new author's first submission gets a human in the loop, which
is the smallest change that closes the "no approval boundary" finding
without slowing down the rest of the pipeline.

## Verification
- Confirmed schema change live (`pending_human_review` enum value added).
- Confirmed automation description updated with the branching logic.
- Frontend banner change follows the exact same pattern as the existing
  `pending`/`rejected`/`revoked` states — no structural changes to the
  component's props or parent usage, so no other integration points need
  updating.
- Not yet verified against a live "first-time author" AgentListingVersion
  create event (no such test record seeded this sprint) — first real
  first-time submission will be the live test of the new branch.

## Status
Sprint 9 issue closed. Moved to pending_approval — awaiting PO's WhatsApp
`APPROVE`/`REJECT <feedback>`.
