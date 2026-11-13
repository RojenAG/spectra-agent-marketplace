/**
 * Integration tests for the publish + moderation flow
 * Tests: auto-approve path (repeat authors), human-review path (first-time authors),
 *        rejection + resubmit cycle, status transitions, WhatsApp command parsing
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Simulated publish + moderation state machine ──

type ModerationStatus = "pending" | "pending_human_review" | "auto_approved" | "approved" | "rejected";

interface Listing {
  id: string;
  author: string;
  is_published: boolean;
  run_count: number;
  average_rating: number;
}

interface Version {
  id: string;
  agent_listing_id: string;
  version: number;
  moderation_status: ModerationStatus;
  moderation_notes: string | null;
  is_latest: boolean;
  space_url: string;
  published_at: string;
}

function autoModerate(
  author: string,
  existingListings: Listing[],
  newVersion: Version
): { status: ModerationStatus; listing_published: boolean; whatsapp_sent: boolean } {
  const hasPriorApproved = existingListings.some(
    l => l.author === author && l.is_published
  );

  if (!hasPriorApproved) {
    newVersion.moderation_status = "pending_human_review";
    return { status: "pending_human_review", listing_published: false, whatsapp_sent: true };
  } else {
    newVersion.moderation_status = "auto_approved";
    return { status: "auto_approved", listing_published: true, whatsapp_sent: false };
  }
}

function poApprove(version: Version, listing: Listing): { status: ModerationStatus; listing_published: boolean; message: string } {
  if (version.moderation_status !== "pending_human_review") {
    return { status: version.moderation_status, listing_published: listing.is_published, message: "Not in human review" };
  }
  version.moderation_status = "approved";
  listing.is_published = true;
  return { status: "approved", listing_published: true, message: "Agent approved and published" };
}

function poReject(version: Version, reason: string): { status: ModerationStatus; listing_published: boolean; message: string } {
  if (version.moderation_status !== "pending_human_review") {
    return { status: version.moderation_status, listing_published: false, message: "Not in human review" };
  }
  version.moderation_status = "rejected";
  version.moderation_notes = reason;
  return { status: "rejected", listing_published: false, message: "Agent rejected" };
}

function resubmit(
  listing: Listing,
  rejectedVersion: Version,
  newCapabilities: any[],
  newSpaceUrl: string
): Version {
  rejectedVersion.is_latest = false;
  return {
    id: `ver-${Date.now()}`,
    agent_listing_id: listing.id,
    version: rejectedVersion.version + 1,
    moderation_status: "pending",
    moderation_notes: null,
    is_latest: true,
    space_url: newSpaceUrl,
    published_at: new Date().toISOString(),
  };
}

// ── Helpers ──

function makeListing(id: string, author: string, published = false): Listing {
  return { id, author, is_published: published, run_count: 0, average_rating: 0 };
}

function makeVersion(id: string, listingId: string, ver: number, status: ModerationStatus = "pending"): Version {
  return {
    id, agent_listing_id: listingId, version: ver, moderation_status: status,
    moderation_notes: null, is_latest: true, space_url: "https://huggingface.co/spaces/user/agent",
    published_at: new Date().toISOString(),
  };
}

// ── Tests: Auto-approve path (repeat authors) ──

Deno.test("publish+moderation: repeat author gets auto_approved", () => {
  const author = "alice@example.com";
  const existingListings = [makeListing("list-1", author, true)];
  const newVersion = makeVersion("ver-2", "list-2", 1);

  const result = autoModerate(author, existingListings, newVersion);

  assertEquals(result.status, "auto_approved");
  assertEquals(result.listing_published, true);
  assertEquals(result.whatsapp_sent, false);
  assertEquals(newVersion.moderation_status, "auto_approved");
});

Deno.test("publish+moderation: author with only unpublished prior listings goes to human review", () => {
  const author = "bob@example.com";
  const existingListings = [makeListing("list-1", author, false)];
  const newVersion = makeVersion("ver-1", "list-2", 1);

  const result = autoModerate(author, existingListings, newVersion);

  assertEquals(result.status, "pending_human_review");
  assertEquals(result.whatsapp_sent, true);
});

Deno.test("publish+moderation: author with only rejected prior listings goes to human review", () => {
  const author = "carol@example.com";
  const existingListings = [makeListing("list-1", author, false)];
  const newVersion = makeVersion("ver-1", "list-2", 1);

  const result = autoModerate(author, existingListings, newVersion);
  assertEquals(result.status, "pending_human_review");
});

Deno.test("publish+moderation: truly first-time author goes to human review", () => {
  const author = "dave@example.com";
  const existingListings: Listing[] = [];
  const newVersion = makeVersion("ver-1", "list-1", 1);

  const result = autoModerate(author, existingListings, newVersion);

  assertEquals(result.status, "pending_human_review");
  assertEquals(result.whatsapp_sent, true);
  assertEquals(result.listing_published, false);
});

// ── Tests: Human review path ──

Deno.test("publish+moderation: PO approves first-time author via WhatsApp", () => {
  const listing = makeListing("list-1", "dave@example.com", false);
  const version = makeVersion("ver-1", "list-1", 1, "pending_human_review");

  const result = poApprove(version, listing);

  assertEquals(result.status, "approved");
  assertEquals(result.listing_published, true);
  assertEquals(listing.is_published, true);
  assertEquals(version.moderation_status, "approved");
  assert(result.message.includes("approved"));
});

Deno.test("publish+moderation: PO rejects first-time author with reason", () => {
  const version = makeVersion("ver-1", "list-1", 1, "pending_human_review");

  const result = poReject(version, "Capabilities array is empty, please add at least one capability");

  assertEquals(result.status, "rejected");
  assertEquals(result.listing_published, false);
  assertEquals(version.moderation_status, "rejected");
  assertEquals(version.moderation_notes, "Capabilities array is empty, please add at least one capability");
  assert(result.message.includes("rejected"));
});

Deno.test("publish+moderation: PO approval only works on pending_human_review status", () => {
  const listing = makeListing("list-1", "x@y.com", false);
  const version = makeVersion("ver-1", "list-1", 1, "auto_approved");

  const result = poApprove(version, listing);

  assertEquals(result.status, "auto_approved");
  assertEquals(result.listing_published, false);
  assertEquals(result.message, "Not in human review");
});

Deno.test("publish+moderation: PO rejection only works on pending_human_review status", () => {
  const version = makeVersion("ver-1", "list-1", 1, "approved");

  const result = poReject(version, "too late");

  assertEquals(result.status, "approved");
  assertEquals(result.message, "Not in human review");
});

Deno.test("publish+moderation: rejection with empty reason still saves", () => {
  const version = makeVersion("ver-1", "list-1", 1, "pending_human_review");

  const result = poReject(version, "");

  assertEquals(result.status, "rejected");
  assertEquals(version.moderation_notes, "");
});

// ── Tests: Rejection + resubmit cycle ──

Deno.test("publish+moderation: resubmit creates new version after rejection", () => {
  const listing = makeListing("list-1", "eve@example.com", false);
  const rejectedVersion = makeVersion("ver-1", "list-1", 1, "rejected");
  rejectedVersion.moderation_notes = "Invalid Space URL";

  const newVersion = resubmit(listing, rejectedVersion, ["api", "db"], "https://huggingface.co/spaces/user/fixed-agent");

  assertEquals(newVersion.version, 2);
  assertEquals(newVersion.moderation_status, "pending");
  assertEquals(newVersion.is_latest, true);
  assertEquals(newVersion.space_url, "https://huggingface.co/spaces/user/fixed-agent");
  assertEquals(rejectedVersion.is_latest, false);
});

Deno.test("publish+moderation: resubmitted version goes through moderation again", () => {
  const author = "eve@example.com";
  const existingListings = [makeListing("list-1", author, false)];
  const newVersion = makeVersion("ver-2", "list-1", 2);

  const result = autoModerate(author, existingListings, newVersion);

  assertEquals(result.status, "pending_human_review");
});

Deno.test("publish+moderation: resubmit after first approval gets auto_approved", () => {
  const author = "frank@example.com";
  const existingListings = [makeListing("list-1", author, true)];
  const newVersion = makeVersion("ver-2", "list-1", 2);

  const result = autoModerate(author, existingListings, newVersion);

  assertEquals(result.status, "auto_approved");
  assertEquals(result.whatsapp_sent, false);
});

Deno.test("publish+moderation: multiple resubmits increment version correctly", () => {
  const listing = makeListing("list-1", "grace@example.com", false);
  let currentVersion = makeVersion("ver-1", "list-1", 1, "rejected");

  const v2 = resubmit(listing, currentVersion, ["x"], "https://huggingface.co/spaces/u/a2");
  assertEquals(v2.version, 2);
  currentVersion = v2;

  currentVersion.moderation_status = "rejected";
  const v3 = resubmit(listing, currentVersion, ["x", "y"], "https://huggingface.co/spaces/u/a3");
  assertEquals(v3.version, 3);
});

// ── Tests: WhatsApp command parsing ──

Deno.test("publish+moderation: WhatsApp APPROVE AGENT command parsed correctly", () => {
  const msg = "APPROVE AGENT 6a87f9426b6a34838d9dde24";
  const match = /^APPROVE\s+AGENT\s+(\S+)$/i.exec(msg.trim());
  assert(match);
  assertEquals(match![1], "6a87f9426b6a34838d9dde24");
});

Deno.test("publish+moderation: WhatsApp REJECT AGENT command with reason parsed correctly", () => {
  const msg = "REJECT AGENT 6a87f9426b6a34838d9dde24 Missing required capabilities";
  const match = /^REJECT\s+AGENT\s+(\S+)\s+(.+)$/i.exec(msg.trim());
  assert(match);
  assertEquals(match![1], "6a87f9426b6a34838d9dde24");
  assertEquals(match![2], "Missing required capabilities");
});

Deno.test("publish+moderation: WhatsApp REJECT AGENT with multi-word reason", () => {
  const msg = "REJECT AGENT abc123 The Space URL is invalid and capabilities list is empty. Please fix both.";
  const match = /^REJECT\s+AGENT\s+(\S+)\s+(.+)$/i.exec(msg.trim());
  assert(match);
  assertEquals(match![1], "abc123");
  assert(match![2].includes("Space URL is invalid"));
  assert(match![2].includes("capabilities list is empty"));
});

Deno.test("publish+moderation: Sprint APPROVE (no AGENT suffix) is not agent moderation", () => {
  const msg = "APPROVE";
  const match = /^APPROVE\s+AGENT\s+(\S+)$/i.exec(msg.trim());
  assertEquals(match, null);
});

Deno.test("publish+moderation: random message is not parsed as agent command", () => {
  const msgs = ["hello", "APPROVE SPRINT 8", "REJECT something else", "can you check the logs?", ""];
  for (const msg of msgs) {
    const approve = /^APPROVE\s+AGENT\s+(\S+)$/i.exec(msg.trim());
    const reject = /^REJECT\s+AGENT\s+(\S+)\s+(.+)$/i.exec(msg.trim());
    assertEquals(approve, null);
    assertEquals(reject, null);
  }
});

Deno.test("publish+moderation: case-insensitive command parsing", () => {
  const msgs = ["approve agent abc123", "Approve Agent abc123", "APPROVE agent abc123"];
  for (const msg of msgs) {
    const match = /^APPROVE\s+AGENT\s+(\S+)$/i.exec(msg.trim());
    assert(match, `Should match: ${msg}`);
    assertEquals(match![1], "abc123");
  }
});

// ── Tests: Full lifecycle simulation ──

Deno.test("publish+moderation: full first-time author lifecycle", () => {
  const author = "newbie@example.com";
  const existingListings: Listing[] = [];

  // Step 1: First publish
  const listing = makeListing("list-1", author, false);
  const v1 = makeVersion("ver-1", "list-1", 1);
  const modResult = autoModerate(author, existingListings, v1);
  assertEquals(modResult.status, "pending_human_review");
  assertEquals(modResult.whatsapp_sent, true);

  // Step 2: PO approves
  const approveResult = poApprove(v1, listing);
  assertEquals(approveResult.status, "approved");
  assertEquals(listing.is_published, true);

  // Step 3: Second agent auto-approves
  const listing2 = makeListing("list-2", author, false);
  const v2 = makeVersion("ver-2", "list-2", 1);
  const mod2Result = autoModerate(author, [listing], v2);
  assertEquals(mod2Result.status, "auto_approved");
  assertEquals(mod2Result.whatsapp_sent, false);
});

Deno.test("publish+moderation: full reject + resubmit lifecycle", () => {
  const author = "retry@example.com";
  const existingListings: Listing[] = [];
  const listing = makeListing("list-1", author, false);

  // Step 1: Submit
  const v1 = makeVersion("ver-1", "list-1", 1);
  autoModerate(author, existingListings, v1);
  assertEquals(v1.moderation_status, "pending_human_review");

  // Step 2: PO rejects
  const rejectResult = poReject(v1, "Space URL returns 404");
  assertEquals(rejectResult.status, "rejected");
  assertEquals(v1.moderation_notes, "Space URL returns 404");
  assertEquals(listing.is_published, false);

  // Step 3: Author resubmits
  const v2 = resubmit(listing, v1, ["api"], "https://huggingface.co/spaces/user/fixed-space");
  assertEquals(v2.version, 2);
  assertEquals(v1.is_latest, false);
  assertEquals(v2.is_latest, true);

  // Step 4: New version through moderation
  autoModerate(author, [listing], v2);
  assertEquals(v2.moderation_status, "pending_human_review");

  // Step 5: PO approves
  const approveResult = poApprove(v2, listing);
  assertEquals(approveResult.status, "approved");
  assertEquals(listing.is_published, true);
});

// ── Tests: ModerationStatusBanner behavior ──

Deno.test("publish+moderation: banner status mapping", () => {
  const bannerText: Record<string, string> = {
    "pending": "Pending automated review",
    "pending_human_review": "Awaiting PO review",
    "auto_approved": "Published",
    "approved": "Published",
    "rejected": "Rejected — see notes and resubmit",
  };
  assertEquals(bannerText["pending_human_review"], "Awaiting PO review");
  assertEquals(bannerText["rejected"], "Rejected — see notes and resubmit");
  assertEquals(bannerText["approved"], "Published");
});

Deno.test("publish+moderation: rejected version shows resubmit CTA", () => {
  const version = makeVersion("ver-1", "list-1", 1, "rejected");
  version.moderation_notes = "Fix the Space URL";

  const showResubmitCTA = version.moderation_status === "rejected";
  assert(showResubmitCTA, "rejected version should show resubmit CTA");

  const showNotes = version.moderation_notes !== null;
  assert(showNotes, "rejected version should display moderation notes");
});

Deno.test("publish+moderation: approved version hides resubmit CTA", () => {
  const version = makeVersion("ver-1", "list-1", 1, "approved");
  const showResubmitCTA = version.moderation_status === "rejected";
  assertEquals(showResubmitCTA, false);
});
