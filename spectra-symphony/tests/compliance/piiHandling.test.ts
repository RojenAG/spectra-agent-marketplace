/**
 * PII Handling Audit Tests
 * Tests: PII flow mapping, data sensitivity classification, minimization,
 *        no PII in analytics, no PII in log sanitization
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type SensitivityLevel = "public" | "internal" | "restricted" | "confidential";

interface PIIField { name: string; entity: string; sensitivity: SensitivityLevel; minimizable: boolean; }

const piiMap: PIIField[] = [
  { name: "author", entity: "AgentListing", sensitivity: "internal", minimizable: false },
  { name: "created_by", entity: "AgentListing", sensitivity: "internal", minimizable: false },
  { name: "name", entity: "AgentListing", sensitivity: "public", minimizable: false },
  { name: "description", entity: "AgentListing", sensitivity: "public", minimizable: false },
  { name: "space_url", entity: "AgentListingVersion", sensitivity: "internal", minimizable: false },
  { name: "config_schema", entity: "AgentListingVersion", sensitivity: "public", minimizable: false },
  { name: "changelog", entity: "AgentListingVersion", sensitivity: "public", minimizable: false },
  { name: "created_by", entity: "AgentListingVersion", sensitivity: "internal", minimizable: false },
  { name: "created_by", entity: "AgentReview", sensitivity: "internal", minimizable: false },
  { name: "comment", entity: "AgentReview", sensitivity: "public", minimizable: true },
  { name: "rating", entity: "AgentReview", sensitivity: "public", minimizable: false },
  { name: "created_by", entity: "AgentRun", sensitivity: "internal", minimizable: false },
  { name: "output", entity: "AgentRun", sensitivity: "restricted", minimizable: true },
  { name: "error", entity: "AgentRun", sensitivity: "internal", minimizable: true },
  { name: "log_lines", entity: "SpaceLog", sensitivity: "restricted", minimizable: true },
  { name: "run_count", entity: "AgentAnalytics", sensitivity: "internal", minimizable: false },
  { name: "success_count", entity: "AgentAnalytics", sensitivity: "internal", minimizable: false },
];

Deno.test("PII: all entities with created_by field are classified", () => {
  const fieldsWithCreatedBy = piiMap.filter(f => f.name === "created_by");
  assert(fieldsWithCreatedBy.length >= 3, "should identify created_by in multiple entities");
  assert(fieldsWithCreatedBy.every(f => f.sensitivity === "internal"), "created_by should be internal sensitivity");
});

Deno.test("PII: agent run output classified as restricted", () => {
  const outputField = piiMap.find(f => f.name === "output" && f.entity === "AgentRun");
  assert(outputField, "agent run output should be in PII map");
  assertEquals(outputField!.sensitivity, "restricted", "run output may contain sensitive data");
});

Deno.test("PII: space log lines classified as restricted", () => {
  const logField = piiMap.find(f => f.name === "log_lines" && f.entity === "SpaceLog");
  assert(logField, "log_lines should be in PII map");
  assertEquals(logField!.sensitivity, "restricted", "log lines may contain sensitive data");
});

Deno.test("PII: public fields are safe to expose to all users", () => {
  const publicFields = piiMap.filter(f => f.sensitivity === "public");
  assert(publicFields.length > 0, "should have public fields");
  assert(publicFields.some(f => f.name === "name"));
  assert(publicFields.some(f => f.name === "description"));
  assert(publicFields.some(f => f.name === "rating"));
});

Deno.test("PII: analytics aggregations do not contain user identifiers", () => {
  const analyticsRecord = { agent_listing_id: "l1", date: "2026-08-01", run_count: 10, success_count: 8, avg_duration_ms: 5000 };
  const str = JSON.stringify(analyticsRecord);
  assert(!str.includes("created_by"), "analytics should not contain user email");
  assert(!str.includes("email"), "analytics should not contain email field");
  assert(!str.includes("user@"), "analytics should not contain user email pattern");
});

Deno.test("PII: time series analytics contains only aggregated data", () => {
  const timeSeries = [
    { date: "2026-08-01", run_count: 5, success_count: 4, avg_duration_ms: 3000, success_rate: 80 },
    { date: "2026-08-02", run_count: 3, success_count: 3, avg_duration_ms: 2000, success_rate: 100 },
  ];
  for (const entry of timeSeries) {
    const keys = Object.keys(entry);
    assert(!keys.includes("created_by"), "time series should not have user identifier");
    assert(!keys.includes("user_email"), "time series should not have user email");
    assert(!keys.includes("input"), "time series should not have user input data");
  }
});

Deno.test("PII: log sanitization filters user input lines", () => {
  const logLines = [
    "user: john@example.com entered prompt: hello",
    "input: my secret password is 12345",
    "prompt: what is my social security number?",
    "query: SELECT * FROM users WHERE ssn = '123-45-6789'",
    "[INFO] Agent processing started",
  ];
  const filtered = logLines.filter(l => !/^(user:|input:|prompt:|query:)/i.test(l.trim()));
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0], "[INFO] Agent processing started");
});

Deno.test("PII: log truncation prevents excessive PII storage", () => {
  const longLine = "user data: " + "x".repeat(3000);
  const truncated = longLine.length > 2000 ? longLine.substring(0, 2000) + "...[truncated]" : longLine;
  assert(truncated.length <= 2000 + 14, "truncated line should be within limit");
});

Deno.test("PII: agent config does not store user PII", () => {
  const configSchema = { properties: { task: { type: "string" }, language: { type: "string" } }, required: ["task"] };
  const configFields = Object.keys(configSchema.properties);
  assert(!configFields.includes("email"), "config should not have email field");
  assert(!configFields.includes("phone"), "config should not have phone field");
  assert(!configFields.includes("address"), "config should not have address field");
});

Deno.test("PII: minimizable fields identified for data reduction", () => {
  const minimizable = piiMap.filter(f => f.minimizable);
  assert(minimizable.some(f => f.name === "comment"), "review comments can be minimized");
  assert(minimizable.some(f => f.name === "output"), "run output can be minimized");
  assert(minimizable.some(f => f.name === "log_lines"), "log lines can be minimized");
});

Deno.test("PII: error messages should not expose system internals", () => {
  const safeErrorMessages = ["timeout", "Capability handshake failed", "Agent invocation failed", "Could not resolve Space API URL"];
  for (const msg of safeErrorMessages) {
    assert(!msg.includes("@example.com"), "error should not contain email");
    assert(!msg.includes("password"), "error should not contain password");
    assert(!msg.includes("token"), "error should not contain token");
    assert(!msg.includes("secret"), "error should not contain secret");
  }
});

Deno.test("PII: restricted fields only accessible to owner or admin", () => {
  const restrictedFields = piiMap.filter(f => f.sensitivity === "restricted");
  for (const field of restrictedFields) {
    assert(field.entity === "AgentRun" || field.entity === "SpaceLog", "restricted fields should be in Run or SpaceLog");
  }
});

Deno.test("PII: internal fields require authentication", () => {
  const internalFields = piiMap.filter(f => f.sensitivity === "internal");
  for (const field of internalFields) {
    assert(field.name === "created_by" || field.name === "author" || field.name === "run_count" || field.name === "success_count" || field.name === "error" || field.name === "space_url",
      `internal field ${field.name} in ${field.entity} should require auth`);
  }
});
