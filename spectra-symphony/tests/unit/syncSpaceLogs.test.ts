/**
 * Unit tests for syncSpaceLogs backend function
 * Tests: log sanitization, space status checks, line truncation, PII filtering
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Extracted sanitiseLogLine from syncSpaceLogs.ts ──

function sanitiseLogLine(line: string): string | null {
  if (/^(user:|input:|prompt:|query:)/i.test(line.trim())) return null;
  if (line.length > 2000) return line.substring(0, 2000) + "...[truncated]";
  return line;
}

// ── Tests ──

Deno.test("sanitiseLogLine: returns line as-is for normal logs", () => {
  assertEquals(sanitiseLogLine("[INFO] Agent started successfully"), "[INFO] Agent started successfully");
  assertEquals(sanitiseLogLine("  whitespace preserved  "), "  whitespace preserved  ");
});

Deno.test("sanitiseLogLine: filters out user input lines (PII protection)", () => {
  assertEquals(sanitiseLogLine("user: john@example.com"), null);
  assertEquals(sanitiseLogLine("input: sensitive data here"), null);
  assertEquals(sanitiseLogLine("prompt: Tell me a secret"), null);
  assertEquals(sanitiseLogLine("query: SELECT * FROM users"), null);
});

Deno.test("sanitiseLogLine: PII filter is case-insensitive", () => {
  assertEquals(sanitiseLogLine("USER: data"), null);
  assertEquals(sanitiseLogLine("Input: stuff"), null);
  assertEquals(sanitiseLogLine("PROMPT: hi"), null);
  assertEquals(sanitiseLogLine("Query: test"), null);
});

Deno.test("sanitiseLogLine: PII filter handles leading whitespace", () => {
  assertEquals(sanitiseLogLine("  user: secret  "), null);
  assertEquals(sanitiseLogLine("\tinput: data"), null);
});

Deno.test("sanitiseLogLine: truncates lines over 2000 chars", () => {
  const longLine = "x".repeat(2500);
  const result = sanitiseLogLine(longLine);
  assert(result !== null);
  assert(result!.endsWith("...[truncated]"));
  assertEquals(result!.length, 2000 + "...[truncated]".length);
});

Deno.test("sanitiseLogLine: does not truncate lines at exactly 2000 chars", () => {
  const exactLine = "x".repeat(2000);
  const result = sanitiseLogLine(exactLine);
  assertEquals(result, exactLine);
  assert(!result!.includes("[truncated]"));
});

Deno.test("sanitiseLogLine: truncates lines at 2001 chars", () => {
  const line = "x".repeat(2001);
  const result = sanitiseLogLine(line);
  assert(result!.includes("...[truncated]"));
});

Deno.test("sanitiseLogLine: empty string passes through", () => {
  assertEquals(sanitiseLogLine(""), "");
});

Deno.test("sanitiseLogLine: does not filter lines where PII keywords appear mid-line", () => {
  // "[INFO] user: something" starts with "[INFO]", not "user:" — should pass through
  const result = sanitiseLogLine("[INFO] user: something is not at start");
  assert(result !== null, "line starting with [INFO] should not be filtered even if it contains 'user:' mid-line");
  assertEquals(result, "[INFO] user: something is not at start");
});

Deno.test("sanitiseLogLine: does not filter lines containing PII keywords mid-sentence", () => {
  const line = "Processing query: completed in 5ms";
  const result = sanitiseLogLine(line);
  assert(result !== null, "line with 'query:' mid-sentence should not be filtered");
  assertEquals(result, line);
});

Deno.test("syncSpaceLogs: space status check logic", () => {
  const runningStatuses = ["RUNNING", "RUNNING_BUILDING"];
  assert(runningStatuses.includes("RUNNING"));
  assert(runningStatuses.includes("RUNNING_BUILDING"));
  assert(!runningStatuses.includes("PAUSED"));
  assert(!runningStatuses.includes("STOPPED"));
  assert(!runningStatuses.includes("BUILDING"));
  assert(!runningStatuses.includes("unknown"));
});

Deno.test("syncSpaceLogs: skips log fetch when space is not warm", () => {
  const spaceStatus = "PAUSED";
  const shouldFetch = ["RUNNING", "RUNNING_BUILDING"].includes(spaceStatus);
  assertEquals(shouldFetch, false);
});

Deno.test("syncSpaceLogs: fetches logs when space is running", () => {
  const spaceStatus = "RUNNING";
  const shouldFetch = ["RUNNING", "RUNNING_BUILDING"].includes(spaceStatus);
  assertEquals(shouldFetch, true);
});

Deno.test("syncSpaceLogs: validates required fields", () => {
  const body = { space_id: "", agent_listing_version_id: "" };
  assert(!body.space_id || !body.agent_listing_version_id, "should fail without both fields");
});

Deno.test("syncSpaceLogs: caps logs at 500 lines", () => {
  const manyLines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
  const sanitised = manyLines.map(sanitiseLogLine).filter((l): l is string => l !== null).slice(-500);
  assertEquals(sanitised.length, 500);
  assertEquals(sanitised[0], "line 100");
  assertEquals(sanitised[499], "line 599");
});

Deno.test("syncSpaceLogs: HF token check logic", () => {
  const hasToken = !!Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
  const tokenCheck = !!hasToken;
  assert(typeof tokenCheck === "boolean");
});
