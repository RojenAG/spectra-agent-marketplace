import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { agent_listing_id, rating, comment, issue_id } = body;

    if (!agent_listing_id) {
      return Response.json({ error: 'agent_listing_id is required' }, { status: 400 });
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return Response.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 });
    }

    if (comment && comment.length > 2000) {
      return Response.json({ error: 'comment must be 2000 characters or fewer' }, { status: 400 });
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

    // Prevent self-review
    if (listing.author && listing.author.toLowerCase() === user.email.toLowerCase()) {
      return Response.json({ error: 'You cannot review your own agent' }, { status: 403 });
    }

    // 1 review per user per listing — upsert on existing review
    const existingReviews = await base44.asServiceRole.entities.AgentReview.filter({
      agent_listing_id,
      created_by: user.email,
    });
    const existing = existingReviews[0];

    let review: any;
    if (existing) {
      // User-scoped update — RLS ensures this only succeeds because the caller owns this record
      review = await base44.entities.AgentReview.update(existing.id, {
        rating: ratingNum,
        comment: comment || '',
        ...(issue_id ? { issue_id } : {}),
      });
    } else {
      review = await base44.entities.AgentReview.create({
        agent_listing_id,
        rating: ratingNum,
        comment: comment || '',
        ...(issue_id ? { issue_id } : {}),
      });
    }

    // Recompute average_rating across all reviews for this listing
    const allReviews = await base44.asServiceRole.entities.AgentReview.filter({ agent_listing_id });
    const total = allReviews.reduce((sum: number, r: any) => sum + (Number(r.rating) || 0), 0);
    const average = allReviews.length > 0 ? Math.round((total / allReviews.length) * 10) / 10 : 0;

    await base44.asServiceRole.entities.AgentListing.update(listing.id, {
      average_rating: average,
    });

    return Response.json({
      success: true,
      review_id: review.id,
      updated_existing: !!existing,
      average_rating: average,
      review_count: allReviews.length,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
