/**
 * Tests for reviews and ratings
 * Tests: submission validation, one review per user per agent, rating calculation,
 *        display, duplicate prevention, edge cases
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated review system ──

interface Review {
  id: string;
  agent_listing_id: string;
  issue_id: string | null;
  rating: number;
  comment: string;
  created_by: string;
  created_date: string;
}

interface Listing {
  id: string;
  average_rating: number;
  run_count: number;
  is_published: boolean;
}

function submitReview(
  listing: Listing,
  existingReviews: Review[],
  rating: number,
  comment: string,
  userEmail: string
): { success: boolean; status: number; review: Review | null; error: string | null; updatedAverage: number } {
  // Validate rating
  if (!rating || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { success: false, status: 400, review: null, error: "Rating must be an integer between 1 and 5", updatedAverage: listing.average_rating };
  }

  // Validate comment (optional but max length)
  if (comment && comment.length > 1000) {
    return { success: false, status: 400, review: null, error: "Comment must be 1000 characters or less", updatedAverage: listing.average_rating };
  }

  // Check if listing exists and is published
  if (!listing.is_published) {
    return { success: false, status: 404, review: null, error: "Agent listing not found", updatedAverage: listing.average_rating };
  }

  // Duplicate prevention: one review per user per agent
  const existing = existingReviews.find(r => r.agent_listing_id === listing.id && r.created_by === userEmail);
  if (existing) {
    return { success: false, status: 409, review: null, error: "You have already reviewed this agent", updatedAverage: listing.average_rating };
  }

  // Prevent reviewing own agent (listing.created_by would match, simulated here)
  // This is a business rule — if the reviewer is the author, reject
  // (We simulate by passing the author email as listing_author param in a real impl)

  // Create review
  const review: Review = {
    id: `rev-${Date.now()}`,
    agent_listing_id: listing.id,
    issue_id: null,
    rating,
    comment: comment || "",
    created_by: userEmail,
    created_date: new Date().toISOString(),
  };

  // Recalculate average
  const allReviews = [...existingReviews, review];
  const total = allReviews.reduce((sum, r) => sum + r.rating, 0);
  const avg = allReviews.length > 0 ? Math.round((total / allReviews.length) * 10) / 10 : 0;
  listing.average_rating = avg;

  return { success: true, status: 200, review, error: null, updatedAverage: avg };
}

function displayReviews(reviews: Review[], limit = 50): any[] {
  return [...reviews]
    .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
    .slice(0, limit)
    .map(r => ({ id: r.id, rating: r.rating, comment: r.comment, created_by: r.created_by, created_date: r.created_date }));
}

// ── Test data ──

function makeListing(): Listing {
  return { id: "list-1", average_rating: 0, run_count: 10, is_published: true };
}

// ── Tests: Submission validation ──

Deno.test("reviews: valid review submission succeeds", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 5, "Excellent agent!", "bob@example.com");
  assert(result.success);
  assertEquals(result.status, 200);
  assertEquals(result.review!.rating, 5);
  assertEquals(result.review!.comment, "Excellent agent!");
});

Deno.test("reviews: rating below 1 rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 0, "test", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
  assert(result.error!.includes("between 1 and 5"));
});

Deno.test("reviews: rating above 5 rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 6, "test", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
});

Deno.test("reviews: non-integer rating rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4.5, "test", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
});

Deno.test("reviews: rating boundary values accepted (1 and 5)", () => {
  const listing = makeListing();
  const r1 = submitReview(listing, [], 1, "Bad", "a@x.com");
  assert(r1.success);
  const r2 = submitReview({ ...listing, average_rating: 0 }, [], 5, "Great", "b@x.com");
  assert(r2.success);
});

Deno.test("reviews: empty comment accepted", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4, "", "bob@example.com");
  assert(result.success);
  assertEquals(result.review!.comment, "");
});

Deno.test("reviews: null comment accepted", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4, null as any, "bob@example.com");
  assert(result.success);
});

Deno.test("reviews: comment over 1000 chars rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4, "x".repeat(1001), "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
  assert(result.error!.includes("1000 characters"));
});

Deno.test("reviews: comment at exactly 1000 chars accepted", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4, "x".repeat(1000), "bob@example.com");
  assert(result.success);
});

// ── Tests: Duplicate prevention ──

Deno.test("reviews: one review per user per agent", () => {
  const listing = makeListing();
  const existing = [{ id: "rev-1", agent_listing_id: "list-1", issue_id: null, rating: 4, comment: "Good", created_by: "bob@example.com", created_date: "2026-01-01T00:00:00Z" }];

  const result = submitReview(listing, existing, 5, "Updated", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 409);
  assert(result.error!.includes("already reviewed"));
});

Deno.test("reviews: different users can review same agent", () => {
  const listing = makeListing();
  const existing = [{ id: "rev-1", agent_listing_id: "list-1", issue_id: null, rating: 4, comment: "Good", created_by: "bob@example.com", created_date: "2026-01-01T00:00:00Z" }];

  const result = submitReview(listing, existing, 5, "Great", "alice@example.com");
  assert(result.success);
  assertEquals(result.status, 200);
});

Deno.test("reviews: same user can review different agents", () => {
  const listing1 = { ...makeListing(), id: "list-1" };
  const listing2 = { ...makeListing(), id: "list-2" };
  const existing = [{ id: "rev-1", agent_listing_id: "list-1", issue_id: null, rating: 4, comment: "Good", created_by: "bob@example.com", created_date: "2026-01-01T00:00:00Z" }];

  // Bob already reviewed list-1, but can review list-2
  const result = submitReview(listing2, existing, 5, "Great", "bob@example.com");
  assert(result.success);
});

// ── Tests: Average rating calculation ──

Deno.test("reviews: average rating calculated correctly after first review", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], 4, "Good", "bob@example.com");
  assertEquals(result.updatedAverage, 4);
  assertEquals(listing.average_rating, 4);
});

Deno.test("reviews: average rating with multiple reviews", () => {
  const listing = makeListing();
  const existing = [
    { id: "r1", agent_listing_id: "list-1", issue_id: null, rating: 5, comment: "", created_by: "a@x.com", created_date: "2026-01-01T00:00:00Z" },
    { id: "r2", agent_listing_id: "list-1", issue_id: null, rating: 3, comment: "", created_by: "b@x.com", created_date: "2026-01-02T00:00:00Z" },
  ];
  const result = submitReview(listing, existing, 4, "", "c@x.com");
  // (5 + 3 + 4) / 3 = 4.0
  assertEquals(result.updatedAverage, 4);
});

Deno.test("reviews: average rating rounds to 1 decimal", () => {
  const listing = makeListing();
  const existing = [
    { id: "r1", agent_listing_id: "list-1", issue_id: null, rating: 5, comment: "", created_by: "a@x.com", created_date: "2026-01-01T00:00:00Z" },
    { id: "r2", agent_listing_id: "list-1", issue_id: null, rating: 4, comment: "", created_by: "b@x.com", created_date: "2026-01-02T00:00:00Z" },
  ];
  const result = submitReview(listing, existing, 4, "", "c@x.com");
  // (5 + 4 + 4) / 3 = 4.333... → round(43.33) / 10 = 4.3
  assertEquals(result.updatedAverage, 4.3);
});

Deno.test("reviews: zero reviews gives average 0", () => {
  const listing = makeListing();
  assertEquals(listing.average_rating, 0);
});

// ── Tests: Display ──

Deno.test("reviews: display sorts by date descending", () => {
  const reviews = [
    { id: "r1", agent_listing_id: "list-1", issue_id: null, rating: 5, comment: "Old", created_by: "a@x.com", created_date: "2026-01-01T00:00:00Z" },
    { id: "r2", agent_listing_id: "list-1", issue_id: null, rating: 3, comment: "New", created_by: "b@x.com", created_date: "2026-06-01T00:00:00Z" },
    { id: "r3", agent_listing_id: "list-1", issue_id: null, rating: 4, comment: "Mid", created_by: "c@x.com", created_date: "2026-03-01T00:00:00Z" },
  ];
  const displayed = displayReviews(reviews);
  assertEquals(displayed[0].id, "r2"); // June
  assertEquals(displayed[1].id, "r3"); // March
  assertEquals(displayed[2].id, "r1"); // January
});

Deno.test("reviews: display limited to 50", () => {
  const reviews = Array.from({ length: 60 }, (_, i) => ({
    id: `r${i}`, agent_listing_id: "list-1", issue_id: null, rating: 5, comment: "",
    created_by: `user${i}@x.com`, created_date: `2026-01-${String(i % 28 + 1).padStart(2, "0")}T00:00:00Z`,
  }));
  const displayed = displayReviews(reviews);
  assertEquals(displayed.length, 50);
});

Deno.test("reviews: display maps only relevant fields", () => {
  const reviews = [{
    id: "r1", agent_listing_id: "list-1", issue_id: "issue-1", rating: 5, comment: "Great",
    created_by: "a@x.com", created_date: "2026-01-01T00:00:00Z",
  }];
  const displayed = displayReviews(reviews);
  assertEquals(Object.keys(displayed[0]).sort(), ["comment", "created_by", "created_date", "id", "rating"].sort());
  assert(!("issue_id" in displayed[0]), "issue_id should not be exposed in display");
});

// ── Tests: Edge cases ──

Deno.test("reviews: reviewing unpublished agent returns 404", () => {
  const listing = { ...makeListing(), is_published: false };
  const result = submitReview(listing, [], 5, "Great", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 404);
});

Deno.test("reviews: missing rating rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], undefined as any, "test", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
});

Deno.test("reviews: NaN rating rejected", () => {
  const listing = makeListing();
  const result = submitReview(listing, [], NaN, "test", "bob@example.com");
  assert(!result.success);
  assertEquals(result.status, 400);
});
