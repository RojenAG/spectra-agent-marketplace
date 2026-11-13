/**
 * Unit tests for getAuthorAnalytics backend function
 * Tests: ownership verification, date filtering, aggregation, time series
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated getAuthorAnalytics logic ──

function simulateGetAuthorAnalytics(listing: any, versions: any[], runs: any[], userEmail: string, days: number, versionId?: string) {
  if (!listing) {
    return { status: 404, body: { error: "Agent listing not found" } };
  }
  if (listing.created_by !== userEmail) {
    return { status: 403, body: { error: "Forbidden" } };
  }

  const versionIds = new Set(versions.map(v => v.id));
  let filteredRuns = runs.filter(r => {
    if (versionId) return r.agent_listing_version_id === versionId;
    return versionIds.has(r.agent_listing_version_id);
  });

  // Date window filter
  const since = new Date();
  since.setDate(since.getDate() - days);
  filteredRuns = filteredRuns.filter(r => r.started_at && new Date(r.started_at) >= since);

  // Aggregate by date
  const byDate: Record<string, { run_count: number; success_count: number; total_duration: number; duration_count: number }> = {};
  for (const run of filteredRuns) {
    const date = (run.started_at || "").split("T")[0];
    if (!date) continue;
    if (!byDate[date]) byDate[date] = { run_count: 0, success_count: 0, total_duration: 0, duration_count: 0 };
    byDate[date].run_count++;
    if (run.status === "completed") {
      byDate[date].success_count++;
      if (run.started_at && run.completed_at) {
        const dur = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
        byDate[date].total_duration += dur;
        byDate[date].duration_count++;
      }
    }
  }

  const timeSeries = Object.entries(byDate)
    .map(([date, stats]) => ({
      date,
      run_count: stats.run_count,
      success_count: stats.success_count,
      avg_duration_ms: stats.duration_count > 0 ? Math.round(stats.total_duration / stats.duration_count) : 0,
      success_rate: stats.run_count > 0 ? Math.round((stats.success_count / stats.run_count) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalRuns = filteredRuns.length;
  const successRuns = filteredRuns.filter(r => r.status === "completed").length;

  return {
    status: 200,
    body: {
      time_series: timeSeries,
      totals: {
        run_count: totalRuns,
        success_count: successRuns,
        success_rate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
      },
    },
  };
}

// ── Test data ──

const now = new Date();
function daysAgoISO(n: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const mockListing = { id: "list-1", created_by: "alice@example.com" };
const mockVersions = [
  { id: "ver-1", agent_listing_id: "list-1" },
  { id: "ver-2", agent_listing_id: "list-1" },
];
const mockRuns = [
  { id: "r1", agent_listing_version_id: "ver-1", status: "completed", started_at: daysAgoISO(1), completed_at: daysAgoISO(1) },
  { id: "r2", agent_listing_version_id: "ver-1", status: "failed", started_at: daysAgoISO(2), completed_at: daysAgoISO(2) },
  { id: "r3", agent_listing_version_id: "ver-2", status: "completed", started_at: daysAgoISO(3), completed_at: daysAgoISO(3) },
  { id: "r4", agent_listing_version_id: "ver-1", status: "pending", started_at: daysAgoISO(5), completed_at: null },
  { id: "r5", agent_listing_version_id: "ver-2", status: "completed", started_at: daysAgoISO(40), completed_at: daysAgoISO(40) }, // outside 30-day window
];

// ── Tests ──

Deno.test("getAuthorAnalytics: returns 404 for missing listing", () => {
  const result = simulateGetAuthorAnalytics(null, [], [], "alice@example.com", 30);
  assertEquals(result.status, 404);
});

Deno.test("getAuthorAnalytics: returns 403 for non-owner", () => {
  const result = simulateGetAuthorAnalytics(mockListing, [], [], "bob@example.com", 30);
  assertEquals(result.status, 403);
  assertEquals(result.body.error, "Forbidden");
});

Deno.test("getAuthorAnalytics: owner gets 200 with data", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 30);
  assertEquals(result.status, 200);
  assert(result.body.time_series.length > 0);
});

Deno.test("getAuthorAnalytics: date window filters out old runs", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 30);
  // r5 is 40 days old, should be excluded
  const allDates = result.body.time_series.map(t => t.date);
  const oldDate = daysAgoISO(40).split("T")[0];
  assert(!allDates.includes(oldDate), "40-day-old run should be excluded from 30-day window");
});

Deno.test("getAuthorAnalytics: totals calculate correctly", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 30);
  // Within 30 days: r1 (completed), r2 (failed), r3 (completed), r4 (pending) = 4 runs, 2 completed
  assertEquals(result.body.totals.run_count, 4);
  assertEquals(result.body.totals.success_count, 2);
  // 2/4 = 50%
  assertEquals(result.body.totals.success_rate, 50);
});

Deno.test("getAuthorAnalytics: success_rate is 0 when no runs", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, [], "alice@example.com", 30);
  assertEquals(result.body.totals.run_count, 0);
  assertEquals(result.body.totals.success_rate, 0);
});

Deno.test("getAuthorAnalytics: time series sorted by date ascending", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 30);
  const dates = result.body.time_series.map(t => t.date);
  for (let i = 1; i < dates.length; i++) {
    assert(dates[i] >= dates[i - 1], "dates should be sorted ascending");
  }
});

Deno.test("getAuthorAnalytics: version_id filter works", () => {
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 30, "ver-2");
  // Only r3 (ver-2, 3 days ago) is within window
  assertEquals(result.body.totals.run_count, 1);
  assertEquals(result.body.totals.success_count, 1);
});

Deno.test("getAuthorAnalytics: runs from unknown versions excluded", () => {
  const runs = [
    { id: "rx", agent_listing_version_id: "unknown-ver", status: "completed", started_at: daysAgoISO(1), completed_at: daysAgoISO(1) },
  ];
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, runs, "alice@example.com", 30);
  assertEquals(result.body.totals.run_count, 0);
});

Deno.test("getAuthorAnalytics: avg_duration_ms calculated correctly", () => {
  const run = {
    id: "dur-1",
    agent_listing_version_id: "ver-1",
    status: "completed",
    started_at: daysAgoISO(1),
    completed_at: new Date(new Date(daysAgoISO(1)).getTime() + 5000).toISOString(), // +5 seconds
  };
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, [run], "alice@example.com", 30);
  assertEquals(result.body.time_series[0].avg_duration_ms, 5000);
});

Deno.test("getAuthorAnalytics: pending run has no duration", () => {
  const run = {
    id: "pend-1",
    agent_listing_version_id: "ver-1",
    status: "pending",
    started_at: daysAgoISO(1),
    completed_at: null,
  };
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, [run], "alice@example.com", 30);
  assertEquals(result.body.time_series[0].avg_duration_ms, 0);
  assertEquals(result.body.time_series[0].success_rate, 0);
});

Deno.test("getAuthorAnalytics: custom days window works", () => {
  // 45-day window should include r5 (40 days old)
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, mockRuns, "alice@example.com", 45);
  assertEquals(result.body.totals.run_count, 5);
  assertEquals(result.body.totals.success_count, 3); // r1, r3, r5 completed
});

Deno.test("getAuthorAnalytics: multiple runs on same day aggregate", () => {
  const sameDayRuns = [
    { id: "s1", agent_listing_version_id: "ver-1", status: "completed", started_at: daysAgoISO(1), completed_at: daysAgoISO(1) },
    { id: "s2", agent_listing_version_id: "ver-1", status: "failed", started_at: daysAgoISO(1), completed_at: daysAgoISO(1) },
    { id: "s3", agent_listing_version_id: "ver-1", status: "completed", started_at: daysAgoISO(1), completed_at: daysAgoISO(1) },
  ];
  const result = simulateGetAuthorAnalytics(mockListing, mockVersions, sameDayRuns, "alice@example.com", 30);
  assertEquals(result.body.time_series.length, 1);
  assertEquals(result.body.time_series[0].run_count, 3);
  assertEquals(result.body.time_series[0].success_count, 2);
  assertEquals(result.body.time_series[0].success_rate, 67); // round(2/3 * 100) = 67
});
