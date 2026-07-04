import { useState, useEffect } from "react";
import PublishWizard from "./PublishWizard";
import ModerationStatusBanner from "./ModerationStatusBanner";
import { MyAgentsEmpty } from "./EmptyStates";

export default function MyAgentsPanel({ onSelectAgentForAnalytics }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/functions/listMyAgents", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgents(data.agents || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handlePublishSuccess = () => {
    setWizardOpen(false);
    load();
  };

  const handleResubmit = async (listingId) => {
    // Resubmit = author edits + republishes a new version via the same endpoint.
    // For now this opens the wizard again pre-scoped to this listing's context.
    setWizardOpen(true);
  };

  if (loading) {
    return <div style={styles.loading}>Loading your agents...</div>;
  }

  if (error) {
    return <div style={styles.errorBox}>⚠️ {error}</div>;
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <h2 style={styles.heading}>My Agents</h2>
        {agents.length > 0 && (
          <button style={styles.publishBtn} onClick={() => setWizardOpen(true)}>
            + Publish an Agent
          </button>
        )}
      </div>

      {agents.length === 0 ? (
        <MyAgentsEmpty onPublish={() => setWizardOpen(true)} />
      ) : (
        <div style={styles.grid}>
          {agents.map((agent) => (
            <div key={agent.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.cardTitle}>{agent.name}</span>
                <span style={styles.cardCategory}>{agent.category}</span>
              </div>
              <p style={styles.cardDesc}>{agent.description}</p>

              {agent.latest_version && (
                <ModerationStatusBanner
                  version={agent.latest_version}
                  listingId={agent.id}
                  onResubmit={handleResubmit}
                />
              )}

              <div style={styles.cardFooter}>
                <span style={styles.statText}>
                  {agent.run_count || 0} runs · ⭐ {agent.average_rating || 0}
                </span>
                <button
                  style={styles.analyticsLink}
                  onClick={() => onSelectAgentForAnalytics && onSelectAgentForAnalytics(agent)}
                >
                  View Analytics →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {wizardOpen && (
        <PublishWizard
          onClose={() => setWizardOpen(false)}
          onSuccess={handlePublishSuccess}
        />
      )}
    </div>
  );
}

const styles = {
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  heading: { color: "#f9fafb", fontSize: 18, fontWeight: 700, margin: 0 },
  publishBtn: {
    background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8,
    padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  loading: { color: "#6b7280", padding: 24, textAlign: "center" },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "12px 16px", color: "#fca5a5", fontSize: 13,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 },
  card: {
    background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 16,
  },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { color: "#f9fafb", fontWeight: 700, fontSize: 14 },
  cardCategory: {
    color: "#a78bfa", fontSize: 11, background: "#2e1065", borderRadius: 999,
    padding: "2px 8px", textTransform: "capitalize",
  },
  cardDesc: { color: "#9ca3af", fontSize: 12, lineHeight: 1.5, margin: "0 0 12px" },
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  statText: { color: "#6b7280", fontSize: 12 },
  analyticsLink: {
    background: "none", border: "none", color: "#a78bfa", fontSize: 12,
    fontWeight: 600, cursor: "pointer", padding: 0,
  },
};
