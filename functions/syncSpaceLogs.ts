import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const HF_API_BASE = "https://huggingface.co/api";

function sanitiseLogLine(line: string): string | null {
  if (/^(user:|input:|prompt:|query:)/i.test(line.trim())) return null;
  if (line.length > 2000) return line.substring(0, 2000) + "...[truncated]";
  return line;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { space_id, agent_listing_version_id } = body;

    if (!space_id || !agent_listing_version_id) {
      return Response.json({ error: "space_id and agent_listing_version_id are required" }, { status: 400 });
    }

    const hfToken = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
    if (!hfToken) {
      return Response.json({ error: "HF token not configured" }, { status: 500 });
    }

    // Check Space runtime status
    const runtimeResp = await fetch(`${HF_API_BASE}/spaces/${space_id}/runtime`, {
      headers: { Authorization: `Bearer ${hfToken}` },
    });

    if (!runtimeResp.ok) {
      return Response.json({ error: "Failed to reach HF Spaces API", status: runtimeResp.status }, { status: 502 });
    }

    const runtime = await runtimeResp.json();
    const spaceStatus = runtime.stage || "unknown";

    // Only fetch logs when Space is warm/running
    if (!["RUNNING", "RUNNING_BUILDING"].includes(spaceStatus)) {
      return Response.json({
        space_id,
        space_status: spaceStatus,
        message: "Space is not warm — no logs fetched",
        fetched_at: new Date().toISOString(),
      });
    }

    // Fetch logs
    const logsResp = await fetch(`${HF_API_BASE}/spaces/${space_id}/logs`, {
      headers: { Authorization: `Bearer ${hfToken}` },
    });

    let rawLines: string[] = [];
    if (logsResp.ok) {
      const text = await logsResp.text();
      rawLines = text.split("\n").filter(Boolean);
    }

    // Sanitise and cap at 500 lines
    const sanitised = rawLines
      .map(sanitiseLogLine)
      .filter((l): l is string => l !== null)
      .slice(-500);

    // Write to SpaceLog entity
    await base44.asServiceRole.entities.SpaceLog.create({
      space_id,
      agent_listing_version_id,
      log_lines: sanitised,
      fetched_at: new Date().toISOString(),
    });

    return Response.json({
      space_id,
      space_status: spaceStatus,
      lines_fetched: sanitised.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
