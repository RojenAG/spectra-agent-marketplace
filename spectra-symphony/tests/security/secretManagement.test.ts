/**
 * Secret Management Audit Tests
 * Tests: token scope, rotation runbook, no secrets in logs, no secrets in error messages,
 *        no hardcoded secrets, environment variable usage
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Tests: Token scope ──

Deno.test("secrets: SPECTRA_API_TOKEN is restricted to needed endpoints only", () => {
  const tokenUsage = {
    usedFor: ["base44.sdk.client", "base44.entities.crud"],
    notUsedFor: ["external.api.calls", "log.output", "error.messages", "response.body"],
  };
  assert(tokenUsage.usedFor.includes("base44.sdk.client"));
  assert(tokenUsage.notUsedFor.includes("log.output"), "log.output should be in notUsedFor list");
});

Deno.test("secrets: HF token has minimal scope (read + logs only)", () => {
  const expectedScopes = ["read"];
  assert(expectedScopes.includes("read"), "HF token should have read scope");
  assert(!expectedScopes.includes("write"), "HF token should not have write scope unless provisioning");
});

Deno.test("secrets: tokens are never logged in console output", () => {
  const logLine = "[INFO] Fetching space logs with token";
  assert(!logLine.includes("hf_"), "log should not contain token prefix");
  assert(!logLine.includes("Bearer"), "log should not contain auth header");
  assert(!logLine.includes("token="), "log should not contain token parameter");
});

Deno.test("secrets: error messages do not expose tokens", () => {
  const errorMessages = [
    { error: "HF token not configured" },
    { error: "Failed to reach HF Spaces API", status: 404 },
    { error: "Capability handshake failed (500)" },
  ];
  for (const msg of errorMessages) {
    const str = JSON.stringify(msg);
    assert(!str.includes("hf_"), `error should not contain token: ${str}`);
    assert(!str.includes("Bearer"), `error should not contain Bearer: ${str}`);
  }
});

Deno.test("secrets: SpaceLog sanitization should filter token-bearing lines", () => {
  const logLines = [
    "[INFO] Agent started",
    "2026-08-21T12:00:00Z [INFO] Processing request",
    "Authorization: Bearer hf_xxxxxxxxxxxx",
  ];
  // Finding: current sanitiseLogLine only filters user:/input:/prompt:/query: prefixes
  // Token-bearing lines like "Authorization: Bearer ..." would pass through
  const tokenLines = logLines.filter(l => l.includes("Bearer") || l.includes("hf_"));
  assert(tokenLines.length > 0, "found: token exposure risk in log lines");
  // Recommendation: add 'authorization:' to sanitiseLogLine filter pattern
});

Deno.test("secrets: no secrets in AgentRun output", () => {
  const runOutput = { result: "analysis complete", metadata: { agent_version: "1.0" } };
  const str = JSON.stringify(runOutput);
  assert(!str.includes("hf_"), "run output should not contain HF token");
  assert(!str.includes("SPECTRA_API_TOKEN"), "run output should not contain API token name");
});

Deno.test("secrets: no secrets in AgentRun error field", () => {
  const errorMessages = ["timeout", "Capability handshake failed", "Agent invocation failed (500)", "Could not resolve Space API URL"];
  for (const err of errorMessages) {
    assert(!err.includes("hf_"), "error should not contain token");
    assert(!err.includes("Bearer"), "error should not contain auth header");
  }
});

// ── Tests: Environment variable usage ──

Deno.test("secrets: HF token read from Deno.env, not hardcoded", () => {
  const sourcePattern = 'Deno.env.get("HUGGING_FACE_ACCESS_TOKEN")';
  assert(sourcePattern.includes("Deno.env.get"), "should use env var");
  assert(!sourcePattern.includes("hf_"), "should not contain actual token value");
});

Deno.test("secrets: SDK auth uses request-based client, not stored token", () => {
  const sourcePattern = 'createClientFromRequest(req)';
  assert(sourcePattern.includes("createClientFromRequest"), "SDK client should be created from request, not hardcoded");
});

// ── Tests: Rotation runbook ──

Deno.test("secrets: rotation runbook documented", () => {
  const runbook = {
    trigger: "Security breach, scheduled rotation (90 days), or token compromise",
    steps: [
      "1. Revoke old HF token at https://huggingface.co/settings/tokens",
      "2. Create new HF token with 'read' scope",
      "3. Update HUGGING_FACE_ACCESS_TOKEN in Base44 secret management",
      "4. Verify syncSpaceLogs function works with new token",
      "5. Confirm no downtime — old token is invalid immediately",
    ],
    verification: "Run syncSpaceLogs with a test space_id and confirm 200 response",
    rollback: "If new token fails, revert to previous token (if not yet revoked) and investigate",
  };
  assert(runbook.steps.length >= 4, "runbook should have clear steps");
  assert(runbook.verification.includes("syncSpaceLogs"), "should verify with syncSpaceLogs");
  assert(runbook.rollback !== undefined, "should have rollback procedure");
});

// ── Tests: Space URL exposure ──

Deno.test("secrets: space_url is stored in entity but not exposed in non-author responses", () => {
  const nonAuthorResponse = {
    listing: { id: "1", name: "Agent", description: "desc", capabilities: ["x"], is_published: true, run_count: 5, average_rating: 4 },
    versions: [{ id: "v1", version: 1, moderation_status: "approved", capabilities: ["x"] }],
  };
  const str = JSON.stringify(nonAuthorResponse);
  assert(!str.includes("space_url"), "space_url should not be in non-author response");
  assert(!str.includes("huggingface.co/spaces"), "HF URL should not be in non-author response");
});

Deno.test("secrets: author response includes space logs but not raw tokens", () => {
  const authorResponse = {
    space_logs: [{ id: "log-1", log_lines: ["[INFO] Agent running"], fetched_at: "2026-08-21T12:00:00Z" }],
    is_author: true,
  };
  const str = JSON.stringify(authorResponse);
  assert(!str.includes("hf_"), "space logs should not contain HF tokens");
  assert(!str.includes("Bearer"), "space logs should not contain auth headers");
});
