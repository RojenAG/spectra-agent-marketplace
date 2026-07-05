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

## 3. Credit budget alert (potential loop — monitor only, no corrective action)

**One-sentence explanation:** Every 12 hours, check daily/monthly credit
usage and alert if it crosses 90%.

- **Trigger:** Scheduled, every 12 hours.
- **Action:** "Budget Alert - 90% Credit Usage" reads current usage from
  context.
- **Check:** Usage ≥ 90% daily or monthly.
- **Stop conditions:** None that change behavior — it alerts or no-ops, it
  doesn't take a corrective action based on the result. This is why it's
  flagged as a *potential* loop rather than a qualified one: it's missing "a
  next action that can change in response to fresh feedback." Worth
  discussing if you want it to actually do something (e.g. pause
  non-essential automations) when the threshold is crossed.
- **Evidence:** Live scheduled automation, one occurrence pattern (recurring
  schedule, not yet observed reacting differently to different usage levels).
- **Saved:** 2026-07-05

---

Ask Spectra to run, audit, or adapt any of these, or to craft a new one for a
different repeated task.
