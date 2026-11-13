/**
 * End-to-end tests for the agent run lifecycle
 * Tests: trigger deploy → HF Space provisioning → log sync → run completion → analytics update
 *        Failure paths (Space crash, timeout, invalid config), idempotency
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated agent run state machine ──

type RunStatus = "pending" | "running" | "completed" | "failed";

interface AgentRun {
  id: string;
  agent_listing_version_id: string;
  status: RunStatus;
  output: any;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
}

interface AgentListing {
  id: string;
  is_published: boolean;
  run_count: number;
  average_rating: number;
}

interface AgentListingVersion {
  id: string;
  agent_listing_id: string;
  version: number;
  moderation_status: string;
  config_schema: any;
  space_url: string;
  is_latest: boolean;
}

interface SpaceLog {
  id: string;
  space_id: string;
  agent_listing_version_id: string;
  log_lines: string[];
  fetched_at: string;
}

// ── Simulated deployAgentRun flow ──

function validateInput(input: any, schema: any): string[] {
  const errors: string[] = [];
  if (!schema || Object.keys(schema).length === 0) return errors;
  const required: string[] = schema.required || [];
  for (const field of required) {
    if (!input || input[field] === undefined || input[field] === null || input[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }
  return errors;
}

function extractSpaceApiBase(spaceUrl: string): string | null {
  const match = /^https:\/\/huggingface\.co\/spaces\/([a-zA-Z0-9_.\-]+)\/([a-zA-Z0-9_.\-]+)$/.exec(spaceUrl || "");
  if (!match) return null;
  const normalized = `${match[1]}-${match[2]}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `https://${normalized}.hf.space`;
}

interface SimResult {
  run: AgentRun;
  listing: AgentListing;
  spaceLogs: SpaceLog[];
  httpStatus: number;
  response: any;
}

function simulateRun(
  version: AgentListingVersion,
  listing: AgentListing,
  input: any,
  userEmail: string,
  existingRuns: AgentRun[],
  spaceHealthOk: boolean,
  spaceInvokeOk: boolean,
  spaceInvokeOutput: any,
  spaceTimeout: boolean,
  spaceLogLines: string[]
): SimResult {
  // Auth check
  if (!userEmail) {
    return { run: null as any, listing, spaceLogs: [], httpStatus: 401, response: { error: "Unauthorized" } };
  }

  // Version approval check
  if (version.moderation_status !== "approved" && version.moderation_status !== "auto_approved") {
    return { run: null as any, listing, spaceLogs: [], httpStatus: 403, response: { error: "Not approved to run" } };
  }

  // Idempotency check
  const inFlight = existingRuns.find(r => r.agent_listing_version_id === version.id && (r.status === "pending" || r.status === "running"));
  if (inFlight) {
    return { run: inFlight, listing, spaceLogs: [], httpStatus: 200, response: { run_id: inFlight.id, status: inFlight.status, existing: true } };
  }

  // Input validation
  const schemaErrors = validateInput(input, version.config_schema);
  if (schemaErrors.length > 0) {
    return { run: null as any, listing, spaceLogs: [], httpStatus: 400, response: { error: "Input validation failed", details: schemaErrors } };
  }

  // Create pending run
  const run: AgentRun = {
    id: `run-${Date.now()}`,
    agent_listing_version_id: version.id,
    status: "pending",
    output: null,
    error: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_by: userEmail,
  };

  // Resolve Space URL
  const apiBase = extractSpaceApiBase(version.space_url);
  if (!apiBase) {
    run.status = "failed";
    run.error = "Could not resolve Space API URL";
    run.completed_at = new Date().toISOString();
    return { run, listing, spaceLogs: [], httpStatus: 502, response: { run_id: run.id, status: "failed", error: run.error } };
  }

  // Mark running
  run.status = "running";

  // Health check
  if (!spaceHealthOk) {
    run.status = "failed";
    run.error = "Capability handshake failed";
    run.completed_at = new Date().toISOString();
    return { run, listing, spaceLogs: [], httpStatus: 502, response: { run_id: run.id, status: "failed", error: run.error } };
  }

  // Timeout
  if (spaceTimeout) {
    run.status = "failed";
    run.error = "timeout";
    run.completed_at = new Date().toISOString();
    return { run, listing, spaceLogs: [], httpStatus: 502, response: { run_id: run.id, status: "failed", error: "timeout" } };
  }

  // Invoke
  if (!spaceInvokeOk) {
    run.status = "failed";
    run.error = "Agent invocation failed";
    run.completed_at = new Date().toISOString();
    return { run, listing, spaceLogs: [], httpStatus: 502, response: { run_id: run.id, status: "failed", error: run.error } };
  }

  // Success
  run.status = "completed";
  run.output = spaceInvokeOutput;
  run.completed_at = new Date().toISOString();
  listing.run_count += 1;

  // Sync space logs
  const spaceLog: SpaceLog = {
    id: `log-${Date.now()}`,
    space_id: version.space_url.split("/").slice(-1)[0],
    agent_listing_version_id: version.id,
    log_lines: spaceLogLines,
    fetched_at: new Date().toISOString(),
  };

  return {
    run, listing, spaceLogs: [spaceLog], httpStatus: 200,
    response: { run_id: run.id, status: "completed", output: spaceInvokeOutput },
  };
}

// ── Helpers ──

function makeVersion(id: string, schema: any = {}, spaceUrl = "https://huggingface.co/spaces/user/my-agent"): AgentListingVersion {
  return {
    id, agent_listing_id: "list-1", version: 1, moderation_status: "approved",
    config_schema: schema, space_url: spaceUrl, is_latest: true,
  };
}

function makeListing(): AgentListing {
  return { id: "list-1", is_published: true, run_count: 5, average_rating: 4.0 };
}

// ── Tests: Happy path ──

Deno.test("e2e run lifecycle: successful run completes with output", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, { task: "test" }, "user@example.com", [], true, true, { result: "done" }, false, ["[INFO] Agent completed"]);

  assertEquals(result.httpStatus, 200);
  assertEquals(result.run.status, "completed");
  assertEquals(result.run.output, { result: "done" });
  assertEquals(result.run.error, null);
  assert(result.run.completed_at !== null);
  assertEquals(result.response.status, "completed");
});

Deno.test("e2e run lifecycle: run_count increments on success", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const initialCount = listing.run_count;

  simulateRun(version, listing, {}, "user@example.com", [], true, true, { ok: true }, false, []);

  assertEquals(listing.run_count, initialCount + 1);
});

Deno.test("e2e run lifecycle: space logs sync after successful run", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const logLines = ["[INFO] Starting", "[INFO] Processing", "[INFO] Done"];
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, false, logLines);

  assertEquals(result.spaceLogs.length, 1);
  assertEquals(result.spaceLogs[0].log_lines, logLines);
  assertEquals(result.spaceLogs[0].agent_listing_version_id, "ver-1");
});

Deno.test("e2e run lifecycle: run transitions pending → running → completed", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, false, []);

  assertEquals(result.run.status, "completed");
  assert(result.run.started_at !== null, "started_at should be set");
  assert(result.run.completed_at !== null, "completed_at should be set");
});

// ── Tests: Failure paths ──

Deno.test("e2e run lifecycle: Space health check failure → run failed", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], false, true, {}, false, []);

  assertEquals(result.httpStatus, 502);
  assertEquals(result.run.status, "failed");
  assertEquals(result.run.error, "Capability handshake failed");
  assertEquals(result.spaceLogs, []); // no logs on health failure
});

Deno.test("e2e run lifecycle: Space invocation failure → run failed", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, false, {}, false, []);

  assertEquals(result.httpStatus, 502);
  assertEquals(result.run.status, "failed");
  assertEquals(result.run.error, "Agent invocation failed");
});

Deno.test("e2e run lifecycle: Space timeout → run failed with timeout", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, true, []);

  assertEquals(result.httpStatus, 502);
  assertEquals(result.run.status, "failed");
  assertEquals(result.run.error, "timeout");
});

Deno.test("e2e run lifecycle: invalid Space URL → run failed", () => {
  const version = makeVersion("ver-1", {}, "https://evil.com/spaces/user/agent");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, false, []);

  assertEquals(result.httpStatus, 502);
  assertEquals(result.run.status, "failed");
  assert(result.run.error!.includes("Could not resolve Space API URL"));
});

Deno.test("e2e run lifecycle: run_count does NOT increment on failure", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const initialCount = listing.run_count;

  simulateRun(version, listing, {}, "user@example.com", [], false, true, {}, false, []);

  assertEquals(listing.run_count, initialCount, "run_count should not change on failure");
});

Deno.test("e2e run lifecycle: no space logs on failure", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], false, true, {}, false, []);

  assertEquals(result.spaceLogs, []);
});

// ── Tests: Auth and approval ──

Deno.test("e2e run lifecycle: unapproved version returns 403", () => {
  const version = makeVersion("ver-1");
  version.moderation_status = "pending";
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, false, []);

  assertEquals(result.httpStatus, 403);
  assert(result.response.error.includes("Not approved"));
});

Deno.test("e2e run lifecycle: auto_approved version can run", () => {
  const version = makeVersion("ver-1");
  version.moderation_status = "auto_approved";
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
  assertEquals(result.run.status, "completed");
});

Deno.test("e2e run lifecycle: missing auth returns 401", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "", [], true, true, {}, false, []);

  assertEquals(result.httpStatus, 401);
});

// ── Tests: Input validation ──

Deno.test("e2e run lifecycle: invalid input returns 400 with details", () => {
  const schema = { properties: { task: { type: "string" } }, required: ["task"] };
  const version = makeVersion("ver-1", schema);
  const listing = makeListing();
  const result = simulateRun(version, listing, {}, "user@example.com", [], true, true, {}, false, []);

  assertEquals(result.httpStatus, 400);
  assert(result.response.error.includes("Input validation failed"));
  assert(result.response.details.some((d: string) => d.includes("Missing required field: task")));
});

Deno.test("e2e run lifecycle: valid input passes validation", () => {
  const schema = { properties: { task: { type: "string" } }, required: ["task"] };
  const version = makeVersion("ver-1", schema);
  const listing = makeListing();
  const result = simulateRun(version, listing, { task: "analyze code" }, "user@example.com", [], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
  assertEquals(result.run.status, "completed");
});

Deno.test("e2e run lifecycle: no schema means no validation errors", () => {
  const version = makeVersion("ver-1", {});
  const listing = makeListing();
  const result = simulateRun(version, listing, { anything: "goes" }, "user@example.com", [], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
});

// ── Tests: Idempotency ──

Deno.test("e2e run lifecycle: in-flight run returns existing instead of creating new", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const existingRun: AgentRun = {
    id: "existing-run-1", agent_listing_version_id: "ver-1", status: "running",
    output: null, error: null, started_at: new Date().toISOString(), completed_at: null, created_by: "user@example.com",
  };

  const result = simulateRun(version, listing, {}, "user@example.com", [existingRun], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
  assertEquals(result.response.existing, true);
  assertEquals(result.response.run_id, "existing-run-1");
  assertEquals(result.run.id, "existing-run-1");
  // Should NOT create a new run
  assertEquals(listing.run_count, 5); // unchanged
});

Deno.test("e2e run lifecycle: completed runs don't trigger idempotency", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const completedRun: AgentRun = {
    id: "old-run-1", agent_listing_version_id: "ver-1", status: "completed",
    output: {}, error: null, started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:01:00Z", created_by: "user@example.com",
  };

  const result = simulateRun(version, listing, {}, "user@example.com", [completedRun], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
  assert(!result.response.existing, "should create new run when previous is completed");
  assertEquals(result.run.status, "completed");
});

Deno.test("e2e run lifecycle: failed runs don't trigger idempotency", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const failedRun: AgentRun = {
    id: "old-run-1", agent_listing_version_id: "ver-1", status: "failed",
    output: null, error: "timeout", started_at: "2026-01-01T00:00:00Z", completed_at: "2026-01-01T00:00:30Z", created_by: "user@example.com",
  };

  const result = simulateRun(version, listing, {}, "user@example.com", [failedRun], true, true, { ok: true }, false, []);

  assertEquals(result.httpStatus, 200);
  assert(!result.response.existing, "should create new run when previous failed");
  assertEquals(result.run.status, "completed");
});

// ── Tests: Full lifecycle sequence ──

Deno.test("e2e run lifecycle: full sequence (trigger → health → invoke → logs → analytics)", () => {
  const version = makeVersion("ver-1", { properties: { code: { type: "string" } }, required: ["code"] });
  const listing = makeListing();
  const initialRunCount = listing.run_count;

  // Step 1: Trigger with valid input
  const result = simulateRun(
    version, listing, { code: "console.log('hello')" }, "dev@example.com", [],
    true, true, { analysis: "No vulnerabilities found" }, false,
    ["[INFO] Agent started", "[INFO] Analyzing code", "[INFO] Analysis complete"]
  );

  // Step 2: Run completed
  assertEquals(result.run.status, "completed");
  assertEquals(result.run.output.analysis, "No vulnerabilities found");

  // Step 3: Space logs synced
  assertEquals(result.spaceLogs.length, 1);
  assertEquals(result.spaceLogs[0].log_lines.length, 3);

  // Step 4: Analytics (run_count) updated
  assertEquals(listing.run_count, initialRunCount + 1);

  // Step 5: Response contains run_id for client polling
  assert(result.response.run_id !== undefined);
  assertEquals(result.response.status, "completed");
});

Deno.test("e2e run lifecycle: multiple sequential runs each increment run_count", () => {
  const version = makeVersion("ver-1");
  const listing = makeListing();
  const runs: AgentRun[] = [];

  for (let i = 0; i < 3; i++) {
    const result = simulateRun(version, listing, {}, "user@example.com", runs, true, true, { run: i }, false, []);
    runs.push(result.run);
  }

  assertEquals(listing.run_count, 5 + 3);
  assertEquals(runs.length, 3);
  assert(runs.every(r => r.status === "completed"));
});
