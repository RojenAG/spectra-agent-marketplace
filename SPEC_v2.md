# Spectra Agent Marketplace — Sprint 2 Spec

**Branch:** feat/sprint-2-versioning-moderation-sandboxing
**Date:** 2026-05-08
**Status:** Approved

---

## Goal

Implement immutable agent versioning with orchestrator consistency checks, hybrid moderation gate, and polyglot sandboxing via Hugging Face Spaces.

---

## Track 1 — Agent Versioning

### System Design

Immutable versioning model. AgentListing is the stable marketplace product card. AgentListingVersion is the versioned artefact — each publish creates a new immutable record. AgentRun pins to a specific AgentListingVersion.id.

On new version publish:
- Entity trigger fires
- Orchestrator consistency check runs
- 3 outcomes:
  - ✅ Auto-upgrade all active AgentRuns
  - ⚠️ Soft flag — goal drift detected, PO decides via WhatsApp
  - 🚫 Hard block — breaking schema change, no upgrade, PO notified

### Data Models

AgentListingVersion:
- agent_listing_id, version (number), capabilities (string[])
- config_schema (object), changelog (string, required)
- is_latest (boolean), published_at (datetime)
- moderation_status: pending | auto_approved | approved | rejected | revoked
- moderation_notes (string)
- space_url, space_id, space_status: provisioning | ready | paused | resuming | error

AgentRun:
- ...existing fields
- agent_listing_version_id (string) — pins exact version
- status: pending | running | completed | failed | cancelled | paused

### API Contracts

POST /agents/:id/versions — Publish new version. Requires changelog. Triggers moderation + provisioning.
POST /agents/:id/deploy — Optional version param. Omit = latest. Hard 403 if revoked.
GET /agents/:id/versions — List all versions with changelog, status, is_latest.

### Acceptance Criteria

1. Publishing without changelog blocked at form level
2. Breaking schema change (removed required field) hard-blocked
3. Soft-flag WhatsApp ping within 30s of publish
4. Auto-upgraded runs log IssueComment audit trail
5. Deploying older version shows warning banner
6. Consistency check runs on manual old-version deploy too
7. Revoked version returns 403 on deploy

---

## Track 2 — Moderation Gate

### System Design

Hybrid moderation (Model C). Gate fires at version publish only.

State machine: pending → auto_approved | approved | rejected | revoked

Revocation cascade: AgentListingVersion revoked → all AgentRuns paused → Sprint blocked → PO WhatsApp ping.

### Automated Ruleset (hard rejections)
- Dangerous keywords in capabilities[]
- Oversized config_schema (DoS vector)
- Secret-exfiltration field names (api_key, token, password) without masking

### API Contracts

POST /agents/:id/versions — triggers auto moderation pass
PATCH /agents/:id/versions/:vid/moderate — Moderator approve/reject with notes
PATCH /agents/:id/versions/:vid/revoke — Admin only. Triggers cascade.

### Acceptance Criteria

1. Revoked version returns 403 on deploy
2. Active runs pause within 5s of revocation
3. Sprint blocks and PO gets WhatsApp ping on revocation
4. Author gets IssueComment + WhatsApp on rejection with moderation_notes
5. Resumed runs after re-approval pick up from last checkpoint
6. Auto-approved versions flip is_latest immediately
7. Flagged versions stay pending until human approves

---

## Track 3 — Polyglot Sandboxing via HF Spaces

### System Design

One HF Space per AgentListingVersion, provisioned by Spectra on publish. Docker-based, polyglot runtime (Python, Node, Go, Rust, etc.).

Hybrid warm strategy:
- Within sprint: Space stays hot
- Between sprints: Space paused
- 7-day idle: Hard pause regardless of sprint state

### API Contracts

HF POST /api/repos/create — Provision Space on version publish
HF POST /api/spaces/:id/pause — Pause on sprint complete/blocked or idle
HF POST /api/spaces/:id/restart — Resume on sprint in_progress
GET :space_url/health — Capability handshake before moderation approves

### Acceptance Criteria

1. Space provisions within 60s of version publish
2. Cold start on sprint resume under 15s
3. AgentRun fails gracefully if Space in error state
4. 7-day idle pause fires and logs IssueComment
5. Python and Node runtimes pass capability handshake
6. Space pauses within 30s of sprint completing
7. AgentRun routed to correct version's Space only

---

## Open Questions

1. SLA for human moderation review queue — escalation threshold?
2. Max Docker image size for Spectra Spaces?
3. Author Dockerfile vs Spectra base image template?
4. Should authors access Space logs for debugging?
5. Soft-flag: auto-resolved on PO WhatsApp acknowledge or requires re-publish?

---

## Entity Changes

- AgentListingVersion: +moderation_status, +moderation_notes, +space_url, +space_id, +space_status
- AgentRun: +paused status

