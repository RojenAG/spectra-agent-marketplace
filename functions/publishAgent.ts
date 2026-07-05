import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, description, category, space_url, capabilities, config_schema, changelog } = body;

    // --- Validation ---
    const errors: string[] = [];
    if (!name?.trim()) errors.push("name is required");
    if (!description?.trim()) errors.push("description is required");
    if (!category?.trim()) errors.push("category is required");
    if (!space_url?.trim()) errors.push("space_url is required");
    if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0)
      errors.push("capabilities must be a non-empty array");

    // HF Space URL pattern validation (SSRF prevention)
    const HF_PATTERN = /^https:\/\/huggingface\.co\/spaces\/[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;
    if (space_url && !HF_PATTERN.test(space_url.trim())) {
      errors.push("space_url must match https://huggingface.co/spaces/<user>/<space>");
    }

    if (errors.length > 0) {
      return Response.json({ success: false, errors }, { status: 400 });
    }

    let listing: any = null;
    let version: any = null;

    // Step 1: Create AgentListing
    listing = await base44.asServiceRole.entities.AgentListing.create({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      author: user.email,
      is_published: false,
      run_count: 0,
      average_rating: 0,
    });

    try {
      // Step 2: Create AgentListingVersion
      version = await base44.asServiceRole.entities.AgentListingVersion.create({
        agent_listing_id: listing.id,
        version: 1,
        capabilities,
        config_schema: config_schema || {},
        changelog: changelog || "Initial release",
        is_latest: true,
        moderation_status: "pending",
        space_url: space_url.trim(),
        published_at: new Date().toISOString(),
      });
    } catch (versionErr: any) {
      // Rollback: delete orphaned listing
      try {
        await base44.asServiceRole.entities.AgentListing.delete(listing.id);
      } catch (_) {}
      return Response.json(
        { success: false, error: "Failed to create version: " + versionErr?.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      listing_id: listing.id,
      version_id: version.id,
      moderation_status: "pending",
      message: "Agent submitted for review. You will be notified when it goes live.",
    });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
