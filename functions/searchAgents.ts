import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const { query = "", category = "", sort = "newest", page = 1, limit = 12 } = body;

    const skip = (Number(page) - 1) * Number(limit);

    // Build base filter — only published agents
    const filter: any = { is_published: true };
    if (category) filter.category = category;

    // Fetch broad set then apply in-memory text search
    let records = await base44.asServiceRole.entities.AgentListing.filter(filter, { limit: 500 });

    // Text search across name, description, capabilities
    if (query.trim()) {
      const q = query.toLowerCase();
      records = records.filter((r: any) =>
        (r.name || "").toLowerCase().includes(q) ||
        (r.description || "").toLowerCase().includes(q) ||
        (r.capabilities || []).some((c: string) => c.toLowerCase().includes(q))
      );
    }

    // Sort
    if (sort === "rating") {
      records.sort((a: any, b: any) => (b.average_rating || 0) - (a.average_rating || 0));
    } else if (sort === "popular") {
      records.sort((a: any, b: any) => (b.run_count || 0) - (a.run_count || 0));
    } else {
      // newest (default)
      records.sort((a: any, b: any) =>
        new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
      );
    }

    const total = records.length;
    const paginated = records.slice(skip, skip + Number(limit));

    return Response.json({
      records: paginated,
      total,
      page: Number(page),
      limit: Number(limit),
      has_more: skip + Number(limit) < total,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
