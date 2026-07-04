import { useState } from "react";

/**
 * ModerationStatusBanner
 * Shows inline status for each AgentListingVersion.
 * Props:
 *  - version: AgentListingVersion record
 *  - listingId: parent AgentListing id
 *  - onResubmit: async (listingId) => void — called when author resubmits
 */
export default function ModerationStatusBanner({ version, listingId, onResubmit }) {
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitDone, setResubmitDone] = useState(false);
  const [resubmitError, setResubmitError] = useState(null);

  if (!version) return null;

  const status = version.moderation_status;

  const handleResubmit = async () => {
    setResubmitting(true);
    setResubmitError(null);
    try {
      await onResubmit(listingId);
      setResubmitDone(true);
    } catch (err) {
      setResubmitError(err.message || "Resubmit failed");
    } finally {
      setResubmitting(false);
    }
  };

  if (status === "pending") {
    return (
      <div style={{ ...styles.banner, ...styles.pending }}>
        <span style={styles.icon}>🕐</span>
        <div>
          <div style={styles.bannerTitle}>Under review</div>
          <div style={styles.bannerSub}>
            Your agent is being reviewed. This usually takes less than 24 hours.
          </div>
        </div>
      </div>
    );
  }

  if (status === "auto_approved" || status === "approved") {
    const marketplaceUrl = `https://spencer-69b3fd9b.base44.app/marketplace`;
    return (
      <div style={{ ...styles.banner, ...styles.approved }}>
        <span style={styles.icon}>✅</span>
        <div>
          <div style={styles.bannerTitle}>Your agent is live!</div>
          <div style={styles.bannerSub}>
            It's now visible in the marketplace.{" "}
            <a href={marketplaceUrl} target="_blank" rel="noreferrer" style={styles.link}>
              View listing →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    if (resubmitDone) {
      return (
        <div style={{ ...styles.banner, ...styles.pending }}>
          <span style={styles.icon}>🕐</span>
          <div>
            <div style={styles.bannerTitle}>Resubmitted — under review</div>
            <div style={styles.bannerSub}>Your updated agent is being reviewed.</div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ ...styles.banner, ...styles.rejected }}>
        <span style={styles.icon}>❌</span>
        <div style={{ flex: 1 }}>
          <div style={styles.bannerTitle}>Review failed</div>
          <div style={styles.bannerSub}>
            {version.moderation_notes || "No details provided."}
          </div>
          {resubmitError && (
            <div style={styles.resubmitError}>{resubmitError}</div>
          )}
        </div>
        <button
          style={{ ...styles.resubmitBtn, opacity: resubmitting ? 0.6 : 1 }}
          onClick={handleResubmit}
          disabled={resubmitting}
        >
          {resubmitting ? "Resubmitting..." : "Fix & Resubmit"}
        </button>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <div style={{ ...styles.banner, ...styles.revoked }}>
        <span style={styles.icon}>⛔</span>
        <div>
          <div style={styles.bannerTitle}>Listing revoked</div>
          <div style={styles.bannerSub}>
            {version.moderation_notes || "This version has been revoked. Contact support for more info."}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

const styles = {
  banner: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "14px 16px", borderRadius: 10, marginBottom: 12,
    border: "1px solid",
  },
  pending: { background: "#1c1917", borderColor: "#78350f", color: "#fef3c7" },
  approved: { background: "#052e16", borderColor: "#166534", color: "#bbf7d0" },
  rejected: { background: "#1c0505", borderColor: "#7f1d1d", color: "#fecaca" },
  revoked:  { background: "#1a1a1a", borderColor: "#4b5563", color: "#9ca3af" },
  icon: { fontSize: 20, lineHeight: 1, marginTop: 2, flexShrink: 0 },
  bannerTitle: { fontWeight: 700, fontSize: 14, marginBottom: 2 },
  bannerSub:   { fontSize: 13, opacity: 0.85, lineHeight: 1.5 },
  link: { color: "#4ade80", textDecoration: "underline" },
  resubmitBtn: {
    background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8,
    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    flexShrink: 0, alignSelf: "center",
  },
  resubmitError: { color: "#f87171", fontSize: 12, marginTop: 4 },
};
