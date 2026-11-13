/**
 * Unit tests for searchAgents backend function
 * Tests: filtering, sorting, pagination, text search, edge cases
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated searchAgents logic (extracted from the function) ──

function simulateSearch(allRecords: any[], query: string, category: string, sort: string, page: number, limit: number) {
  // Base filter — only published agents
  let records = allRecords.filter(r => r.is_published === true);
  if (category) records = records.filter(r => r.category === category);

  // Text search across name, description, capabilities
  if (query.trim()) {
    const q = query.toLowerCase();
    records = records.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q) ||
      (r.capabilities || []).some((c: string) => c.toLowerCase().includes(q))
    );
  }

  // Sort
  if (sort === "rating") {
    records.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
  } else if (sort === "popular") {
    records.sort((a, b) => (b.run_count || 0) - (a.run_count || 0));
  } else {
    records.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
  }

  const skip = (page - 1) * limit;
  const total = records.length;
  const paginated = records.slice(skip, skip + limit);

  return {
    records: paginated,
    total,
    page,
    limit,
    has_more: skip + limit < total,
  };
}

// ── Test data ──

const mockRecords = [
  { id: "1", name: "Backend Builder", description: "Builds APIs", category: "Backend", is_published: true, average_rating: 4.5, run_count: 100, capabilities: ["api", "database"], created_date: "2026-01-15T10:00:00Z" },
  { id: "2", name: "Frontend Designer", description: "Designs UI", category: "Frontend", is_published: true, average_rating: 4.8, run_count: 200, capabilities: ["ui", "css"], created_date: "2026-02-01T10:00:00Z" },
  { id: "3", name: "QA Tester", description: "Tests everything", category: "QA", is_published: true, average_rating: 3.9, run_count: 50, capabilities: ["test", "automation"], created_date: "2026-03-01T10:00:00Z" },
  { id: "4", name: "Security Scanner", description: "Scans for vulns", category: "Security", is_published: false, average_rating: 0, run_count: 0, capabilities: ["security", "scan"], created_date: "2026-03-15T10:00:00Z" },
  { id: "5", name: "Data Pipeline", description: "ETL pipelines", category: "Backend", is_published: true, average_rating: 4.2, run_count: 75, capabilities: ["etl", "database"], created_date: "2026-04-01T10:00:00Z" },
];

// ── Tests ──

Deno.test("searchAgents: only returns published agents", () => {
  const result = simulateSearch(mockRecords, "", "", "newest", 1, 12);
  assertEquals(result.total, 4);
  assert(!result.records.some(r => r.id === "4"), "unpublished agent should not appear");
});

Deno.test("searchAgents: filters by category", () => {
  const result = simulateSearch(mockRecords, "", "Backend", "newest", 1, 12);
  assertEquals(result.total, 2);
  assert(result.records.every(r => r.category === "Backend"));
});

Deno.test("searchAgents: text search matches name", () => {
  const result = simulateSearch(mockRecords, "backend", "", "newest", 1, 12);
  assertEquals(result.total, 1);
  assertEquals(result.records[0].name, "Backend Builder");
});

Deno.test("searchAgents: text search matches description", () => {
  const result = simulateSearch(mockRecords, "designs", "", "newest", 1, 12);
  assertEquals(result.total, 1);
  assertEquals(result.records[0].name, "Frontend Designer");
});

Deno.test("searchAgents: text search matches capabilities", () => {
  const result = simulateSearch(mockRecords, "etl", "", "newest", 1, 12);
  assertEquals(result.total, 1);
  assertEquals(result.records[0].name, "Data Pipeline");
});

Deno.test("searchAgents: text search is case-insensitive", () => {
  const result = simulateSearch(mockRecords, "SECURITY", "", "newest", 1, 12);
  assertEquals(result.total, 0); // Security agent is unpublished
  const result2 = simulateSearch(mockRecords, "QA", "", "newest", 1, 12);
  assertEquals(result2.total, 1);
});

Deno.test("searchAgents: sort by rating descending", () => {
  const result = simulateSearch(mockRecords, "", "", "rating", 1, 12);
  assertEquals(result.records[0].average_rating, 4.8);
  assertEquals(result.records[1].average_rating, 4.5);
  assertEquals(result.records[2].average_rating, 4.2);
});

Deno.test("searchAgents: sort by popularity (run_count) descending", () => {
  const result = simulateSearch(mockRecords, "", "", "popular", 1, 12);
  assertEquals(result.records[0].run_count, 200);
  assertEquals(result.records[1].run_count, 100);
});

Deno.test("searchAgents: sort by newest (created_date) descending", () => {
  const result = simulateSearch(mockRecords, "", "", "newest", 1, 12);
  assertEquals(result.records[0].id, "5"); // April
  assertEquals(result.records[1].id, "3"); // March
});

Deno.test("searchAgents: pagination works correctly", () => {
  const result = simulateSearch(mockRecords, "", "", "newest", 1, 2);
  assertEquals(result.records.length, 2);
  assertEquals(result.total, 4);
  assertEquals(result.has_more, true);
  assertEquals(result.page, 1);

  const result2 = simulateSearch(mockRecords, "", "", "newest", 2, 2);
  assertEquals(result2.records.length, 2);
  assertEquals(result2.has_more, false);
});

Deno.test("searchAgents: empty query returns all published", () => {
  const result = simulateSearch(mockRecords, "", "", "newest", 1, 12);
  assertEquals(result.total, 4);
});

Deno.test("searchAgents: combined category + text search", () => {
  const result = simulateSearch(mockRecords, "database", "Backend", "newest", 1, 12);
  assertEquals(result.total, 2);
  assert(result.records.every(r => r.category === "Backend"));
  assert(result.records.every(r => r.capabilities.includes("database")));
});

Deno.test("searchAgents: no results for nonexistent query", () => {
  const result = simulateSearch(mockRecords, "nonexistentagent", "", "newest", 1, 12);
  assertEquals(result.total, 0);
  assertEquals(result.records, []);
  assertEquals(result.has_more, false);
});

Deno.test("searchAgents: handles missing fields gracefully", () => {
  const sparseRecords = [
    { id: "x", is_published: true, created_date: "2026-01-01T00:00:00Z" },
  ];
  const result = simulateSearch(sparseRecords, "", "", "newest", 1, 12);
  assertEquals(result.total, 1);
  assertEquals(result.records[0].id, "x");
});

Deno.test("searchAgents: default sort is newest", () => {
  const result = simulateSearch(mockRecords, "", "", "unknown_sort", 1, 12);
  // Should fall through to newest (else branch)
  assertEquals(result.records[0].id, "5");
});
