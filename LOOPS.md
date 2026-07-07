# Project loops

Loops discovered by Spectra on 2026-07-05 via the Loopy discovery workflow,
scanning this repo's automations, sprint history, and moderation pipeline.
Each entry is: what it does, the trigger → action → check → stop cycle, and
the evidence it's grounded in.

## 1. Sprint QA → Approval → Merge loop

**One-sentence explanation:** Every sprint's work gets checked against QA
scenarios, sent to the PO for a WhatsApp approve/reject decision, and either
merged to main or sent back for revision — repeating until approved.

- **Trigger:** All issues in a sprint reach `done`.
- **Action:** Run the sprint's Gherkin QA scenarios against acceptance
  criteria; if any fail, fix and rerun. When all pass, set the Sprint's
  `status` to `pending_approval` (fires the "Sprint Pending Approval —
  WhatsApp Notifier" automation).
- **Check:** The PO replies `APPROVE` or `REJECT <feedback>` on WhatsApp.
- **Stop conditions:** `APPROVE` → merge the sprint branch into `main`, push
  the spec, mark the Sprint `completed` (success). `REJECT <feedback>` → save
  the feedback to `rejection_feedback`, reset affected issues to
  `in_progress`, and loop back to the top (bounded by however many revision
  rounds the PO needs).
- **Evidence:** Proven recurrent — observed identically across Sprint 1
  through Sprint 8 (8 occurrences). Backed by two live automations: "Sprint
  Pending Approval — WhatsApp Notifier" and "Spectra Sprint Approval Trigger".
- **Saved:** 2026-07-05

## 2. Auto-moderation resubmit loop

**One-sentence explanation:** A newly published agent version is auto-checked
for basic quality; if it fails, the author fixes and resubmits, and it gets
re-checked until it passes.

- **Trigger:** A new `AgentListingVersion` record is created.
- **Action:** The "Auto-Moderation — AgentListingVersion Created" automation
  checks: name not empty, description not empty, `space_url` matches the HF
  pattern, capabilities not empty.
- **Check:** All checks pass → `moderation_status = auto_approved` and the
  parent listing's `is_published` is set true. Any check fails →
  `moderation_status = rejected` with notes on what failed.
- **Stop conditions:** Success = auto-approved and published. On rejection,
  the author uses the self-service `ModerationStatusBanner` to fix and
  resubmit (creates a new version), which re-triggers the same check —
  bounded by the author choosing to keep resubmitting or stopping.
- **Evidence:** Live automation (`auto_moderate_agent_version`), plus the
  Sprint 6 `ModerationStatusBanner`/`PublishWizard` resubmit UI built
  specifically to support this cycle.
- **Saved:** 2026-07-05
- **Audit note (2026-07-05):** Loop Doctor verdict = Repair needed. Findings:
  (1) checks are structural only (empty fields, URL pattern) — passing them
  auto-publishes to the public marketplace with no human review boundary;
  (2) the check is applied by the agent reacting to the trigger rather than a
  fixed deterministic function, so judgment could drift slightly between
  runs. Suggested minimal repair: add a one-time human review gate for a new
  author's *first* listing only (repeat authors stay fully automatic), or log
  every auto-approval into a spot-check queue. **Decision: PO reviewed this
  and chose to keep the loop as-is for now — accepted as a known risk, no
  repair applied.**
- **Update (2026-07-07):** Repair actually implemented in Sprint 9 — see
  `SPRINT9_SPEC.md`. New author's first passing listing now gets
  `pending_human_review` + a WhatsApp approve/reject step
  (`APPROVE AGENT <id>` / `REJECT AGENT <id> <reason>`); repeat authors are
  unaffected and stay fully automatic.

## 3. Credit budget alert loop (repaired 2026-07-05)

**One-sentence explanation:** Every 12 hours, check daily/monthly credit
usage; a fresh crossing of 90% gets a plain heads-up, but a *sustained*
crossing escalates with a concrete cost breakdown and a specific suggestion
instead of repeating the same generic alert.

- **Trigger:** Scheduled, every 12 hours.
- **Action:** "Budget Alert - 90% Credit Usage" reads current daily/monthly
  usage from context.
- **Check:** Usage ≥ 90% daily or monthly. If so, checks memory for the last
  recorded alert level this billing cycle to tell a fresh crossing from a
  sustained one.
- **Stop conditions:** Below 90% on both → clean no-op. Fresh crossing →
  plain WhatsApp alert, records the crossing to memory. Sustained crossing
  (still ≥90% since the last alert) → escalates: summarizes which
  automations ran and their cost since the last alert, and suggests a
  concrete next step (pause a specific low-value automation, or upgrade)
  instead of repeating the same message.
- **Evidence:** Live scheduled automation.
- **Saved:** 2026-07-05
- **Audit note (2026-07-05):** Loop Doctor verdict = Repair needed — the
  original version only alerted or no-op'd with no action that changed based
  on fresh feedback. **Repaired same day**: added the fresh-vs-sustained
  memory check and the escalation path described above. This closes the
  missing "next action that can change in response to feedback" gap. Updated
  live via `manage_automation` (schedule and 12h cadence unchanged).

## 4. ID-lookup hardening check

**One-sentence explanation:** Any backend function that looks up an entity
by a client-supplied ID needs to return a clean 404/400 on a malformed or
unknown ID instead of crashing with a 500 — and this has already had to be
caught twice.

- **Trigger:** A new (or edited) backend function accepts an entity ID from
  client input (e.g. `agent_listing_id`) and looks it up via
  `entities.X.filter({ id })`.
- **Action:** QA/review tests the endpoint with a malformed or nonexistent
  ID, not just valid ones.
- **Check:** Does the lookup crash with an unhandled 500 (bad ObjectId cast,
  etc.), or does it return a clean 4xx?
- **Stop conditions:** Pass = wrapped in try/catch with a graceful
  "not found" response (the pattern now used in both `getAgentDetail.ts` and
  `getAuthorAnalytics.ts`). Fail = fix before merge, matching the Sprint 7
  fix.
- **Evidence:** Proven recurrent — `getAuthorAnalytics.ts` originally crashed
  on an unknown `agent_listing_id` (found + fixed during Sprint 7 QA), and
  the identical defensive pattern was then proactively built into
  `getAgentDetail.ts` from the start in Sprint 8. Two concrete occurrences
  across two sprints.
- **Saved:** 2026-07-07

---

## Candidate loop — not yet saved as proven

**WhatsApp @mention specialist routing**
(`spectra-symphony/integrations/whatsapp_routing_protocol.md`): a designed
protocol where Spectra posts `@Handle <task>` to a WhatsApp group, the named
specialist agent replies `✅ @Spectra [DONE]`, with a 5-minute silent-timeout
escalation rule. Only validated once, as a Sprint 4 spike
(Spectra → @BackendAgent → @QAAgent → Spectra) — not in active production
use, since specialists currently run as personas inside this single
conversation rather than separate WhatsApp-connected agents. Worth
formalizing as Loop 5 if/when that multi-number setup actually gets used
for real work.

---

Ask Spectra to run, audit, or adapt any of these, or to craft a new one for a
different repeated task.
