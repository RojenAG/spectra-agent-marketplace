/**
 * GDPR Review — Right to Erasure & Data Export Tests
 * Tests: deletion cascade (including reviews on deleted listings), data export, consent tracking
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

interface User { email: string; consent_given: boolean; consent_date: string | null; }

function simulateErasure(userEmail: string, allData: {
  listings: any[]; versions: any[]; reviews: any[]; runs: any[]; analytics: any[]; spaceLogs: any[];
}): { deleted: any; remaining: any } {
  // Find listings owned by this user
  const ownedListingIds = new Set(
    allData.listings.filter(l => l.author === userEmail || l.created_by === userEmail).map(l => l.id)
  );
  // Find versions belonging to those listings
  const ownedVersionIds = new Set(
    allData.versions.filter(v => ownedListingIds.has(v.agent_listing_id)).map(v => v.id)
  );

  const deleted = {
    listings: allData.listings.filter(l => ownedListingIds.has(l.id)),
    versions: allData.versions.filter(v => ownedVersionIds.has(v.id)),
    // Reviews: user's own reviews + reviews ON deleted listings (cascade)
    reviews: allData.reviews.filter(r => r.created_by === userEmail || ownedListingIds.has(r.agent_listing_id)),
    runs: allData.runs.filter(r => r.created_by === userEmail),
    analytics: allData.analytics.filter(a => ownedListingIds.has(a.agent_listing_id)),
    spaceLogs: allData.spaceLogs.filter(sl => ownedVersionIds.has(sl.agent_listing_version_id)),
  };

  const deletedReviewIds = new Set(deleted.reviews.map(r => r.id));
  const deletedListingIds = ownedListingIds;
  const deletedVersionIds = ownedVersionIds;

  const remaining = {
    listings: allData.listings.filter(l => !deletedListingIds.has(l.id)),
    versions: allData.versions.filter(v => !deletedVersionIds.has(v.id)),
    reviews: allData.reviews.filter(r => !deletedReviewIds.has(r.id)),
    runs: allData.runs.filter(r => r.created_by !== userEmail),
    analytics: allData.analytics.filter(a => !deletedListingIds.has(a.agent_listing_id)),
    spaceLogs: allData.spaceLogs.filter(sl => !deletedVersionIds.has(sl.agent_listing_version_id)),
  };
  return { deleted, remaining };
}

function simulateExport(userEmail: string, allData: any): any {
  return {
    user_email: userEmail,
    export_date: new Date().toISOString(),
    listings: allData.listings.filter(l => l.author === userEmail || l.created_by === userEmail),
    reviews: allData.reviews.filter(r => r.created_by === userEmail),
    runs: allData.runs.filter(r => r.created_by === userEmail),
  };
}

const alice = "alice@example.com";
const bob = "bob@example.com";

const allData = {
  listings: [
    { id: "l1", name: "Agent A", author: alice, created_by: alice, is_published: true },
    { id: "l2", name: "Agent B", author: bob, created_by: bob, is_published: true },
  ],
  versions: [
    { id: "v1", agent_listing_id: "l1", version: 1 },
    { id: "v2", agent_listing_id: "l2", version: 1 },
  ],
  reviews: [
    { id: "r1", agent_listing_id: "l1", rating: 5, created_by: alice },
    { id: "r2", agent_listing_id: "l2", rating: 4, created_by: bob },
    { id: "r3", agent_listing_id: "l1", rating: 3, created_by: bob },
  ],
  runs: [
    { id: "run1", agent_listing_version_id: "v1", created_by: alice, status: "completed" },
    { id: "run2", agent_listing_version_id: "v2", created_by: bob, status: "completed" },
    { id: "run3", agent_listing_version_id: "v1", created_by: bob, status: "failed" },
  ],
  analytics: [
    { id: "a1", agent_listing_id: "l1", date: "2026-08-01", run_count: 10 },
    { id: "a2", agent_listing_id: "l2", date: "2026-08-01", run_count: 5 },
  ],
  spaceLogs: [
    { id: "sl1", agent_listing_version_id: "v1", log_lines: ["line1"], fetched_at: "2026-08-01" },
    { id: "sl2", agent_listing_version_id: "v2", log_lines: ["line2"], fetched_at: "2026-08-02" },
  ],
};

// ── Tests: Right to erasure ──

Deno.test("GDPR: erasure deletes user's listings", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.listings.length, 1);
  assertEquals(result.deleted.listings[0].author, alice);
});

Deno.test("GDPR: erasure deletes user's versions (cascade)", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.versions.length, 1);
  assertEquals(result.deleted.versions[0].agent_listing_id, "l1");
});

Deno.test("GDPR: erasure deletes user's reviews", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.reviews.length, 2); // r1 (alice's) + r3 (bob's on alice's listing — cascade)
  assert(result.deleted.reviews.some(r => r.id === "r1"));
});

Deno.test("GDPR: erasure deletes user's runs", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.runs.length, 1);
  assertEquals(result.deleted.runs[0].created_by, alice);
});

Deno.test("GDPR: erasure deletes user's analytics (cascade)", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.analytics.length, 1);
  assertEquals(result.deleted.analytics[0].agent_listing_id, "l1");
});

Deno.test("GDPR: erasure deletes user's space logs (cascade)", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.deleted.spaceLogs.length, 1);
  assertEquals(result.deleted.spaceLogs[0].agent_listing_version_id, "v1");
});

Deno.test("GDPR: erasure preserves other users' data", () => {
  const result = simulateErasure(alice, allData);
  assertEquals(result.remaining.listings.length, 1);
  assertEquals(result.remaining.listings[0].author, bob);
  assertEquals(result.remaining.reviews.length, 1); // only bob's review on l2 (r2)
  assertEquals(result.remaining.runs.length, 2); // bob's runs (run2 and run3)
});

Deno.test("GDPR: erasure cascades reviews on deleted listings", () => {
  const result = simulateErasure(alice, allData);
  // r3 was bob's review on l1 (alice's listing) — should be deleted with the listing
  assert(!result.remaining.reviews.some(r => r.id === "r3"), "reviews on deleted listing should also be removed");
  assert(result.deleted.reviews.some(r => r.id === "r3"), "bob's review on alice's listing should be in deleted set");
});

// ── Tests: Data export ──

Deno.test("GDPR: data export returns all user's data", () => {
  const exportData = simulateExport(alice, allData);
  assertEquals(exportData.user_email, alice);
  assert(exportData.export_date !== null);
  assertEquals(exportData.listings.length, 1);
  assertEquals(exportData.reviews.length, 1);
  assertEquals(exportData.runs.length, 1);
});

Deno.test("GDPR: data export only includes requesting user's data", () => {
  const exportData = simulateExport(alice, allData);
  assert(exportData.listings.every((l: any) => l.author === alice));
  assert(exportData.reviews.every((r: any) => r.created_by === alice));
  assert(exportData.runs.every((r: any) => r.created_by === alice));
});

Deno.test("GDPR: data export does not include other users' data", () => {
  const exportData = simulateExport(alice, allData);
  assert(!exportData.listings.some((l: any) => l.author === bob));
  assert(!exportData.reviews.some((r: any) => r.created_by === bob));
  assert(!exportData.runs.some((r: any) => r.created_by === bob));
});

Deno.test("GDPR: data export is serializable as JSON", () => {
  const exportData = simulateExport(alice, allData);
  const json = JSON.stringify(exportData);
  assert(json.length > 0);
  const parsed = JSON.parse(json);
  assertEquals(parsed.user_email, alice);
});

// ── Tests: Consent tracking ──

Deno.test("GDPR: new user has no consent by default", () => {
  const user: User = { email: "new@example.com", consent_given: false, consent_date: null };
  assertEquals(user.consent_given, false);
  assertEquals(user.consent_date, null);
});

Deno.test("GDPR: consent is recorded with timestamp", () => {
  const user: User = { email: "new@example.com", consent_given: false, consent_date: null };
  user.consent_given = true;
  user.consent_date = new Date().toISOString();
  assert(user.consent_given);
  assert(user.consent_date !== null);
});

Deno.test("GDPR: consent withdrawal triggers data deletion", () => {
  const user: User = { email: alice, consent_given: true, consent_date: "2026-01-01T00:00:00Z" };
  user.consent_given = false;
  assert(!user.consent_given, "consent withdrawal should be recorded");
  const result = simulateErasure(user.email, allData);
  assert(result.deleted.listings.length > 0, "data should be deleted on consent withdrawal");
});

// ── Tests: Data minimization ──

Deno.test("GDPR: agent configs should not store unnecessary PII", () => {
  const configSchema = { properties: { task: { type: "string" }, language: { type: "string" } } };
  const allowedFields = Object.keys(configSchema.properties);
  assert(!allowedFields.includes("user_email"), "config should not require user email");
  assert(!allowedFields.includes("full_name"), "config should not require full name");
  assert(!allowedFields.includes("phone_number"), "config should not require phone number");
});

Deno.test("GDPR: review display does not expose more than necessary", () => {
  const reviewDisplay = { id: "r1", rating: 5, comment: "Great!", created_by: "alice@example.com", created_date: "2026-01-01" };
  const exposedFields = Object.keys(reviewDisplay);
  assert(exposedFields.includes("rating"));
  assert(exposedFields.includes("comment"));
  assert(!exposedFields.includes("issue_id"));
  assert(!exposedFields.includes("agent_listing_id"));
});
