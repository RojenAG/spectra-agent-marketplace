import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const REVIEW_LIMIT = 50;
const SPACE_LOG_LIMIT = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    let agent_listing_id: string | null = null;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      agent_listing_id = url.searchParams.get('agent_listing_id') || url.searchParams.get('id');
    } else {
      const body = await req.json().catch(() => ({}));
      agent_listing_id = body.agent_listing_id || body.id || null;
    }

    if (!agent_listing_id) {
      return Response.json({ error: 'agent_listing_id is required' }, { status: 400 });
    }

    // Look up listing — tolerate malformed/unknown IDs gracefully
    let listing: any = null;
    try {
      const listings = await base44.asServiceRole.entities.AgentListing.filter({ id: agent_listing_id });
      listing = listings[0];
    } catch (_lookupErr) {
      return Response.json({ error: 'Agent listing not found' }, { status: 404 });
    }
    if (!listing) {
      return Response.json({ error: 'Agent listing not found' }, { status: 404 });
    }

    const isAuthor = !!user && !!listing.author && listing.author.toLowerCase() === user.email.toLowerCase();

    // Unpublished listings are only visible to their author — 404 for everyone else (avoid leaking existence)
    if (!listing.is_published && !isAuthor) {
      return Response.json({ error: 'Agent listing not found' }, { status: 404 });
    }

    // Versions — newest first
    const versions = await base44.asServiceRole.entities.AgentListingVersion.filter({ agent_listing_id });
    versions.sort((a: any, b: any) => (b.version || 0) - (a.version || 0));

    // For non-authors, only expose versions that have passed moderation
    const visibleVersions = isAuthor
      ? versions
      : versions.filter((v: any) => v.moderation_status === 'approved' || v.moderation_status === 'auto_approved');

    // Reviews — most recent first
    const allReviews = await base44.asServiceRole.entities.AgentReview.filter({ agent_listing_id });
    allReviews.sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
    const reviews = allReviews.slice(0, REVIEW_LIMIT).map((r: any) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_by: r.created_by,
      created_date: r.created_date,
    }));

    const totalRating = allReviews.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
    const averageRating = allReviews.length > 0 ? Math.round((totalRating / allReviews.length) * 10) / 10 : 0;

    // Space logs — author-only, scoped to this listing's versions
    let spaceLogs: any[] = [];
    if (isAuthor) {
      const versionIds = new Set(versions.map((v: any) => v.id));
      const allLogs = await base44.asServiceRole.entities.SpaceLog.filter({});
      spaceLogs = allLogs
        .filter((l: any) => versionIds.has(l.agent_listing_version_id))
        .sort((a: any, b: any) => new Date(b.fetched_at).getTime() - new Date(a.fetched_at).getTime())
        .slice(0, SPACE_LOG_LIMIT)
        .map((l: any) => ({
          id: l.id,
          agent_listing_version_id: l.agent_listing_version_id,
          space_id: l.space_id,
          log_lines: l.log_lines,
          fetched_at: l.fetched_at,
        }));
    }

    return Response.json({
      listing: {
        id: listing.id,
        name: listing.name,
        description: listing.description,
        category: listing.category,
        author: listing.author,
        capabilities: listing.capabilities,
        is_published: listing.is_published,
        run_count: listing.run_count || 0,
        average_rating: averageRating,
      },
      versions: visibleVersions,
      reviews,
      review_count: allReviews.length,
      space_logs: spaceLogs,
      is_author: isAuthor,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
