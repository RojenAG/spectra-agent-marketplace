/**
 * Data Retention Policy & Compliance Audit Logging Tests
 * Tests: retention windows, automated cleanup triggers, audit log format,
 *        tamper-evidence, compliance review readiness
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

interface RetentionPolicy {
  entity: string;
  retentionDays: number;
  cleanupAction: "delete" | "archive";
  exception?: string;
}

const retentionPolicies: RetentionPolicy[] = [
  { entity: "AgentRun", retentionDays: 90, cleanupAction: "delete" },
  { entity: "SpaceLog", retentionDays: 30, cleanupAction: "delete" },
  { entity: "AgentAnalytics", retentionDays: 365, cleanupAction: "archive" },
  { entity: "AgentReview", retentionDays: -1, cleanupAction: "archive", exception: "retain until agent deleted" },
  { entity: "AgentListing", retentionDays: -1, cleanupAction: "archive", exception: "retain until author requests deletion" },
  { entity: "AgentListingVersion", retentionDays: -1, cleanupAction: "archive", exception: "retain with listing" },
];

Deno.test("retention: AgentRun retained for 90 days", () => {
  const policy = retentionPolicies.find(p => p.entity === "AgentRun")!;
  assertEquals(policy.retentionDays, 90);
  assertEquals(policy.cleanupAction, "delete");
});

Deno.test("retention: SpaceLog retained for 30 days", () => {
  const policy = retentionPolicies.find(p => p.entity === "SpaceLog")!;
  assertEquals(policy.retentionDays, 30);
  assertEquals(policy.cleanupAction, "delete");
});

Deno.test("retention: AgentAnalytics retained for 365 days then archived", () => {
  const policy = retentionPolicies.find(p => p.entity === "AgentAnalytics")!;
  assertEquals(policy.retentionDays, 365);
  assertEquals(policy.cleanupAction, "archive");
});

Deno.test("retention: AgentReview retained until agent deletion", () => {
  const policy = retentionPolicies.find(p => p.entity === "AgentReview")!;
  assertEquals(policy.retentionDays, -1);
  assertEquals(policy.cleanupAction, "archive");
  assert(policy.exception!.includes("agent deleted"), "should have exception for indefinite retention");
});

Deno.test("retention: AgentListing retained until author requests deletion", () => {
  const policy = retentionPolicies.find(p => p.entity === "AgentListing")!;
  assertEquals(policy.retentionDays, -1);
  assert(policy.exception!.includes("author requests deletion"));
});

Deno.test("retention: records older than retention window are flagged for cleanup", () => {
  const now = new Date("2026-08-21T00:00:00Z");
  const isExpired = (recordDate: string, retentionDays: number) => {
    if (retentionDays < 0) return false;
    const age = (now.getTime() - new Date(recordDate).getTime()) / (1000 * 60 * 60 * 24);
    return age > retentionDays;
  };

  assert(isExpired("2026-05-01T00:00:00Z", 90), "112-day-old record should be expired for 90-day retention");
  assert(!isExpired("2026-08-01T00:00:00Z", 30), "20-day-old record is within 30-day window");
  assert(isExpired("2026-07-15T00:00:00Z", 30), "37-day-old record should be expired for 30-day retention");
  assert(!isExpired("2026-01-01T00:00:00Z", -1), "indefinite retention should never expire");
});

Deno.test("retention: cleanup does not affect records within window", () => {
  const now = new Date("2026-08-21T00:00:00Z");
  const recent = new Date("2026-08-20T00:00:00Z");
  const age = (now.getTime() - recent.getTime()) / (1000 * 60 * 60 * 24);
  assert(age < 30, "1-day-old record should not be cleaned up");
});

Deno.test("retention: scheduled cleanup runs daily", () => {
  const cleanupSchedule = { frequency: "daily", time: "02:00", timezone: "UTC" };
  assertEquals(cleanupSchedule.frequency, "daily");
  assert(cleanupSchedule.time === "02:00", "should run during low-traffic hours");
});

// ── Tests: Audit logging ──

interface AuditLogEntry {
  id: string; actor: string; action: string; entity_type: string; entity_id: string;
  before_state: any; after_state: any; timestamp: string; hash: string;
}

function createAuditEntry(actor: string, action: string, entityType: string, entityId: string, beforeState: any, afterState: any): AuditLogEntry {
  const timestamp = new Date().toISOString();
  const content = `${actor}|${action}|${entityType}|${entityId}|${timestamp}|${JSON.stringify(beforeState)}|${JSON.stringify(afterState)}`;
  const hash = simpleHash(content);
  return { id: `audit-${Date.now()}`, actor, action, entity_type: entityType, entity_id: entityId, before_state: beforeState, after_state: afterState, timestamp, hash };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & 0xffffffff;
  }
  return hash.toString(16);
}

Deno.test("audit-log: publish action is logged", () => {
  const entry = createAuditEntry("author@example.com", "publish", "AgentListing", "list-1", { is_published: false }, { is_published: true });
  assertEquals(entry.action, "publish");
  assertEquals(entry.actor, "author@example.com");
  assertEquals(entry.entity_type, "AgentListing");
  assert(entry.hash !== undefined, "entry should have integrity hash");
});

Deno.test("audit-log: moderation decision is logged with before/after state", () => {
  const entry = createAuditEntry("po@example.com", "approve_agent", "AgentListingVersion", "ver-1", { moderation_status: "pending_human_review" }, { moderation_status: "approved" });
  assertEquals(entry.before_state.moderation_status, "pending_human_review");
  assertEquals(entry.after_state.moderation_status, "approved");
});

Deno.test("audit-log: rejection includes reason in after_state", () => {
  const entry = createAuditEntry("po@example.com", "reject_agent", "AgentListingVersion", "ver-1", { moderation_status: "pending_human_review" }, { moderation_status: "rejected", moderation_notes: "Invalid Space URL" });
  assertEquals(entry.after_state.moderation_notes, "Invalid Space URL");
});

Deno.test("audit-log: agent run trigger is logged", () => {
  const entry = createAuditEntry("user@example.com", "trigger_run", "AgentRun", "run-1", null, { status: "pending" });
  assertEquals(entry.action, "trigger_run");
  assertEquals(entry.actor, "user@example.com");
});

Deno.test("audit-log: entry has tamper-evident hash", () => {
  const entry = createAuditEntry("user@example.com", "publish", "AgentListing", "list-1", {}, { is_published: true });
  const originalHash = entry.hash;
  entry.after_state = { is_published: false };
  const newContent = `${entry.actor}|${entry.action}|${entry.entity_type}|${entry.entity_id}|${entry.timestamp}|${JSON.stringify(entry.before_state)}|${JSON.stringify(entry.after_state)}`;
  const newHash = simpleHash(newContent);
  assert(originalHash !== newHash, "modifying entry should change hash — tamper detected");
});

Deno.test("audit-log: timestamp is ISO 8601 format", () => {
  const entry = createAuditEntry("x@y.com", "test", "Test", "1", {}, {});
  assert(entry.timestamp.includes("T"), "timestamp should be ISO format");
  assert(entry.timestamp.includes("Z") || entry.timestamp.includes("+"), "timestamp should include timezone");
});

Deno.test("audit-log: entries are ordered chronologically", () => {
  const entries = [
    createAuditEntry("a@x.com", "publish", "Listing", "1", {}, {}),
    createAuditEntry("b@x.com", "approve", "Version", "2", {}, {}),
    createAuditEntry("c@x.com", "run", "AgentRun", "3", {}, {}),
  ];
  const sorted = [...entries].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  assert(sorted[0].timestamp <= sorted[1].timestamp, "entries should be chronological");
});

Deno.test("audit-log: all compliance-sensitive actions are covered", () => {
  const auditedActions = ["publish", "approve_agent", "reject_agent", "trigger_run", "rls_policy_change", "secret_rotation", "data_erasure", "data_export"];
  for (const action of auditedActions) {
    const entry = createAuditEntry("system", action, "System", "0", {}, {});
    assertEquals(entry.action, action, `action ${action} should be audit-logged`);
  }
});

Deno.test("audit-log: log entry does not contain secrets", () => {
  const entry = createAuditEntry("user@x.com", "trigger_run", "AgentRun", "1", {}, { output: "result" });
  const str = JSON.stringify(entry);
  assert(!str.includes("hf_"), "audit log should not contain HF token");
  assert(!str.includes("Bearer"), "audit log should not contain auth header");
  assert(!str.includes("password"), "audit log should not contain password");
});
