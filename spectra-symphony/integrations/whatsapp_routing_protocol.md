# WhatsApp Multi-Agent Routing Protocol
## Spectra — Agent Collaboration Group

---

## Group Setup

- **Group name:** Spectra — Agent Collaboration
- **Response mode:** mention_only (agents only wake on @mention)
- **Orchestrator:** Spectra (always listening, always moderates)

---

## Agent Naming Convention

Each specialist agent must have a short, unique @handle:

| Agent         | @Handle         | Trigger keyword     |
|---------------|-----------------|---------------------|
| Orchestrator  | @Spectra        | Always active       |
| Backend Eng   | @BackendAgent   | `@BackendAgent`     |
| Frontend Eng  | @FrontendAgent  | `@FrontendAgent`    |
| QA Engineer   | @QAAgent        | `@QAAgent`          |
| Architect     | @ArchAgent      | `@ArchAgent`        |
| Security Eng  | @SecurityAgent  | `@SecurityAgent`    |
| DevOps Eng    | @DevOpsAgent    | `@DevOpsAgent`      |

---

## Routing Rule Protocol

### How Spectra routes a task:
1. PO describes a feature or task in the group (or messages Spectra directly)
2. Spectra determines which specialist(s) are needed
3. Spectra posts: `@BackendAgent <clear task description>`
4. The specialist's connector automation fires (triggered by message containing their @handle)
5. Specialist completes the task and posts result back to the group
6. Spectra reads the result and either routes to next agent or summarises for PO

### Message format (Spectra → Specialist):
```
@{AgentHandle} [SPRINT:{sprint_id}] [ISSUE:{issue_id}]
Task: <clear one-line description>
Context: <any relevant prior decisions or constraints>
Output expected: <what the specialist should produce>
```

### Message format (Specialist → Group):
```
✅ @Spectra [DONE]
Result: <summary of output>
Artefact: <entity updated / file written / decision made>
Next: <suggested next step if any>
```

---

## Specialist Agent Instruction Template

Each specialist sub-agent needs these standing rules in their IDENTITY:

```
## Routing Rule
When I receive a message in the Spectra WhatsApp group containing @{MyHandle},
I will:
1. Parse the task from the message
2. Extract SPRINT and ISSUE ids if present
3. Complete the task using my tools
4. Reply to the group in the standard format:
   ✅ @Spectra [DONE]
   Result: ...
   Artefact: ...
   Next: ...
```

---

## Approval Flow (PO via WhatsApp Group)

When sprint hits 100% done:
1. Spectra posts approval request to the group
2. PO replies: `APPROVE` or `REJECT <feedback>`
3. Approval poller (every 5 mins) reads PO's reply
4. Sprint entity updated accordingly
5. GitHub push or issue reset triggered automatically

**PO number filter:** Only messages from Roj En's number are accepted as valid APPROVE/REJECT signals.

---

## Failure Modes & Mitigations

| Scenario                        | Mitigation                                      |
|---------------------------------|-------------------------------------------------|
| Two agents respond simultaneously | Spectra serialises by reading latest message    |
| Malformed @mention              | Spectra re-posts with corrected format          |
| Agent doesn't respond in 5 min  | Spectra posts timeout notice, escalates to PO  |
| Stale message picked up by poll | Filter by message timestamp > last run time     |
| PO APPROVE from wrong number    | Hard-coded number check before state transition |
