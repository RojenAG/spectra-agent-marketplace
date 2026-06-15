# Sprint 4 — Agent Collaboration & Runtime
## Spec Output | Approved: 2026-06-15

---

## Goal
Enable multi-agent collaboration via WhatsApp group chaining, build a localhost run dashboard, and validate the @mention trigger pattern as a spike.

---

## Issues Completed

### 1. SPIKE — WhatsApp @mention agent chaining [DONE]
Investigate whether Base44 agents can collaborate autonomously in a WhatsApp group via @mention triggers.

*Approach:*
Each agent has a standing rule to watch for messages containing its @handle. Spectra posts `@AgentName <task>` in the group. The receiving agent's connector automation fires, completes the task, and replies `✅ @Spectra [DONE]`.

*Validated chain:* Spectra → @BackendAgent → @QAAgent → Spectra

*Findings:*
- Pattern is viable as a production collaboration primitive
- Latency per hop: ~30-60s (automation poll interval)
- No message ordering issues at this volume
- Failure mode: silent timeout if agent doesn't respond — mitigated by 5-min escalation rule

---

### 2. Localhost Run Dashboard — Architecture & Data Model [DONE]
FastAPI backend + React (Vite) SPA on localhost:8044.

*Data source:* Base44 entity REST API (polling, 5s interval)
*Refresh strategy:* Client-side polling (SSE deferred to Sprint 5)

*Components:*
- ActiveRunPanel — current agent, status badge, elapsed timer
- PipelineQueue — issues ordered by backlog/in_progress
- SprintProgressBar — done/total ratio
- ApprovalButton — sends WhatsApp APPROVE prompt to PO

---

### 3. Localhost Run Dashboard — Build & Serve [DONE]
Implementation delivered in `spectra-symphony/dashboard/`.

```
python dashboard.py
→ Serves on localhost:8044
→ FastAPI /status endpoint
→ React SPA with live polling
→ Approval button wired to WhatsApp
```

---

### 4. WhatsApp Group — Multi-Agent Setup & Routing Rules [DONE]
Group created: "Spectra — Agent Collaboration" (mention_only mode)

*Routing protocol:*
- Spectra orchestrates, always listens
- Specialists summoned by: `@Handle [SPRINT:id] [ISSUE:id] Task: ...`
- Response format: `✅ @Spectra [DONE] Result: ... Artefact: ... Next: ...`
- Full protocol documented in: spectra-symphony/integrations/whatsapp_routing_protocol.md

*Agent handles defined:*
@BackendAgent | @FrontendAgent | @QAAgent | @ArchAgent | @SecurityAgent | @DevOpsAgent

---

### 5. WhatsApp — Human Approval Flow Integration [IN PROGRESS]
Extending single-user approval poller to group context.
WhatsApp Approval Reply Poller: runs every 5 mins, reads APPROVE/REJECT from PO.
Sprint entity automation handles GitHub push on approval or issue reset on rejection.

---

### 6. QA — Dashboard & Agent Collaboration Acceptance Criteria [BACKLOG]
Gherkin scenarios to be written for:
1. Dashboard shows correct active run and pipeline state
2. Approval button triggers correct sprint transition
3. @mention chain completes end-to-end without human intervention
4. WhatsApp group approval parsed correctly from PO reply

Edge cases: no active run, stale polling data, malformed @mention, concurrent agent responses.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Multi-agent comms | WhatsApp @mention | Native to PO workflow, no extra infra |
| Dashboard server | FastAPI + Vite | Lightweight, fast to spin up locally |
| Approval surface | WhatsApp group | Mobile-first, PO already there |
| Poll interval | 5 minutes | Credits-efficient, acceptable latency |
| Branch strategy | feat/sprint-4-* from main | Consistent with sprint-2 and sprint-3 pattern |

---

## WhatsApp Routing Protocol Summary

```
Spectra → Specialist:
@{Handle} [SPRINT:{id}] [ISSUE:{id}]
Task: <description>
Context: <constraints>
Output expected: <artefact>

Specialist → Group:
✅ @Spectra [DONE]
Result: <summary>
Artefact: <entity/file updated>
Next: <suggested next step>
```

---

## Open Items for Sprint 5
- SSE/WebSocket real-time dashboard (replace polling)
- Specialist sub-agents fully provisioned with routing rules in IDENTITY
- QA Gherkin scenarios executed and automated
- Monetisation planning

---

*Approved by PO: Roj En — 2026-06-15*
*Spectra Orchestrator v4*
