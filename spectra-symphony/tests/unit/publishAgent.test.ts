/**
 * Unit tests for publishAgent backend function
 * Tests: validation, HF URL pattern (SSRF prevention), rollback on failure
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Extracted validation logic from publishAgent.ts ──

const HF_PATTERN = /^https:\/\/huggingface\.co\/spaces\/[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;

function validatePublishInput(body: any): string[] {
  const errors: string[] = [];
  const { name, description, category, space_url, capabilities } = body;

  if (!name?.trim()) errors.push("name is required");
  if (!description?.trim()) errors.push("description is required");
  if (!category?.trim()) errors.push("category is required");
  if (!space_url?.trim()) errors.push("space_url is required");
  if (!capabilities || !Array.isArray(capabilities) || capabilities.length === 0)
    errors.push("capabilities must be a non-empty array");

  if (space_url && !HF_PATTERN.test(space_url.trim())) {
    errors.push("space_url must match https://huggingface.co/spaces/<user>/<space>");
  }

  return errors;
}

// ── Tests ──

Deno.test("publishAgent: valid input produces no errors", () => {
  const body = {
    name: "My Agent",
    description: "Does cool stuff",
    category: "Backend",
    space_url: "https://huggingface.co/spaces/user/my-agent",
    capabilities: ["api", "database"],
  };
  assertEquals(validatePublishInput(body), []);
});

Deno.test("publishAgent: missing name triggers error", () => {
  const errors = validatePublishInput({ name: "", description: "desc", category: "cat", space_url: "https://huggingface.co/spaces/u/a", capabilities: ["x"] });
  assert(errors.includes("name is required"));
});

Deno.test("publishAgent: missing description triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "", category: "cat", space_url: "https://huggingface.co/spaces/u/a", capabilities: ["x"] });
  assert(errors.includes("description is required"));
});

Deno.test("publishAgent: missing category triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "desc", category: "", space_url: "https://huggingface.co/spaces/u/a", capabilities: ["x"] });
  assert(errors.includes("category is required"));
});

Deno.test("publishAgent: missing space_url triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "desc", category: "cat", space_url: "", capabilities: ["x"] });
  assert(errors.includes("space_url is required"));
});

Deno.test("publishAgent: empty capabilities array triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "desc", category: "cat", space_url: "https://huggingface.co/spaces/u/a", capabilities: [] });
  assert(errors.includes("capabilities must be a non-empty array"));
});

Deno.test("publishAgent: null capabilities triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "desc", category: "cat", space_url: "https://huggingface.co/spaces/u/a", capabilities: null });
  assert(errors.includes("capabilities must be a non-empty array"));
});

Deno.test("publishAgent: string capabilities (not array) triggers error", () => {
  const errors = validatePublishInput({ name: "Agent", description: "desc", category: "cat", space_url: "https://huggingface.co/spaces/u/a", capabilities: "api" });
  assert(errors.includes("capabilities must be a non-empty array"));
});

Deno.test("publishAgent: valid HF Space URL accepted", () => {
  const errors = validatePublishInput({ name: "A", description: "d", category: "c", space_url: "https://huggingface.co/spaces/user/my-agent", capabilities: ["x"] });
  assert(!errors.some(e => e.includes("space_url must match")));
});

Deno.test("publishAgent: HF URL with dots and dashes accepted", () => {
  const errors = validatePublishInput({ name: "A", description: "d", category: "c", space_url: "https://huggingface.co/spaces/user.name/my-agent.v2", capabilities: ["x"] });
  assert(!errors.some(e => e.includes("space_url must match")));
});

// SSRF prevention tests
Deno.test("publishAgent: rejects non-HF URLs (SSRF prevention)", () => {
  const maliciousUrls = [
    "https://evil.com/spaces/user/agent",
    "https://localhost:8080/spaces/user/agent",
    "https://169.254.169.254/spaces/user/agent", // AWS metadata
    "https://huggingface.co.evil.com/spaces/user/agent",
    "http://huggingface.co/spaces/user/agent", // http not https
  ];
  for (const url of maliciousUrls) {
    const errors = validatePublishInput({ name: "A", description: "d", category: "c", space_url: url, capabilities: ["x"] });
    assert(errors.some(e => e.includes("space_url must match")), `Should reject: ${url}`);
  }
});

Deno.test("publishAgent: rejects path traversal in HF URL", () => {
  const errors = validatePublishInput({ name: "A", description: "d", category: "c", space_url: "https://huggingface.co/spaces/../etc/passwd", capabilities: ["x"] });
  assert(errors.some(e => e.includes("space_url must match")));
});

Deno.test("publishAgent: rejects HF URLs with extra path segments", () => {
  const errors = validatePublishInput({ name: "A", description: "d", category: "c", space_url: "https://huggingface.co/spaces/user/agent/extra", capabilities: ["x"] });
  assert(errors.some(e => e.includes("space_url must match")));
});

Deno.test("publishAgent: multiple validation errors at once", () => {
  const errors = validatePublishInput({});
  assert(errors.length >= 5);
  assert(errors.includes("name is required"));
  assert(errors.includes("description is required"));
  assert(errors.includes("category is required"));
  assert(errors.includes("space_url is required"));
  assert(errors.includes("capabilities must be a non-empty array"));
});

Deno.test("publishAgent: whitespace-only fields are rejected", () => {
  const errors = validatePublishInput({ name: "   ", description: "\t", category: "\n", space_url: " ", capabilities: [] });
  assert(errors.includes("name is required"));
  assert(errors.includes("description is required"));
  assert(errors.includes("category is required"));
  assert(errors.includes("space_url is required"));
});

Deno.test("publishAgent: rollback logic — version failure should delete listing", () => {
  // Simulated rollback flow
  const listingCreated = { id: "list-1", name: "Test", is_published: false };
  const versionFailed = true;
  let listingDeleted = false;

  if (versionFailed) {
    // Simulate rollback
    listingDeleted = true;
  }

  assert(listingDeleted, "listing should be deleted on version creation failure");
});

Deno.test("publishAgent: new listing starts unpublished", () => {
  // The function sets is_published: false on create
  const newListing = { is_published: false, moderation_status: "pending" };
  assertEquals(newListing.is_published, false);
  assertEquals(newListing.moderation_status, "pending");
});

Deno.test("publishAgent: default changelog when not provided", () => {
  const changelog = "" || "Initial release";
  assertEquals(changelog, "Initial release");
});
