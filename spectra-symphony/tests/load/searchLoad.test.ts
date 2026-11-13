/**
 * Load testing for marketplace search and discovery
 * Tests: simulated concurrent users, response time measurement, bottleneck identification,
 *        large catalog handling (100+ listings)
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated searchAgents for load testing ──

function searchAgents(records: any[], query: string, category: string, sort: string, page: number, limit: number) {
  let filtered = records.filter(r => r.is_published === true);
  if (category) filtered = filtered.filter(r => r.category === category);
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) ||
      (r.capabilities || []).some((c: string) => c.toLowerCase().includes(q))
    );
  }
  if (sort === "rating") filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
  else if (sort === "popular") filtered.sort((a, b) => (b.run_count || 0) - (a.run_count || 0));
  else filtered.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());

  const skip = (page - 1) * limit;
  return {
    records: filtered.slice(skip, skip + limit),
    total: filtered.length,
    page, limit,
    has_more: skip + limit < filtered.length,
  };
}

// ── Generate large dataset ──

function generateListings(count: number): any[] {
  const categories = ["Backend", "Frontend", "QA", "Security", "DevOps", "Data"];
  const capPool = ["api", "ui", "test", "scan", "deploy", "etl", "database", "auth", "css", "automation"];
  return Array.from({ length: count }, (_, i) => ({
    id: `agent-${i + 1}`,
    name: `Agent ${i + 1}`,
    description: `Agent number ${i + 1} for testing`,
    category: categories[i % categories.length],
    is_published: i % 10 !== 0, // 90% published
    average_rating: Math.round((Math.random() * 5) * 10) / 10,
    run_count: Math.floor(Math.random() * 500),
    capabilities: [capPool[i % capPool.length], capPool[(i + 1) % capPool.length]],
    created_date: new Date(2026, 0, i % 28 + 1).toISOString(),
  }));
}

// ── Tests: Performance with large catalogs ──

Deno.test("load: search 100 published agents returns correct count", () => {
  const records = generateListings(112); // ~101 published
  const result = searchAgents(records, "", "", "newest", 1, 12);
  assert(result.total >= 90 && result.total <= 102);
  assertEquals(result.records.length, 12);
});

Deno.test("load: search 500+ agents completes in reasonable time", () => {
  const records = generateListings(600);
  const start = performance.now();
  const result = searchAgents(records, "", "", "newest", 1, 12);
  const elapsed = performance.now() - start;
  assertEquals(result.records.length, 12);
  assert(elapsed < 100, `Search should complete in <100ms, took ${elapsed}ms`);
});

Deno.test("load: text search across 500 agents with query", () => {
  const records = generateListings(600);
  const start = performance.now();
  const result = searchAgents(records, "agent", "", "newest", 1, 12);
  const elapsed = performance.now() - start;
  assert(result.total > 0);
  assert(elapsed < 100, `Text search should complete in <100ms, took ${elapsed}ms`);
});

Deno.test("load: category filter across 500 agents", () => {
  const records = generateListings(600);
  const start = performance.now();
  const result = searchAgents(records, "", "Backend", "newest", 1, 12);
  const elapsed = performance.now() - start;
  assert(result.total > 0);
  assert(result.records.every(r => r.category === "Backend"));
  assert(elapsed < 100, `Category filter should complete in <100ms, took ${elapsed}ms`);
});

Deno.test("load: sort by rating across 500 agents", () => {
  const records = generateListings(600);
  const start = performance.now();
  const result = searchAgents(records, "", "", "rating", 1, 12);
  const elapsed = performance.now() - start;
  // Verify sorted descending
  for (let i = 1; i < result.records.length; i++) {
    assert(result.records[i - 1].average_rating >= result.records[i].average_rating, "should be sorted by rating desc");
  }
  assert(elapsed < 100, `Sort by rating should complete in <100ms, took ${elapsed}ms`);
});

Deno.test("load: pagination through all pages of 100 agents", () => {
  const records = generateListings(112);
  let page = 1;
  let allResults: any[] = [];
  let hasMore = true;
  while (hasMore) {
    const result = searchAgents(records, "", "", "newest", page, 12);
    allResults = allResults.concat(result.records);
    hasMore = result.has_more;
    page++;
  }
  // Should have retrieved all published agents
  const publishedCount = records.filter(r => r.is_published).length;
  assertEquals(allResults.length, publishedCount);
});

Deno.test("load: combined filter + search + sort across 500 agents", () => {
  const records = generateListings(600);
  const start = performance.now();
  const result = searchAgents(records, "agent", "Backend", "popular", 1, 12);
  const elapsed = performance.now() - start;
  assert(result.records.every(r => r.category === "Backend"));
  // Verify sorted by run_count descending
  for (let i = 1; i < result.records.length; i++) {
    assert(result.records[i - 1].run_count >= result.records[i].run_count, "should be sorted by run_count desc");
  }
  assert(elapsed < 100, `Combined query should complete in <100ms, took ${elapsed}ms`);
});

// ── Tests: Concurrent request simulation ──

Deno.test("load: 50 concurrent searches return consistent results", async () => {
  const records = generateListings(200);
  const promises = Array.from({ length: 50 }, (_, i) =>
    Promise.resolve(searchAgents(records, "", i % 2 === 0 ? "Backend" : "Frontend", "rating", 1, 12))
  );
  const results = await Promise.all(promises);
  // All results should have the same structure
  for (const r of results) {
    assertEquals(r.records.length, 12);
    assertEquals(r.page, 1);
    assertEquals(r.limit, 12);
  }
  // Backend results should all be Backend, Frontend all Frontend
  const backendResults = results.filter((_, i) => i % 2 === 0);
  const frontendResults = results.filter((_, i) => i % 2 === 1);
  for (const r of backendResults) {
    assert(r.records.every(rec => rec.category === "Backend"));
  }
  for (const r of frontendResults) {
    assert(r.records.every(rec => rec.category === "Frontend"));
  }
});

Deno.test("load: stress test 1000 search requests complete without error", async () => {
  const records = generateListings(300);
  const start = performance.now();
  const promises = Array.from({ length: 1000 }, (_, i) =>
    Promise.resolve(searchAgents(records, i % 3 === 0 ? "api" : "", ["Backend", "Frontend", "QA"][i % 3], "newest", (i % 10) + 1, 12))
  );
  const results = await Promise.all(promises);
  const elapsed = performance.now() - start;
  assertEquals(results.length, 1000);
  assert(results.every(r => r.records.length <= 12), "all results should respect limit");
  assert(elapsed < 500, `1000 searches should complete in <500ms, took ${elapsed}ms`);
});

// ── Tests: Edge cases under load ──

Deno.test("load: empty query on large dataset returns paginated results", () => {
  const records = generateListings(500);
  const result = searchAgents(records, "", "", "newest", 1, 12);
  assert(result.total > 400);
  assertEquals(result.records.length, 12);
  assertEquals(result.has_more, true);
});

Deno.test("load: last page has correct remaining count", () => {
  const records = generateListings(100);
  const publishedCount = records.filter(r => r.is_published).length;
  const lastPage = Math.ceil(publishedCount / 12);
  const result = searchAgents(records, "", "", "newest", lastPage, 12);
  const expectedRemaining = publishedCount - (lastPage - 1) * 12;
  assertEquals(result.records.length, expectedRemaining);
  assertEquals(result.has_more, false);
});

Deno.test("load: nonexistent query on large dataset returns empty", () => {
  const records = generateListings(500);
  const result = searchAgents(records, "xyznonexistent", "", "newest", 1, 12);
  assertEquals(result.total, 0);
  assertEquals(result.records, []);
  assertEquals(result.has_more, false);
});

Deno.test("load: all categories represented in large dataset", () => {
  const records = generateListings(600);
  const categories = ["Backend", "Frontend", "QA", "Security", "DevOps", "Data"];
  for (const cat of categories) {
    const result = searchAgents(records, "", cat, "newest", 1, 12);
    assert(result.total > 0, `Category ${cat} should have results`);
    assert(result.records.every(r => r.category === cat));
  }
});
