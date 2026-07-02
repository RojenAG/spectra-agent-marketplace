import { useState, useEffect } from "react";
import RunsChart from "./RunsChart";
import SuccessRateChart from "./SuccessRateChart";
import { AnalyticsEmpty } from "./EmptyStates";

export default function AnalyticsPanel({ agent, onBack }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!agent) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/functions/getAuthorAnalytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_listing_id: agent.id, days: 30 }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setStats(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agent]);

  if (!agent) {
    return (
      <div>
        <h2 style={styles.heading}>Analytics</h2>
        <AnalyticsEmpty />
      </div>
    );
  }

  return (
    <div>
      <div style={styles.headerRow}>
        <button style={styles.backBtn} onClick={onBack}>← Back to My Agents</button>
      </div>
      <h2 style={styles.heading}>{agent.name} — Analytics</h2>
      <p style={styles.sub}>Last 30 days</p>

      {loading && <div style={styles.loading}>Loading analytics...</div>}
      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      {!loading && !error && stats && (
        stats.time_series.length === 0 ? (
          <AnalyticsEmpty />
        ) : (
          <>
            <div style={styles.totalsRow}>
              <TotalCard label="Total runs" value={stats.totals.run_count} />
              <TotalCard label="Successful" value={stats.totals.success_count} />
              <TotalCard label="Success rate" value={`${stats.totals.success_rate}%`} />
            </div>
            <div style={styles.chartsGrid}>
              <RunsChart timeSeries={stats.time_series} />
              <SuccessRateChart timeSeries={stats.time_series} />
            </div>
          </>
        )
      )}
    </div>
  );
}

function TotalCard({ label, value }) {
  return (
    <div style={styles.totalCard}>
      <div style={styles.totalValue}>{value}</div>
      <div style={styles.totalLabel}>{label}</div>
    </div>
  );
}

const styles = {
  headerRow: { marginBottom: 8 },
  backBtn: {
    background: "none", border: "none", color: "#a78bfa", fontSize: 13,
    cursor: "pointer", padding: 0, fontWeight: 600,
  },
  heading: { color: "#f9fafb", fontSize: 18, fontWeight: 700, margin: "4px 0 2px" },
  sub: { color: "#6b7280", fontSize: 12, margin: "0 0 16px" },
  loading: { color: "#6b7280", padding: 24, textAlign: "center" },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "12px 16px", color: "#fca5a5", fontSize: 13,
  },
  totalsRow: { display: "flex", gap: 12, marginBottom: 16 },
  totalCard: {
    flex: 1, background: "#1f2937", border: "1px solid #374151", borderRadius: 10,
    padding: "14px 16px", textAlign: "center",
  },
  totalValue: { color: "#f9fafb", fontSize: 22, fontWeight: 800 },
  totalLabel: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  chartsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
};
