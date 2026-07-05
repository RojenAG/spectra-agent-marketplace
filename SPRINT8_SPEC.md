# Sprint 8 — Marketplace Completion

**Status:** Complete, approved by PO
**Branch:** `feat/sprint-8-marketplace-completion`

## Goal
Round out the agent marketplace with the three missing end-user flows: viewing an agent's full detail page (versions, reviews, Space logs), leaving a review/rating, and actually triggering a run of a published agent.

## Track A — Agent Detail Page
- `getAgentDetail.ts` (new) — returns listing info, version history, reviews (+ average rating), and review_count for any caller. Space logs are included only when the caller is the listing's author (`is_author` flag in the response).
- Unpublished listings 404 for non-authors (existence not leaked) but remain visible to the author, including their Space logs.
- Non-author callers only see versions with `moderation_status` of `approved` or `auto_approved` — pending/rejected versions stay hidden from the public.
- `AgentDetailPage.jsx` (new) — renders the header card (name, category, description, stats, capabilities), version history list, an author-only Space log viewer, the reviews section, and a "Run agent" button gated on the latest version being approved.
- `MarketplacePanel.jsx` — cards are now clickable and open the detail page; `App.jsx` holds the `detailAgentId` state to switch between the marketplace grid and the detail view.

## Track B — Reviews & Ratings
- `submitAgentReview.ts` (existing, verified) — 1-5 rating validation, one review per user per listing via upsert, self-review blocked, `AgentListing.average_rating` recalculated on every submit.
- `ReviewsSection.jsx` (new) — star-rating input + optional comment, submit flow with error/success states, list of existing reviews sorted newest-first. Shows a "you can't review your own agent" note instead of the form when `is_author` is true.

## Track C — Agent Run Trigger
- `deployAgentRun.ts` (existing, verified) — validates input against the version's `config_schema`, blocks runs on unapproved versions (403), and reuses an in-flight `AgentRun` for the same version + user instead of starting a duplicate (idempotency guard).
- `RunAgentModal.jsx` (new) — dynamic form generated from `config_schema` (text/number/boolean/enum fields), submits to `deployAgentRun`, and "polls" by resending the same payload — the backend's idempotency guard naturally returns the current state of the same in-flight run instead of spawning a duplicate, since the call is synchronous end-to-end (hard 30s timeout).

## Bug found + fixed during this sprint
`publishAgent.ts` was never setting `AgentListing.author` on creation. This would have silently broken self-review blocking and the detail page's author-only gating (Space logs, unpublished visibility) for every real agent published going forward. Fixed by setting `author: user.email` at listing creation; verified via a live smoke test (publish → confirm `author` field populated → cleaned up).

## Verification performed
- `getAgentDetail` tested live against seeded data: public view (space_logs empty, is_author=false), author view (space_logs populated, is_author=true), and unpublished-listing 404 for non-authors — all confirmed, test records cleaned up after.
- `publishAgent` smoke-tested post-fix to confirm `author` is now populated correctly.
- Full frontend build (`vite build`) passed clean with no errors after adding `AgentDetailPage`, `ReviewsSection`, `RunAgentModal`, and wiring `MarketplacePanel`/`App.jsx`.
- 10 Gherkin QA scenarios written and passed, covering detail-page visibility, review validation/dedup/self-review blocking, and run-trigger approval gating + idempotency.

## Files changed
- `functions/getAgentDetail.ts` (new)
- `functions/publishAgent.ts` (bug fix — sets `author` on listing creation)
- `spectra-symphony/dashboard/frontend/src/components/AgentDetailPage.jsx` (new)
- `spectra-symphony/dashboard/frontend/src/components/ReviewsSection.jsx` (new)
- `spectra-symphony/dashboard/frontend/src/components/RunAgentModal.jsx` (new)
- `spectra-symphony/dashboard/frontend/src/components/MarketplacePanel.jsx` (wired card clicks to open detail page)
- `spectra-symphony/dashboard/frontend/src/App.jsx` (added `detailAgentId` routing state)
