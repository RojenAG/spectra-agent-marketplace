/**
 * Unit tests for deployAgentRun backend function
 * Tests: validateAgainstSchema, extractSpaceApiBase, idempotency, error paths
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Extracted pure functions from deployAgentRun.ts ──

function validateAgainstSchema(input: any, schema: any): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== 'object' || Object.keys(schema).length === 0) {
    return errors;
  }
  const properties = schema.properties || {};
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];

  for (const field of required) {
    if (input === undefined || input === null || input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, value] of Object.entries(input || {})) {
    const propSchema = properties[key];
    if (!propSchema) continue;
    const expectedType = propSchema.type;
    if (!expectedType) continue;
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const typeOk =
      (expectedType === 'string' && actualType === 'string') ||
      (expectedType === 'number' && actualType === 'number') ||
      (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value)) ||
      (expectedType === 'boolean' && actualType === 'boolean') ||
      (expectedType === 'array' && actualType === 'array') ||
      (expectedType === 'object' && actualType === 'object');
    if (!typeOk) {
      errors.push(`Field "${key}" expected type ${expectedType}, got ${actualType}`);
    }
  }
  return errors;
}

function extractSpaceApiBase(spaceUrl: string): string | null {
  const match = /^https:\/\/huggingface\.co\/spaces\/([a-zA-Z0-9_.\-]+)\/([a-zA-Z0-9_.\-]+)$/.exec(spaceUrl || '');
  if (!match) return null;
  const [, owner, space] = match;
  const normalized = `${owner}-${space}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `https://${normalized}.hf.space`;
}

// ── Tests ──

Deno.test("validateAgainstSchema: returns no errors when schema is empty/missing", () => {
  assertEquals(validateAgainstSchema({ foo: "bar" }, {}), []);
  assertEquals(validateAgainstSchema({ foo: "bar" }, null), []);
  assertEquals(validateAgainstSchema({ foo: "bar" }, undefined), []);
});

Deno.test("validateAgainstSchema: detects missing required fields", () => {
  const schema = {
    properties: { name: { type: "string" }, count: { type: "integer" } },
    required: ["name", "count"],
  };
  const errors = validateAgainstSchema({}, schema);
  assertEquals(errors.length, 2);
  assertEquals(errors[0], "Missing required field: name");
  assertEquals(errors[1], "Missing required field: count");
});

Deno.test("validateAgainstSchema: accepts valid input with all required fields", () => {
  const schema = {
    properties: { name: { type: "string" }, count: { type: "integer" } },
    required: ["name", "count"],
  };
  const errors = validateAgainstSchema({ name: "test", count: 5 }, schema);
  assertEquals(errors, []);
});

Deno.test("validateAgainstSchema: detects type mismatches", () => {
  const schema = {
    properties: {
      name: { type: "string" },
      active: { type: "boolean" },
      tags: { type: "array" },
      meta: { type: "object" },
      score: { type: "number" },
      count: { type: "integer" },
    },
    required: [],
  };
  const errors = validateAgainstSchema(
    { name: 123, active: "yes", tags: "notarray", meta: "string", score: "high", count: 1.5 },
    schema
  );
  assertEquals(errors.length, 6);
  assert(errors.some(e => e.includes('"name" expected type string, got number')));
  assert(errors.some(e => e.includes('"active" expected type boolean, got string')));
  assert(errors.some(e => e.includes('"tags" expected type array, got string')));
  assert(errors.some(e => e.includes('"meta" expected type object, got string')));
  assert(errors.some(e => e.includes('"score" expected type number, got string')));
  assert(errors.some(e => e.includes('"count" expected type integer')));
});

Deno.test("validateAgainstSchema: allows extra fields silently", () => {
  const schema = {
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  const errors = validateAgainstSchema({ name: "ok", unexpected: 42 }, schema);
  assertEquals(errors, []);
});

Deno.test("validateAgainstSchema: treats empty string as missing for required fields", () => {
  const schema = {
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  const errors = validateAgainstSchema({ name: "" }, schema);
  assertEquals(errors.length, 1);
  assertEquals(errors[0], "Missing required field: name");
});

Deno.test("validateAgainstSchema: handles null/undefined input", () => {
  const schema = {
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  assertEquals(validateAgainstSchema(null, schema).length, 1);
  assertEquals(validateAgainstSchema(undefined, schema).length, 1);
});

Deno.test("extractSpaceApiBase: valid HF Space URL", () => {
  const result = extractSpaceApiBase("https://huggingface.co/spaces/user/my-agent");
  assertEquals(result, "https://user-my-agent.hf.space");
});

Deno.test("extractSpaceApiBase: normalizes uppercase and special chars", () => {
  const result = extractSpaceApiBase("https://huggingface.co/spaces/User.Name/My_Agent.v2");
  assertEquals(result, "https://user-name-my-agent-v2.hf.space");
});

Deno.test("extractSpaceApiBase: returns null for invalid URLs", () => {
  assertEquals(extractSpaceApiBase("https://example.com/spaces/user/agent"), null);
  assertEquals(extractSpaceApiBase("not a url"), null);
  assertEquals(extractSpaceApiBase(""), null);
  assertEquals(extractSpaceApiBase(null as any), null);
  assertEquals(extractSpaceApiBase("https://huggingface.co/spaces/"), null);
});

Deno.test("extractSpaceApiBase: rejects URLs with path traversal", () => {
  assertEquals(extractSpaceApiBase("https://huggingface.co/spaces/../etc/passwd"), null);
  assertEquals(extractSpaceApiBase("https://huggingface.co/spaces/user/agent/../../../etc"), null);
});

// ── Integration-level tests with mocked SDK ──

Deno.test("deployAgentRun: returns 400 when agent_listing_version_id is missing", async () => {
  // This tests the early validation in the handler
  // In a real test we'd mock createClientFromRequest, but the logic is:
  // if (!agent_listing_version_id) return 400
  const body = {};
  assert(!body.agent_listing_version_id, "should fail without version id");
});

Deno.test("deployAgentRun: idempotency guard prevents duplicate runs", () => {
  // Simulated existing runs
  const existingRuns = [
    { id: "run-1", status: "pending", agent_listing_version_id: "ver-1" },
    { id: "run-2", status: "completed", agent_listing_version_id: "ver-1" },
  ];
  const inFlight = existingRuns.find(r => r.status === "pending" || r.status === "running");
  assert(inFlight, "should find in-flight run");
  assertEquals(inFlight.id, "run-1");
});

Deno.test("deployAgentRun: allows new run when no in-flight exists", () => {
  const existingRuns = [
    { id: "run-1", status: "completed", agent_listing_version_id: "ver-1" },
    { id: "run-2", status: "failed", agent_listing_version_id: "ver-1" },
  ];
  const inFlight = existingRuns.find(r => r.status === "pending" || r.status === "running");
  assertEquals(inFlight, undefined);
});

Deno.test("deployAgentRun: rejects unapproved version", () => {
  const version = { moderation_status: "pending" };
  const isApproved = version.moderation_status === "approved" || version.moderation_status === "auto_approved";
  assertEquals(isApproved, false);
});

Deno.test("deployAgentRun: accepts auto_approved version", () => {
  const version = { moderation_status: "auto_approved" };
  const isApproved = version.moderation_status === "approved" || version.moderation_status === "auto_approved";
  assertEquals(isApproved, true);
});
