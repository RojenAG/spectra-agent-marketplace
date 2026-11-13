/**
 * Unit tests for getAgentDetail backend function
 * Tests: listing lookup, version visibility, reviews, space logs, author detection
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const REVIEW_LIMIT = 50;
const SPACE_LOG_LIMIT = 5;

// ── Simulated getAgentDetail logic ──

function simulateGetAgentDetail(listing: any, versions: any[], allReviews: any[], allLogs: any[], user: any) {
  if (!listing) {
    return { status: 404, body: { error: "Agent listing not found" } };
  }

  const isAuthor = !!user && !!listing.author && listing.author.toLowerCase() === user.email.toLowerCase();

  if (!listing.is_published && !isAuthor) {
    return { status: 404, body: { error: "Agent listing not found" } };
  }

  const sortedVersions = [...versions].sort((a, b) => (b.version || 0) - (a.version || 0));
  const visibleVersions = isAuthor
    ? sortedVersions
    : sortedVersions.filter(v => v.moderation_status === "approved" || v.moderation_status === "auto_approved");

  const sortedReviews = [...allReviews].sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
  const reviews = sortedReviews.slice(0, REVIEW_LIMIT).map(r => ({
    id: r.id, rating: r.rating, comment: r.comment, created_by: r.created_by, created_date: r.created_date,
  }));

  const totalRating = allReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  const averageRating = allReviews.length > 0 ? Math.round((totalRating / allReviews.length) * 10) / 10 : 0;

  let spaceLogs: any[] = [];
  if (isAuthor) {
    const versionIds = new Set(versions.map(v => v.id));
    spaceLogs = allLogs
      .filter(l => versionIds.has(l.agent_listing_version_id))
      .sort((a, b) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())
      .slice(0, SPACE_LOG_LIMIT);
  }

  return {
    status: 200,
    body: { listing: { ...listing, average_rating: averageRating }, versions: visibleVersions, reviews, review_count: allReviews.length, space_logs: spaceLogs, is_author: isAuthor },
  };
}

// ── Test data ──

const mockListing = { id: "list-1", name: "Test Agent", description: "A test agent", category: "Backend", author: "alice@example.com", is_published: true, run_count: 10 };

const mockVersions = [
  { id: "ver-1", agent_listing_id: "list-1", version: 1, moderation_status: "approved", capabilities: ["api"] },
  { id: "ver-2", agent_listing_id: "list-1", version: 2, moderation_status: "pending", capabilities: ["api", "db"] },
  { id: "ver-3", agent_listing_id: "list-1", version: 3, moderation_status: "rejected", capabilities: ["api", "db", "auth"] },
];

const mockReviews = [
  { id: "rev-1", rating: 5, comment: "Great!", created_by: "bob@example.com", created_date: "2026-03-01T10:00:00Z" },
  { id: "rev-2", rating: 3, comment: "OK", created_by: "carol@example.com", created_date: "2026-02-01T10:00:00Z" },
  { id: "rev-3", rating: 4, comment: "Good", created_by: "dave@example.com", created_date: "2026-04-01T10:00:00Z" },
];

const mockLogs = [
  { id: "log-1", agent_listing_version_id: "ver-1", space_id: "space-1", log_lines: ["line1"], fetched_at: "2026-03-01T12:00:00Z" },
  { id: "log-2", agent_listing_version_id: "ver-2", space_id: "space-2", log_lines: ["line2"], fetched_at: "2026-04-01T12:00:00Z" },
];

// ── Tests ──

Deno.test("getAgentDetail: returns 404 for missing listing", () => {
  const result = simulateGetAgentDetail(null, [], [], [], null);
  assertEquals(result.status, 404);
});

Deno.test("getAgentDetail: published listing visible to anonymous user", () => {
  const result = simulateGetAgentDetail(mockListing, mockVersions, mockReviews, mockLogs, null);
  assertEquals(result.status, 200);
  assertEquals(result.body.is_author, false);
});

Deno.test("getAgentDetail: unpublished listing returns 404 for non-author", () => {
  const unpublished = { ...mockListing, is_published: false };
  const result = simulateGetAgentDetail(unpublished, [], [], [], { email: "stranger@example.com" });
  assertEquals(result.status, 404);
});

Deno.test("getAgentDetail: unpublished listing visible to author", () => {
  const unpublished = { ...mockListing, is_published: false };
  const result = simulateGetAgentDetail(unpublished, [], [], [], { email: "alice@example.com" });
  assertEquals(result.status, 200);
  assertEquals(result.body.is_author, true);
});

Deno.test("getAgentDetail: author detection is case-insensitive", () => {
  const result = simulateGetAgentDetail(mockListing, [], [], [], { email: "Alice@Example.COM" });
  assertEquals(result.body.is_author, true);
});

Deno.test("getAgentDetail: non-author sees only approved versions", () => {
  const result = simulateGetAgentDetail(mockListing, mockVersions, [], [], null);
  assertEquals(result.body.versions.length, 1);
  assertEquals(result.body.versions[0].id, "ver-1");
});

Deno.test("getAgentDetail: author sees all versions", () => {
  const result = simulateGetAgentDetail(mockListing, mockVersions, [], [], { email: "alice@example.com" });
  assertEquals(result.body.versions.length, 3);
  // Sorted newest first
  assertEquals(result.body.versions[0].version, 3);
  assertEquals(result.body.versions[2].version, 1);
});

Deno.test("getAgentDetail: reviews sorted by date descending", () => {
  const result = simulateGetAgentDetail(mockListing, [], mockReviews, [], null);
  assertEquals(result.body.reviews[0].id, "rev-3"); // April
  assertEquals(result.body.reviews[1].id, "rev-1"); // March
  assertEquals(result.body.reviews[2].id, "rev-2"); // February
});

Deno.test("getAgentDetail: average rating calculated correctly", () => {
  const result = simulateGetAgentDetail(mockListing, [], mockReviews, [], null);
  // (5 + 3 + 4) / 3 = 4.0
  assertEquals(result.body.listing.average_rating, 4);
});

Deno.test("getAgentDetail: average rating rounds to 1 decimal", () => {
  const reviews = [
    { id: "r1", rating: 5, comment: "", created_by: "x", created_date: "2026-01-01T00:00:00Z" },
    { id: "r2", rating: 4, comment: "", created_by: "y", created_date: "2026-01-02T00:00:00Z" },
    { id: "r3", rating: 4, comment: "", created_by: "z", created_date: "2026-01-03T00:00:00Z" },
  ];
  const result = simulateGetAgentDetail(mockListing, [], reviews, [], null);
  // (5 + 4 + 4) / 3 = 4.33 → round(4.33 * 10) / 10 = 4.3
  assertEquals(result.body.listing.average_rating, 4.3);
});

Deno.test("getAgentDetail: zero reviews gives average_rating 0", () => {
  const result = simulateGetAgentDetail(mockListing, [], [], [], null);
  assertEquals(result.body.listing.average_rating, 0);
  assertEquals(result.body.review_count, 0);
});

Deno.test("getAgentDetail: space logs only visible to author", () => {
  const result = simulateGetAgentDetail(mockListing, mockVersions, [], mockLogs, null);
  assertEquals(result.body.space_logs, []);

  const authorResult = simulateGetAgentDetail(mockListing, mockVersions, [], mockLogs, { email: "alice@example.com" });
  assertEquals(authorResult.body.space_logs.length, 2);
});

Deno.test("getAgentDetail: space logs sorted by fetched_at descending", () => {
  const result = simulateGetAgentDetail(mockListing, mockVersions, [], mockLogs, { email: "alice@example.com" });
  assertEquals(result.body.space_logs[0].id, "log-2"); // April
  assertEquals(result.body.space_logs[1].id, "log-1"); // March
});

Deno.test("getAgentDetail: space logs limited to SPACE_LOG_LIMIT", () => {
  const manyLogs = Array.from({ length: 10 }, (_, i) => ({
    id: `log-${i}`, agent_listing_version_id: "ver-1", space_id: "space-1", log_lines: [], fetched_at: `2026-0${i + 1}-01T12:00:00Z`,
  }));
  const result = simulateGetAgentDetail(mockListing, mockVersions, [], manyLogs, { email: "alice@example.com" });
  assertEquals(result.body.space_logs.length, SPACE_LOG_LIMIT);
});

Deno.test("getAgentDetail: auto_approved versions visible to non-author", () => {
  const versions = [
    { id: "v1", version: 1, moderation_status: "auto_approved", capabilities: ["x"] },
    { id: "v2", version: 2, moderation_status: "pending", capabilities: ["x"] },
  ];
  const result = simulateGetAgentDetail(mockListing, versions, [], [], null);
  assertEquals(result.body.versions.length, 1);
  assertEquals(result.body.versions[0].moderation_status, "auto_approved");
});

Deno.test("getAgentDetail: review with invalid rating treated as 0", () => {
  const reviews = [
    { id: "r1", rating: "invalid", comment: "", created_by: "x", created_date: "2026-01-01T00:00:00Z" },
  ];
  const result = simulateGetAgentDetail(mockListing, [], reviews, [], null);
  // Number("invalid") = NaN, NaN || 0 in reduce = 0
  assertEquals(result.body.listing.average_rating, 0);
});
