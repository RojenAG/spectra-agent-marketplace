# Spec: Agent Marketplace
> Sprint 1 — Spectra Symphony | Approved: 2026-05-02

## Goal
Build a native marketplace for discovering, publishing, and running Spectra specialist agents.

## System Design
3-tier architecture: MarketplaceService → AgentRunnerService → SpectraOrchestrator.
Agent capability cards stored as `AgentListing` entity. Data flow:
User selects agent → Issue created with `assigned_agent` → entity trigger fires → orchestrator picks up → isolated runner executes → result written to IssueComment + SpecContext.

## Tech Stack
- React
- Node.js
- PostgreSQL
- Base44 Entities

## Data Models

### AgentListing
| Field | Type |
|---|---|
| name | string |
| description | string |
| category | enum: architect, backend, frontend, qa, security, data, devops, custom |
| author | string |
| capabilities | string[] |
| config_schema | object (JSON Schema) |
| is_published | boolean |
| average_rating | number |
| run_count | number |

### AgentReview
| Field | Type |
|---|---|
| agent_listing_id | string |
| issue_id | string |
| rating | number (1–5) |
| comment | string |

## API Contracts
| Method | Endpoint | Description |
|---|---|---|
| GET | /agents?category=&q= | List with filter + search |
| POST | /agents | Publish new agent |
| POST | /agents/:id/deploy | Creates Issue + AgentRun in sprint |
| POST | /agents/:id/reviews | Submit review |
| GET | /agents/:id/reviews | Paginated reviews |

## UI Flows
- `/marketplace` — grid of AgentCards, filter sidebar (category, rating, run count), search bar
- `/marketplace/:id` — Agent detail: capability list, config schema form, reviews, Deploy button
- `/marketplace/publish` — 4-step PublishWizard with live capability card preview

### Key Components
- `AgentCard` — name, category badge, star rating, run count, one-click Deploy
- `AgentDetailPanel` — full capability breakdown + config form
- `DeployModal` — sprint selector, config overrides, confirm
- `ReviewList` + `ReviewForm` — paginated reviews with rating input
- `PublishWizard` — 4-step stepper with live preview

## Acceptance Criteria
- [ ] User can filter agents by category and free-text search returns relevant results
- [ ] Publishing an agent with incomplete config schema shows inline validation errors
- [ ] Deploying an agent creates a child Issue in the target sprint within 2s
- [ ] Rating is only available after a completed AgentRun linked to that agent
- [ ] Average rating updates in real time after a new review is submitted
- [ ] Marketplace shows empty state with CTA when no agents are published

## Edge Cases
- Duplicate agent name on publish → 409 conflict, show name suggestion
- Agent run fails mid-execution → Issue status flips to `cancelled`, user notified via comment
- Concurrent deploys of same agent to same sprint → idempotency check on `assigned_agent + sprint_id + status=todo`
- User submits review without completing a run → 403 `Complete a run first`
- Config schema has required fields left blank → block deploy, highlight missing fields

## Auth Requirements
| Action | Requirement |
|---|---|
| Browse | Public (no auth) |
| Deploy | Authenticated + active sprint |
| Publish | Authenticated + `publisher` role |
| Review | Authenticated + completed run |
| Delete listing | Author or admin only |

## Risk Notes
- Malicious agent code → sandbox + 30s hard kill
- Runaway loops → max 20 runs/sprint enforced
- Credential leakage → secrets by name only, never raw keys
- Config schema injection → whitelist JSON Schema keywords

## Open Questions
- [ ] Containers vs in-process sandboxing?
- [ ] Moderation: automated or human review gate?
- [ ] Config schema form: JSON Schema Form library or custom renderer?
