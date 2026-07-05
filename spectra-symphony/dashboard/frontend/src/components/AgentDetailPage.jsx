import { useState, useEffect, useCallback } from "react";
import ReviewsSection from "./ReviewsSection";
import RunAgentModal from "./RunAgentModal";

export default function AgentDetailPage({ agentListingId, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRunModal, setShowRunModal] = useState(false);

  const fetchDetail = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/functions/getAgentDetail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_listing_id: agentListingId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Failed to load agent");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [agentListingId]);

  useEffect(() => {
    setLoading(true);
    fetchDetail();
  }, [fetchDetail]);

  if (loading) {
    return <div style={styles.loading}>Loading agent...</div>;
  }

  if (error) {
    return (
      <div style={styles.errorWrap}>
        <button style={styles.backBtn} onClick={onBack}>← Back</button>
        <div style={styles.errorBox}>⚠️ {error}</div>
      </div>
    );
  }

  const { listing, versions, reviews, review_count, average_rating, space_logs, is_author } = data;
  const latestVersion = versions.find((v) => v.is_latest) || versions[0];
  const canRun = latestVersion && (latestVersion.moderation_status === "approved" || latestVersion.moderation_status === "auto_approved");

  return (
    <div style={styles.wrap}>
      <button style={styles.backBtn} onClick={onBack}>← Back to marketplace</button>

      <div style={styles.headerCard}>
        <div style={styles.headerTop}>
          <div>
            <h2 style={styles.title}>{listing.name}</h2>
            <span style={styles.category}>{listing.category}</span>
          </div>
          {canRun && (
            <button style={styles.runBtn} onClick={() => setShowRunModal(true)}>▶ Run agent</button>
          )}
        </div>
        <p style={styles.description}>{listing.description}</p>
        <div style={styles.statsRow}>
          <span style={styles.stat}>⭐ {listing.average_rating || 0} ({review_count || 0})</span>
          <span style={styles.stat}>{listing.run_count || 0} runs</span>
          {is_author && <span style={styles.authorBadge}>You are the author</span>}
        </div>
        {listing.capabilities?.length > 0 && (
          <div style={styles.capsRow}>
            {listing.capabilities.map((c) => (
              <span key={c} style={styles.capChip}>{c}</span>
            ))}
          </div>
        )}
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionHeading}>Version history</h3>
        {versions.length === 0 ? (
          <div style={styles.emptyBox}>No versions available.</div>
        ) : (
          <div style={styles.versionList}>
            {versions.map((v) => (
              <div key={v.id} style={styles.versionRow}>
                <div style={styles.versionRowTop}>
                  <span style={styles.versionTag}>v{v.version}{v.is_latest ? " · latest" : ""}</span>
                  <span style={{ ...styles.modBadge, ...modColor(v.moderation_status) }}>{v.moderation_status}</span>
                </div>
                <p style={styles.changelog}>{v.changelog}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {is_author && (
        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Space logs (author only)</h3>
          {space_logs.length === 0 ? (
            <div style={styles.emptyBox}>No logs fetched yet.</div>
          ) : (
            <div style={styles.logList}>
              {space_logs.map((log) => (
                <div key={log.id} style={styles.logCard}>
                  <div style={styles.logMeta}>{log.space_id} · {new Date(log.fetched_at).toLocaleString()}</div>
                  <pre style={styles.logLines}>{(log.log_lines || []).join("\n")}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ReviewsSection
        agentListingId={listing.id}
        reviews={reviews}
        reviewCount={review_count}
        averageRating={listing.average_rating}
        isAuthor={is_author}
        onReviewSubmitted={fetchDetail}
      />

      {showRunModal && latestVersion && (
        <RunAgentModal
          agentListingVersionId={latestVersion.id}
          configSchema={latestVersion.config_schema}
          agentName={listing.name}
          onClose={() => setShowRunModal(false)}
        />
      )}
    </div>
  );
}

function modColor(status) {
  if (status === "approved" || status === "auto_approved") return { background: "#064e3b", color: "#6ee7b7" };
  if (status === "rejected") return { background: "#7f1d1d", color: "#fca5a5" };
  return { background: "#374151", color: "#d1d5db" };
}

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 18 },
  loading: { color: "#6b7280", padding: 40, textAlign: "center" },
  errorWrap: { display: "flex", flexDirection: "column", gap: 14 },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "12px 16px", color: "#fca5a5", fontSize: 13,
  },
  backBtn: {
    alignSelf: "flex-start", background: "none", border: "none", color: "#a78bfa",
    fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
  },
  headerCard: { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 18 },
  headerTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { color: "#f9fafb", fontSize: 20, fontWeight: 700, margin: "0 0 6px" },
  category: {
    color: "#a78bfa", fontSize: 11, background: "#2e1065", borderRadius: 999,
    padding: "2px 8px", textTransform: "capitalize",
  },
  runBtn: {
    background: "#7c3aed", border: "none", borderRadius: 8, padding: "9px 16px",
    color: "#f9fafb", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  description: { color: "#9ca3af", fontSize: 13, lineHeight: 1.6, margin: "10px 0" },
  statsRow: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  stat: { color: "#6b7280", fontSize: 12.5 },
  authorBadge: {
    color: "#93c5fd", fontSize: 11, background: "#1e3a8a", borderRadius: 999, padding: "2px 8px",
  },
  capsRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 },
  capChip: {
    color: "#d1d5db", fontSize: 11, background: "#1f2937", border: "1px solid #374151",
    borderRadius: 999, padding: "3px 9px",
  },
  section: { display: "flex", flexDirection: "column", gap: 10 },
  sectionHeading: { color: "#f9fafb", fontSize: 15, fontWeight: 700, margin: 0 },
  emptyBox: {
    color: "#6b7280", fontSize: 13, textAlign: "center", padding: 20,
    background: "#1f2937", borderRadius: 10, border: "1px solid #374151",
  },
  versionList: { display: "flex", flexDirection: "column", gap: 8 },
  versionRow: { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 12 },
  versionRowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  versionTag: { color: "#f9fafb", fontSize: 13, fontWeight: 600 },
  modBadge: { fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "2px 9px", textTransform: "capitalize" },
  changelog: { color: "#9ca3af", fontSize: 12.5, margin: 0, lineHeight: 1.5 },
  logList: { display: "flex", flexDirection: "column", gap: 8 },
  logCard: { background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 10, padding: 12 },
  logMeta: { color: "#6b7280", fontSize: 11, marginBottom: 6 },
  logLines: { color: "#a7f3d0", fontSize: 11.5, margin: 0, whiteSpace: "pre-wrap", overflowX: "auto" },
};
