import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RUN_TIMEOUT_MS = 30000;

function validateAgainstSchema(input: any, schema: any): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== 'object' || Object.keys(schema).length === 0) {
    return errors; // no schema to validate against
  }
  const properties = schema.properties || {};
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];

  for (const field of required) {
    if (input === undefined || input === null || input[field] === undefined || input[field] === null || input[field] === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, value] of Object.entries(input || {})) {
    const propSchema = properties[key];
    if (!propSchema) continue; // allow extra fields silently
    const expectedType = propSchema.type;
    if (!expectedType) continue;
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const typeOk =
      (expectedType === 'string' && actualType === 'string') ||
      (expectedType === 'number' && actualType === 'number') ||
      (expectedType === 'integer' && actualType === 'number' && Number.isInteger(value)) ||
      (expectedType === 'boolean' && actualType === 'boolean') ||
      (expectedType === 'array' && actualType === 'array') ||
      (expectedType === 'object' && actualType === 'object');
    if (!typeOk) {
      errors.push(`Field "${key}" expected type ${expectedType}, got ${actualType}`);
    }
  }
  return errors;
}

function extractSpaceApiBase(spaceUrl: string): string | null {
  const match = /^https:\/\/huggingface\.co\/spaces\/([a-zA-Z0-9_.\-]+)\/([a-zA-Z0-9_.\-]+)$/.exec(spaceUrl || '');
  if (!match) return null;
  const [, owner, space] = match;
  const normalized = `${owner}-${space}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `https://${normalized}.hf.space`;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { agent_listing_version_id, input } = body;

    if (!agent_listing_version_id) {
      return Response.json({ error: 'agent_listing_version_id is required' }, { status: 400 });
    }

    // Load version — tolerate malformed/unknown IDs gracefully
    let version: any = null;
    try {
      const versions = await base44.asServiceRole.entities.AgentListingVersion.filter({ id: agent_listing_version_id });
      version = versions[0];
    } catch (_lookupErr) {
      return Response.json({ error: 'Agent version not found' }, { status: 404 });
    }
    if (!version) {
      return Response.json({ error: 'Agent version not found' }, { status: 404 });
    }
    if (version.moderation_status !== 'approved' && version.moderation_status !== 'auto_approved') {
      return Response.json({ error: 'This agent version is not approved to run' }, { status: 403 });
    }

    // Idempotency guard: reuse an in-flight run for the same version + user
    const existingRuns = await base44.asServiceRole.entities.AgentRun.filter({
      agent_listing_version_id,
      created_by: user.email,
    });
    const inFlight = existingRuns.find((r: any) => r.status === 'pending' || r.status === 'running');
    if (inFlight) {
      return Response.json({
        run_id: inFlight.id,
        status: inFlight.status,
        existing: true,
        message: 'A run is already in progress for this agent — polling existing run.',
      });
    }

    // Validate input against config_schema
    const schemaErrors = validateAgainstSchema(input || {}, version.config_schema);
    if (schemaErrors.length > 0) {
      return Response.json({ error: 'Input validation failed', details: schemaErrors }, { status: 400 });
    }

    // Create AgentRun — pending
    const run = await base44.entities.AgentRun.create({
      agent_listing_version_id,
      status: 'pending',
      started_at: new Date().toISOString(),
    });

    const apiBase = extractSpaceApiBase(version.space_url);
    if (!apiBase) {
      await base44.entities.AgentRun.update(run.id, {
        status: 'failed',
        error: 'Could not resolve Space API URL',
        completed_at: new Date().toISOString(),
      });
      return Response.json({ run_id: run.id, status: 'failed', error: 'Could not resolve Space API URL' }, { status: 502 });
    }

    // Mark running just before the call
    await base44.entities.AgentRun.update(run.id, { status: 'running' });

    try {
      // Capability handshake
      const health = await fetchWithTimeout(`${apiBase}/health`, { method: 'GET' }, 5000);
      if (!health.ok) {
        throw new Error(`Capability handshake failed (${health.status})`);
      }

      // Invoke
      const invokeResp = await fetchWithTimeout(
        `${apiBase}/invoke`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input || {}),
        },
        RUN_TIMEOUT_MS
      );

      if (!invokeResp.ok) {
        throw new Error(`Agent invocation failed (${invokeResp.status})`);
      }

      const output = await invokeResp.json().catch(() => ({}));

      await base44.entities.AgentRun.update(run.id, {
        status: 'completed',
        output,
        completed_at: new Date().toISOString(),
      });

      // Bump run_count on the listing
      const listings = await base44.asServiceRole.entities.AgentListing.filter({ id: version.agent_listing_id });
      const listing = listings[0];
      if (listing) {
        await base44.asServiceRole.entities.AgentListing.update(listing.id, {
          run_count: (listing.run_count || 0) + 1,
        });
      }

      return Response.json({ run_id: run.id, status: 'completed', output });
    } catch (invokeErr: any) {
      const isTimeout = invokeErr?.name === 'AbortError';
      const errMsg = isTimeout ? 'timeout' : invokeErr?.message || 'Unknown error';
      await base44.entities.AgentRun.update(run.id, {
        status: 'failed',
        error: errMsg,
        completed_at: new Date().toISOString(),
      });
      return Response.json({ run_id: run.id, status: 'failed', error: errMsg }, { status: 502 });
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
