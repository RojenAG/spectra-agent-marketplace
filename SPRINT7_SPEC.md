# Sprint 7 — Marketplace Integration & Analytics

**Status:** Complete, pending PO approval
**Branch:** `feat/sprint-7-marketplace-integration-analytics`

## Goal
Wire the Sprint 6 UI components (PublishWizard, ModerationStatusBanner, EmptyStates) into a real, running Author Dashboard; confirm server-side search works end-to-end; ship time-series analytics charts (runs/day, success rate).

## Root cause fixed first
Sprint 6 pushed `PublishWizard.jsx`, `ModerationStatusBanner.jsx`, and `EmptyStates.jsx` to a malformed path — `dashboard/frontend/src/components/...` instead of `spectra-symphony/dashboard/frontend/src/components/...`. This created an orphaned top-level `dashboard/` folder with no entry point (no `App.jsx`, `package.json`, or `index.html`), so none of Sprint 6's components were ever actually reachable in a running app.

Fixed by moving the three components to the correct path and deleting the orphaned folder (`dashboard/README.md` + 3 stray component files).

## Track A — Marketplace Frontend Integration
- Added a 3-tab navigation to the existing Spectra Dashboard: **Sprint Ops** (unchanged), **My Agents**, **Marketplace**.
- `MyAgentsPanel.jsx` — lists the author's own agents via the new `listMyAgents` function, shows `MyAgentsEmpty` when empty, opens `PublishWizard` in a modal, renders `ModerationStatusBanner` per listing's latest version.
- `listMyAgents.ts` — new backend function, scoped strictly to `created_by = user.email` (own agents only), returns each listing with its versions and latest version attached.

## Track B — Server-Side Search Verification
- Audited `searchAgents.ts` against the new `MarketplacePanel.jsx`: debounced free-text search (350ms), category filter, sort (newest/rating/popular), server-side filtering to `is_published: true` only. Confirmed live via test call — 200 OK, correct shape.

## Track C — Time-Series Analytics
- `RunsChart.jsx` / `SuccessRateChart.jsx` — lightweight inline SVG charts (no external chart lib dependency), theming matches the existing dark dashboard.
- `AnalyticsPanel.jsx` — per-agent view (30-day window) calling `getAuthorAnalytics`, with totals cards + both charts, falls back to `AnalyticsEmpty` when no run data exists yet.
- **Bug found + fixed during QA:** `getAuthorAnalytics` crashed with a 500 on malformed/unknown `agent_listing_id` (unhandled ObjectId cast error). Now returns a clean `404 Agent listing not found`.

## Verification performed
- All 9 new/changed frontend files passed an `esbuild` compile check before pushing.
- `listMyAgents`, `searchAgents`, `getAuthorAnalytics` tested live against real seeded data (temporary AgentListing/Version/Run records created, verified correct aggregation output, then deleted).
- Confirmed `getAuthorAnalytics` enforces `created_by === user.email` (403 Forbidden for other authors' listings) — RLS-equivalent protection intact.
- Confirmed final repo tree has no orphaned/duplicate paths.

## Files changed
- `functions/listMyAgents.ts` (new)
- `functions/getAuthorAnalytics.ts` (bug fix)
- `spectra-symphony/dashboard/frontend/src/App.jsx` (tab navigation)
- `spectra-symphony/dashboard/frontend/src/components/{PublishWizard,ModerationStatusBanner,EmptyStates}.jsx` (moved to correct path)
- `spectra-symphony/dashboard/frontend/src/components/{MyAgentsPanel,AnalyticsPanel,MarketplacePanel,RunsChart,SuccessRateChart}.jsx` (new)
- Removed: `dashboard/README.md`, `dashboard/frontend/src/components/{PublishWizard,ModerationStatusBanner,EmptyStates}.jsx` (orphaned duplicates from Sprint 6)
