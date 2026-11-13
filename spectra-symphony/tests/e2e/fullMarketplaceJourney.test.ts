/**
 * End-to-End: Full Marketplace User Journey
 * Tests: browse → search → view detail → trigger run → leave review → author dashboard
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

interface MarketplaceState {
  listings: any[]; versions: any[]; reviews: any[]; runs: any[]; analytics: any[]; spaceLogs: any[];
}

function makeMarketplace(): MarketplaceState {
  return {
    listings: [
      { id: "l1", name: "Code Analyzer", description: "Analyzes code for vulnerabilities", category: "Security", author: "alice@example.com", is_published: true, run_count: 42, average_rating: 4.5, capabilities: ["scan", "report"], created_date: "2026-06-01T00:00:00Z" },
      { id: "l2", name: "Test Generator", description: "Generates unit tests from code", category: "QA", author: "bob@example.com", is_published: true, run_count: 18, average_rating: 4.0, capabilities: ["test", "generate"], created_date: "2026-07-01T00:00:00Z" },
    ],
    versions: [
      { id: "v1", agent_listing_id: "l1", version: 1, moderation_status: "approved", config_schema: { properties: { code: { type: "string" } }, required: ["code"] }, space_url: "https://huggingface.co/spaces/alice/code-analyzer", is_latest: true },
      { id: "v2", agent_listing_id: "l2", version: 1, moderation_status: "approved", config_schema: { properties: { file: { type: "string" } }, required: ["file"] }, space_url: "https://huggingface.co/spaces/bob/test-gen", is_latest: true },
    ],
    reviews: [
      { id: "r1", agent_listing_id: "l1", rating: 5, comment: "Great tool!", created_by: "carol@example.com", created_date: "2026-07-15T00:00:00Z" },
      { id: "r2", agent_listing_id: "l1", rating: 4, comment: "Useful", created_by: "dave@example.com", created_date: "2026-07-20T00:00:00Z" },
    ],
    runs: [], analytics: [], spaceLogs: [],
  };
}

function searchAgents(state: MarketplaceState, query: string, category: string): any[] {
  let results = state.listings.filter(l => l.is_published);
  if (category) results = results.filter(l => l.category === category);
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(l => l.name.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.capabilities.some((c: string) => c.toLowerCase().includes(q)));
  }
  return results.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
}

function getAgentDetail(state: MarketplaceState, listingId: string, userEmail: string): any {
  const listing = state.listings.find(l => l.id === listingId);
  if (!listing) return null;
  const isAuthor = listing.author.toLowerCase() === userEmail.toLowerCase();
  if (!listing.is_published && !isAuthor) return null;
  const versions = state.versions.filter(v => v.agent_listing_id === listingId);
  const visibleVersions = isAuthor ? versions : versions.filter(v => v.moderation_status === "approved" || v.moderation_status === "auto_approved");
  const reviews = state.reviews.filter(r => r.agent_listing_id === listingId);
  const spaceLogs = isAuthor ? state.spaceLogs.filter(sl => versions.some(v => v.id === sl.agent_listing_version_id)) : [];
  return { listing, versions: visibleVersions, reviews, space_logs: spaceLogs, is_author: isAuthor };
}

function triggerRun(state: MarketplaceState, versionId: string, input: any, userEmail: string): any {
  const version = state.versions.find(v => v.id === versionId);
  if (!version) return { error: "Version not found", status: 404 };
  if (version.moderation_status !== "approved" && version.moderation_status !== "auto_approved") return { error: "Not approved", status: 403 };
  const schema = version.config_schema;
  if (schema && schema.required) {
    for (const field of schema.required) {
      if (!input || input[field] === undefined) return { error: `Missing: ${field}`, status: 400 };
    }
  }
  const inFlight = state.runs.find(r => r.agent_listing_version_id === versionId && r.created_by === userEmail && (r.status === "pending" || r.status === "running"));
  if (inFlight) return { run_id: inFlight.id, status: inFlight.status, existing: true };
  const run = {
    id: `run-${state.runs.length + 1}`, agent_listing_version_id: versionId,
    status: "completed", output: { result: "analysis done" }, error: null,
    started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    created_by: userEmail,
  };
  state.runs.push(run);
  const listing = state.listings.find(l => l.id === version.agent_listing_id);
  if (listing) listing.run_count += 1;
  state.spaceLogs.push({
    id: `sl-${state.spaceLogs.length + 1}`, agent_listing_version_id: versionId,
    log_lines: ["[INFO] Agent started", "[INFO] Processing", "[INFO] Done"],
    fetched_at: new Date().toISOString(),
  });
  return { run_id: run.id, status: "completed", output: run.output };
}

function submitReview(state: MarketplaceState, listingId: string, rating: number, comment: string, userEmail: string): any {
  const listing = state.listings.find(l => l.id === listingId);
  if (!listing || !listing.is_published) return { error: "Listing not found", status: 404 };
  if (listing.author.toLowerCase() === userEmail.toLowerCase()) return { error: "Cannot review own agent", status: 403 };
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) return { error: "Invalid rating", status: 400 };
  if (state.reviews.some(r => r.agent_listing_id === listingId && r.created_by === userEmail)) return { error: "Already reviewed", status: 409 };
  const review = { id: `r${state.reviews.length + 1}`, agent_listing_id: listingId, rating, comment, created_by: userEmail, created_date: new Date().toISOString() };
  state.reviews.push(review);
  const allReviews = state.reviews.filter(r => r.agent_listing_id === listingId);
  listing.average_rating = Math.round((allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length) * 10) / 10;
  return { success: true, review_id: review.id, average_rating: listing.average_rating };
}

function getAuthorDashboard(state: MarketplaceState, userEmail: string): any {
  const myListings = state.listings.filter(l => l.author === userEmail);
  if (myListings.length === 0) return null;
  const listingIds = new Set(myListings.map(l => l.id));
  const myVersions = state.versions.filter(v => listingIds.has(v.agent_listing_id));
  const myRuns = state.runs.filter(r => myVersions.some(v => v.id === r.agent_listing_version_id));
  const myReviews = state.reviews.filter(r => listingIds.has(r.agent_listing_id));
  const myLogs = state.spaceLogs.filter(sl => myVersions.some(v => v.id === sl.agent_listing_version_id));
  return {
    listings: myListings, total_runs: myRuns.length, total_reviews: myReviews.length,
    average_rating: myListings.length > 0 ? Math.round((myListings.reduce((s, l) => s + (l.average_rating || 0), 0) / myListings.length) * 10) / 10 : 0,
    recent_runs: myRuns.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()).slice(0, 5),
    space_logs: myLogs,
  };
}

// ── Consumer Journey ──

Deno.test("e2e: consumer browses marketplace", () => {
  const state = makeMarketplace();
  const results = searchAgents(state, "", "");
  assertEquals(results.length, 2);
  assert(results[0].average_rating >= results[1].average_rating, "should sort by rating");
});

Deno.test("e2e: consumer searches by category", () => {
  const state = makeMarketplace();
  const results = searchAgents(state, "", "Security");
  assertEquals(results.length, 1);
  assertEquals(results[0].name, "Code Analyzer");
});

Deno.test("e2e: consumer searches by text", () => {
  const state = makeMarketplace();
  const results = searchAgents(state, "test", "");
  assertEquals(results.length, 1);
  assertEquals(results[0].name, "Test Generator");
});

Deno.test("e2e: consumer searches by capability", () => {
  const state = makeMarketplace();
  const results = searchAgents(state, "scan", "");
  assertEquals(results.length, 1);
  assertEquals(results[0].name, "Code Analyzer");
});

Deno.test("e2e: consumer views agent detail", () => {
  const state = makeMarketplace();
  const detail = getAgentDetail(state, "l1", "consumer@example.com");
  assert(detail !== null);
  assertEquals(detail.listing.name, "Code Analyzer");
  assertEquals(detail.versions.length, 1);
  assertEquals(detail.reviews.length, 2);
  assertEquals(detail.is_author, false);
  assertEquals(detail.space_logs.length, 0, "non-author should not see space logs");
});

Deno.test("e2e: consumer triggers run with valid input", () => {
  const state = makeMarketplace();
  const result = triggerRun(state, "v1", { code: "console.log('test')" }, "consumer@example.com");
  assertEquals(result.status, "completed");
  assert(result.run_id !== undefined);
  assertEquals(state.runs.length, 1);
  assertEquals(state.listings[0].run_count, 43, "run_count should increment");
  assertEquals(state.spaceLogs.length, 1, "space logs should sync after run");
});

Deno.test("e2e: consumer triggers run with missing required field", () => {
  const state = makeMarketplace();
  const result = triggerRun(state, "v1", {}, "consumer@example.com");
  assertEquals(result.status, 400);
  assert(result.error.includes("Missing: code"));
});

Deno.test("e2e: consumer leaves a review", () => {
  const state = makeMarketplace();
  const result = submitReview(state, "l1", 4, "Solid tool", "newuser@example.com");
  assert(result.success);
  assertEquals(result.review_id, "r3");
  assertEquals(state.listings[0].average_rating, 4.3);
});

Deno.test("e2e: consumer cannot review same agent twice", () => {
  const state = makeMarketplace();
  submitReview(state, "l1", 4, "Good", "newuser@example.com");
  const second = submitReview(state, "l1", 5, "Great", "newuser@example.com");
  assertEquals(second.status, 409);
});

Deno.test("e2e: consumer cannot review own agent", () => {
  const state = makeMarketplace();
  const result = submitReview(state, "l1", 5, "Self review", "alice@example.com");
  assertEquals(result.status, 403);
});

Deno.test("e2e: idempotency prevents duplicate run", () => {
  const state = makeMarketplace();
  triggerRun(state, "v1", { code: "x" }, "consumer@example.com");
  state.runs[0].status = "running";
  const result = triggerRun(state, "v1", { code: "x" }, "consumer@example.com");
  assert(result.existing, "should return existing in-flight run");
  assertEquals(result.run_id, state.runs[0].id);
});

// ── Author Journey ──

Deno.test("e2e: author views own dashboard", () => {
  const state = makeMarketplace();
  triggerRun(state, "v1", { code: "test" }, "consumer@example.com");
  const dashboard = getAuthorDashboard(state, "alice@example.com");
  assert(dashboard !== null);
  assertEquals(dashboard.listings.length, 1);
  assertEquals(dashboard.listings[0].name, "Code Analyzer");
  assertEquals(dashboard.total_runs, 1);
  assertEquals(dashboard.total_reviews, 2);
  assert(dashboard.average_rating > 0);
});

Deno.test("e2e: author sees space logs on their listing", () => {
  const state = makeMarketplace();
  triggerRun(state, "v1", { code: "test" }, "consumer@example.com");
  const dashboard = getAuthorDashboard(state, "alice@example.com");
  assertEquals(dashboard.space_logs.length, 1);
  assert(dashboard.space_logs[0].log_lines.length > 0);
});

Deno.test("e2e: author sees their listing with all versions", () => {
  const state = makeMarketplace();
  const detail = getAgentDetail(state, "l1", "alice@example.com");
  assertEquals(detail.is_author, true);
  assertEquals(detail.versions.length, 1);
  assertEquals(detail.space_logs.length, 0, "no logs yet before any runs");
});

Deno.test("e2e: non-author cannot access another author's dashboard", () => {
  const state = makeMarketplace();
  const dashboard = getAuthorDashboard(state, "nobody@example.com");
  assertEquals(dashboard, null);
});

// ── Full Lifecycle ──

Deno.test("e2e: full consumer lifecycle (browse → detail → run → review)", () => {
  const state = makeMarketplace();

  // Browse
  const browse = searchAgents(state, "", "");
  assertEquals(browse.length, 2);

  // Search
  const search = searchAgents(state, "vulnerabilities", "");
  assertEquals(search.length, 1);
  assertEquals(search[0].id, "l1");

  // View detail
  const detail = getAgentDetail(state, "l1", "consumer@example.com");
  assertEquals(detail.listing.name, "Code Analyzer");
  assertEquals(detail.reviews.length, 2);
  assertEquals(detail.is_author, false);

  // Trigger run
  const run = triggerRun(state, "v1", { code: "function hack() { eval('evil') }" }, "consumer@example.com");
  assertEquals(run.status, "completed");
  assert(run.output.result !== undefined);

  // Leave review
  const review = submitReview(state, "l1", 5, "Found the vulnerability!", "consumer@example.com");
  assert(review.success);
  // (5 + 4 + 5) / 3 = 4.666... → rounds to 4.7
  assertEquals(review.average_rating, 4.7);

  // Verify updates
  const updated = state.listings.find(l => l.id === "l1")!;
  assertEquals(updated.run_count, 43);
  assertEquals(updated.average_rating, 4.7);
});

Deno.test("e2e: full author lifecycle (dashboard → runs → reviews → logs)", () => {
  const state = makeMarketplace();

  triggerRun(state, "v1", { code: "test" }, "consumer1@example.com");
  triggerRun(state, "v1", { code: "test2" }, "consumer2@example.com");
  submitReview(state, "l1", 5, "Excellent", "consumer1@example.com");

  const dashboard = getAuthorDashboard(state, "alice@example.com");
  assertEquals(dashboard.listings.length, 1);
  assertEquals(dashboard.total_runs, 2);
  assertEquals(dashboard.total_reviews, 3, "2 original + 1 new");
  assertEquals(dashboard.space_logs.length, 2, "one log per run");
  assertEquals(dashboard.recent_runs.length, 2);
  assert(dashboard.average_rating > 0);
});

Deno.test("e2e: multiple consumers interact simultaneously", () => {
  const state = makeMarketplace();

  const results = [];
  for (let i = 0; i < 5; i++) {
    const run = triggerRun(state, "v1", { code: `code-${i}` }, `user${i}@example.com`);
    results.push(run);
  }
  assert(results.every(r => r.status === "completed"), "all 5 runs should complete");
  assertEquals(state.runs.length, 5);
  assertEquals(state.listings[0].run_count, 47, "run_count should reflect all 5 runs");

  for (let i = 0; i < 3; i++) {
    submitReview(state, "l1", i < 2 ? 5 : 3, `Review ${i}`, `reviewer${i}@example.com`);
  }

  const dashboard = getAuthorDashboard(state, "alice@example.com");
  assertEquals(dashboard.total_runs, 5);
  assertEquals(dashboard.total_reviews, 5, "2 original + 3 new");
});
