import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Own listings only — RLS-equivalent enforced explicitly via created_by match
    const listings = await base44.asServiceRole.entities.AgentListing.filter({ created_by: user.email });

    const listingIds = listings.map((l: any) => l.id);
    let versions: any[] = [];
    if (listingIds.length > 0) {
      const allVersions = await base44.asServiceRole.entities.AgentListingVersion.filter({});
      versions = allVersions.filter((v: any) => listingIds.includes(v.agent_listing_id));
    }

    const result = listings.map((listing: any) => {
      const listingVersions = versions
        .filter((v: any) => v.agent_listing_id === listing.id)
        .sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
      return {
        ...listing,
        versions: listingVersions,
        latest_version: listingVersions.find((v: any) => v.is_latest) || listingVersions[0] || null,
      };
    });

    return Response.json({ agents: result, count: result.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
