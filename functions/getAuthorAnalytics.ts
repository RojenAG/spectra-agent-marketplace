import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { agent_listing_id, version_id, days = 30 } = body;

    if (!agent_listing_id) {
      return Response.json({ error: "agent_listing_id is required" }, { status: 400 });
    }

    // Verify listing belongs to this author — tolerate malformed/unknown IDs gracefully
    let listing: any = null;
    try {
      const listings = await base44.asServiceRole.entities.AgentListing.filter({ id: agent_listing_id });
      listing = listings[0];
    } catch (_lookupErr) {
      return Response.json({ error: "Agent listing not found" }, { status: 404 });
    }
    if (!listing) {
      return Response.json({ error: "Agent listing not found" }, { status: 404 });
    }
    if (listing.created_by !== user.email) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Get all versions for this listing
    const versions = await base44.asServiceRole.entities.AgentListingVersion.filter({ agent_listing_id });
    const versionIds = new Set(versions.map((v: any) => v.id));

    // Fetch AgentRun records
    let runs = await base44.asServiceRole.entities.AgentRun.filter({});
    runs = runs.filter((r: any) => {
      if (version_id) return r.agent_listing_version_id === version_id;
      return versionIds.has(r.agent_listing_version_id);
    });

    // Filter to date window
    const since = new Date();
    since.setDate(since.getDate() - Number(days));
    runs = runs.filter((r: any) => r.started_at && new Date(r.started_at) >= since);

    // Aggregate by date
    const byDate: Record<string, { run_count: number; success_count: number; total_duration: number; duration_count: number }> = {};
    for (const run of runs) {
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

    const totalRuns = runs.length;
    const successRuns = runs.filter((r: any) => r.status === "completed").length;

    return Response.json({
      agent_listing_id,
      version_id: version_id || null,
      days: Number(days),
      time_series: timeSeries,
      totals: {
        run_count: totalRuns,
        success_count: successRuns,
        success_rate: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
