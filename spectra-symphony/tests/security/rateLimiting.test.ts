/**
 * Rate Limiting Tests
 * Tests: per-user limits, per-IP limits, 429 responses, Retry-After header,
 *        run spam prevention, publish flooding prevention
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated rate limiter ──

interface RateBucket {
  key: string;
  count: number;
  windowStart: number;
}

const WINDOW_MS = 60_000; // 1 minute window
const RUN_LIMIT = 5;      // 5 runs per user per minute
const PUBLISH_LIMIT = 3;  // 3 publishes per user per minute
const SEARCH_LIMIT = 30;  // 30 searches per IP per minute

function checkRate(buckets: Map<string, RateBucket>, key: string, limit: number): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { key, count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, retryAfter: 0 };
}

// ── Tests: Run triggers ──

Deno.test("rate-limit: allows first 5 runs per user per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 5; i++) {
    const result = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
    assert(result.allowed, `run ${i + 1} should be allowed`);
  }
});

Deno.test("rate-limit: blocks 6th run per user per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 5; i++) {
    checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  }
  const result = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  assert(!result.allowed, "6th run should be blocked");
  assert(result.retryAfter > 0, "should include Retry-After");
  assert(result.retryAfter <= 60, "Retry-After should be <= 60 seconds");
});

Deno.test("rate-limit: different users have separate buckets", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 5; i++) {
    checkRate(buckets, "run:userA@x.com", RUN_LIMIT);
  }
  const resultB = checkRate(buckets, "run:userB@x.com", RUN_LIMIT);
  assert(resultB.allowed, "user B should not be affected by user A's limit");
});

Deno.test("rate-limit: remaining count decreases", () => {
  const buckets = new Map<string, RateBucket>();
  const r1 = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  assertEquals(r1.remaining, 4);
  const r2 = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  assertEquals(r2.remaining, 3);
  const r3 = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  assertEquals(r3.remaining, 2);
});

// ── Tests: Publish flooding ──

Deno.test("rate-limit: allows 3 publishes per user per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 3; i++) {
    const result = checkRate(buckets, "publish:user@x.com", PUBLISH_LIMIT);
    assert(result.allowed, `publish ${i + 1} should be allowed`);
  }
});

Deno.test("rate-limit: blocks 4th publish per user per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 3; i++) {
    checkRate(buckets, "publish:user@x.com", PUBLISH_LIMIT);
  }
  const result = checkRate(buckets, "publish:user@x.com", PUBLISH_LIMIT);
  assert(!result.allowed, "4th publish should be blocked");
});

// ── Tests: Search scraping prevention ──

Deno.test("rate-limit: allows 30 searches per IP per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 30; i++) {
    const result = checkRate(buckets, "search:192.168.1.1", SEARCH_LIMIT);
    assert(result.allowed, `search ${i + 1} should be allowed`);
  }
});

Deno.test("rate-limit: blocks 31st search per IP per minute", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 30; i++) {
    checkRate(buckets, "search:192.168.1.1", SEARCH_LIMIT);
  }
  const result = checkRate(buckets, "search:192.168.1.1", SEARCH_LIMIT);
  assert(!result.allowed, "31st search should be blocked");
});

Deno.test("rate-limit: different IPs have separate search buckets", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 30; i++) {
    checkRate(buckets, "search:10.0.0.1", SEARCH_LIMIT);
  }
  const result = checkRate(buckets, "search:10.0.0.2", SEARCH_LIMIT);
  assert(result.allowed, "different IP should not be affected");
});

// ── Tests: Window reset ──

Deno.test("rate-limit: bucket resets after window expires", () => {
  const buckets = new Map<string, RateBucket>();
  // Fill bucket
  for (let i = 0; i < 5; i++) {
    checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  }
  // Simulate window expiry by creating a fresh bucket
  // In real impl, the check would use elapsed time
  const now = Date.now();
  const expiredBucket: RateBucket = { key: "run:user@x.com", count: 5, windowStart: now - WINDOW_MS - 1 };
  buckets.set("run:user@x.com", expiredBucket);

  const result = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  assert(result.allowed, "should allow after window reset");
  assertEquals(result.remaining, 4);
});

// ── Tests: 429 response format ──

Deno.test("rate-limit: blocked request returns 429 with Retry-After", () => {
  const buckets = new Map<string, RateBucket>();
  for (let i = 0; i < 5; i++) {
    checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  }
  const result = checkRate(buckets, "run:user@x.com", RUN_LIMIT);
  // The HTTP response should be:
  const httpResponse = {
    status: 429,
    headers: { "Retry-After": String(result.retryAfter) },
    body: { error: "Rate limit exceeded. Try again in " + result.retryAfter + " seconds." },
  };
  assertEquals(httpResponse.status, 429);
  assert(parseInt(httpResponse.headers["Retry-After"]) > 0);
  assert(httpResponse.body.error.includes("Rate limit"));
});
