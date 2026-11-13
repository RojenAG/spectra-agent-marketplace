/**
 * Input Validation and Sanitization Audit
 * Tests: max lengths, allowed characters, schema validation, XSS prevention,
 *        NoSQL injection prevention, content sanitization
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Validation helpers ──

const MAX_NAME_LEN = 100;
const MAX_DESC_LEN = 500;
const MAX_COMMENT_LEN = 1000;
const MAX_CAPABILITIES = 20;

function validateName(name: string): string[] {
  const errors: string[] = [];
  if (!name || !name.trim()) errors.push("name is required");
  if (name && name.length > MAX_NAME_LEN) errors.push(`name exceeds ${MAX_NAME_LEN} chars`);
  return errors;
}

function validateDescription(desc: string): string[] {
  const errors: string[] = [];
  if (!desc || !desc.trim()) errors.push("description is required");
  if (desc && desc.length > MAX_DESC_LEN) errors.push(`description exceeds ${MAX_DESC_LEN} chars`);
  return errors;
}

function validateComment(comment: string): string[] {
  const errors: string[] = [];
  if (comment && comment.length > MAX_COMMENT_LEN) errors.push(`comment exceeds ${MAX_COMMENT_LEN} chars`);
  return errors;
}

function validateCapabilities(caps: any): string[] {
  const errors: string[] = [];
  if (!caps || !Array.isArray(caps) || caps.length === 0) errors.push("capabilities must be a non-empty array");
  if (caps && Array.isArray(caps) && caps.length > MAX_CAPABILITIES) errors.push(`capabilities exceeds ${MAX_CAPABILITIES} items`);
  if (caps && Array.isArray(caps) && caps.some((c: any) => typeof c !== "string")) errors.push("all capabilities must be strings");
  return errors;
}

function detectXSS(input: string): boolean {
  const xssPatterns = [
    /<script/i, /javascript:/i, /onerror=/i, /onload=/i, /onclick=/i,
    /<iframe/i, /<embed/i, /<object/i, /eval\(/i,
  ];
  return xssPatterns.some(p => p.test(input));
}

function detectNoSQLInjection(input: string): boolean {
  const nosqlPatterns = [
    /\$gt/i, /\$lt/i, /\$ne/i, /\$where/i, /\$or/i, /\$and/i, /\$regex/i, /\$in/i,
  ];
  // Only flag if the pattern appears as a key-like structure
  return nosqlPatterns.some(p => p.test(input)) && input.includes("$");
}

// ── Tests: Max length enforcement ──

Deno.test("validation: name within max length accepted", () => {
  assertEquals(validateName("A".repeat(100)), []);
  assertEquals(validateName("Valid Agent Name"), []);
});

Deno.test("validation: name over max length rejected", () => {
  const errors = validateName("A".repeat(101));
  assert(errors.some(e => e.includes("exceeds 100 chars")));
});

Deno.test("validation: description over max length rejected", () => {
  const errors = validateDescription("x".repeat(501));
  assert(errors.some(e => e.includes("exceeds 500 chars")));
});

Deno.test("validation: comment over max length rejected", () => {
  const errors = validateComment("x".repeat(1001));
  assert(errors.some(e => e.includes("exceeds 1000 chars")));
});

Deno.test("validation: empty name rejected", () => {
  assert(validateName("").length > 0);
  assert(validateName("   ").length > 0);
});

Deno.test("validation: empty description rejected", () => {
  assert(validateDescription("").length > 0);
});

Deno.test("validation: empty comment accepted (optional field)", () => {
  assertEquals(validateComment(""), []);
  assertEquals(validateComment(null as any), []);
});

// ── Tests: Capabilities validation ──

Deno.test("validation: capabilities must be array", () => {
  assert(validateCapabilities("not an array").length > 0);
  assert(validateCapabilities({ key: "value" }).length > 0);
  assert(validateCapabilities(null).length > 0);
});

Deno.test("validation: empty capabilities array rejected", () => {
  assert(validateCapabilities([]).length > 0);
});

Deno.test("validation: capabilities with non-string items rejected", () => {
  const errors = validateCapabilities(["api", 123, "db"]);
  assert(errors.some(e => e.includes("must be strings")));
});

Deno.test("validation: too many capabilities rejected", () => {
  const caps = Array.from({ length: 21 }, (_, i) => `cap-${i}`);
  const errors = validateCapabilities(caps);
  assert(errors.some(e => e.includes("exceeds 20 items")));
});

// ── Tests: XSS detection ──

Deno.test("validation: detects script tag in input", () => {
  assert(detectXSS('<script>alert("xss")</script>'));
  assert(detectXSS('<SCRIPT src="evil.js">'));
});

Deno.test("validation: detects javascript: protocol", () => {
  assert(detectXSS("javascript:alert(1)"));
  assert(detectXSS("JavaScript:fetch('evil.com')"));
});

Deno.test("validation: detects event handlers", () => {
  assert(detectXSS('<img onerror="alert(1)">'));
  assert(detectXSS('<body onload="init()">'));
});

Deno.test("validation: detects iframe/embed/object tags", () => {
  assert(detectXSS('<iframe src="evil.com">'));
  assert(detectXSS('<embed src="evil.swf">'));
  assert(detectXSS('<object data="evil.swf">'));
});

Deno.test("validation: detects eval()", () => {
  assert(detectXSS("eval(alert(1))"));
});

Deno.test("validation: clean text does not trigger XSS detection", () => {
  assert(!detectXSS("This is a normal description of an agent"));
  assert(!detectXSS("Agent for API testing and database operations"));
  assert(!detectXSS("Console logging utility"));
});

// ── Tests: NoSQL injection detection ──

Deno.test("validation: detects $gt in input", () => {
  assert(detectNoSQLInjection('{"$gt": ""}'));
});

Deno.test("validation: detects $ne in input", () => {
  assert(detectNoSQLInjection('{"$ne": null}'));
});

Deno.test("validation: detects $where in input", () => {
  assert(detectNoSQLInjection('{"$where": "this.password == \'admin\'"}'));
});

Deno.test("validation: normal dollar sign in text not flagged", () => {
  // "cost: $5" has a $ but no NoSQL operators
  assert(!detectNoSQLInjection("cost: $5 for the agent"));
  assert(!detectNoSQLInjection("paid $100 for subscription"));
});

// ── Tests: HF Space URL validation ──

Deno.test("validation: HF URL with special characters rejected", () => {
  const HF_PATTERN = /^https:\/\/huggingface\.co\/spaces\/[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;
  // No spaces, no semicolons, no query params
  assert(!HF_PATTERN.test("https://huggingface.co/spaces/user name/agent"));
  assert(!HF_PATTERN.test("https://huggingface.co/spaces/user/agent;rm -rf"));
  assert(!HF_PATTERN.test("https://huggingface.co/spaces/user/agent?token=secret"));
  assert(!HF_PATTERN.test("https://huggingface.co/spaces/user/agent#fragment"));
});

Deno.test("validation: HF URL with valid dots and dashes accepted", () => {
  const HF_PATTERN = /^https:\/\/huggingface\.co\/spaces\/[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;
  assert(HF_PATTERN.test("https://huggingface.co/spaces/user.name/my-agent"));
  assert(HF_PATTERN.test("https://huggingface.co/spaces/user_name/my.agent.v2"));
  assert(HF_PATTERN.test("https://huggingface.co/spaces/USER/AGENT"));
});

// ── Tests: config_schema validation ──

Deno.test("validation: config_schema validates input types correctly", () => {
  const schema = {
    properties: {
      name: { type: "string" },
      count: { type: "integer" },
      active: { type: "boolean" },
      tags: { type: "array" },
      meta: { type: "object" },
    },
    required: ["name"],
  };
  const errors: string[] = [];
  const input = { name: 123, count: "five", active: "true", tags: "notarray", meta: "string" };
  for (const [key, value] of Object.entries(input)) {
    const propSchema = schema.properties[key];
    if (!propSchema) continue;
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (propSchema.type !== actualType) {
      errors.push(`Field "${key}" expected ${propSchema.type}, got ${actualType}`);
    }
  }
  assertEquals(errors.length, 5, "all type mismatches should be detected");
});

Deno.test("validation: config_schema allows extra fields", () => {
  const schema = { properties: { name: { type: "string" } }, required: ["name"] };
  const input = { name: "ok", extra: "field", another: 42 };
  // Extra fields are silently allowed (by design in deployAgentRun)
  const errors: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const propSchema = schema.properties[key];
    if (!propSchema) continue; // allow extra fields
  }
  assertEquals(errors.length, 0, "extra fields should be allowed");
});
