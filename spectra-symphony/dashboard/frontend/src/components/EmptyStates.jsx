/**
 * EmptyStates — three empty state components for the author dashboard
 *
 * 1. MyAgentsEmpty       — /my-agents with no published agents
 * 2. AnalyticsEmpty      — analytics panel with no data yet
 * 3. SpaceLogsEmpty      — space logs panel with no Space URL set
 */

// -------------------------------------------------
// 1. My Agents Empty State
// -------------------------------------------------
export function MyAgentsEmpty({ onPublish }) {
  return (
    <div style={styles.container}>
      <div style={styles.iconRing}>🤖</div>
      <h2 style={styles.heading}>Publish your first agent</h2>
      <p style={styles.sub}>
        Share your agent with the Spectra community. It takes less than 2 minutes — just point us
        to your HuggingFace Space and we handle the rest.
      </p>
      <div style={styles.featureList}>
        <FeatureItem icon="🔍" text="Discoverable in the public marketplace" />
        <FeatureItem icon="📊" text="Real-time analytics on every run" />
        <FeatureItem icon="⭐" text="Community reviews and ratings" />
      </div>
      <button style={styles.ctaBtn} onClick={onPublish}>
        + Publish an Agent
      </button>
    </div>
  );
}

// -------------------------------------------------
// 2. Analytics Empty State
// -------------------------------------------------
const DUMMY_DATA = [
  { day: "Mon", runs: 0 }, { day: "Tue", runs: 0 }, { day: "Wed", runs: 0 },
  { day: "Thu", runs: 0 }, { day: "Fri", runs: 0 }, { day: "Sat", runs: 0 },
  { day: "Sun", runs: 0 },
];
const MAX = 20;

export function AnalyticsEmpty() {
  return (
    <div style={styles.container}>
      {/* Placeholder chart */}
      <div style={styles.chartWrap}>
        <div style={styles.chartTitle}>Runs this week</div>
        <div style={styles.chartBars}>
          {DUMMY_DATA.map((d) => (
            <div key={d.day} style={styles.barCol}>
              <div style={{ ...styles.bar, height: `${(d.runs / MAX) * 80 + 4}px`, opacity: 0.2 }} />
              <span style={styles.barLabel}>{d.day}</span>
            </div>
          ))}
        </div>
        <div style={styles.chartOverlay}>
          <span style={styles.overlayIcon}>📊</span>
          <span style={styles.overlayText}>No runs yet</span>
        </div>
      </div>
      <p style={styles.sub}>
        Analytics will appear here once your agent has been approved and starts receiving runs.
        Publish your first agent to get started.
      </p>
    </div>
  );
}

// -------------------------------------------------
// 3. Space Logs Empty State
// -------------------------------------------------
export function SpaceLogsEmpty({ onAddSpaceUrl }) {
  return (
    <div style={styles.container}>
      <div style={styles.iconRing}>🪵</div>
      <h2 style={styles.heading}>No Space URL configured</h2>
      <p style={styles.sub}>
        To see live logs from your HuggingFace Space, add the Space URL to your agent version
        settings. Logs are fetched automatically every 10 minutes.
      </p>
      <button style={styles.secondaryBtn} onClick={onAddSpaceUrl}>
        Add Space URL →
      </button>
    </div>
  );
}

// -------------------------------------------------
// Helpers
// -------------------------------------------------
function FeatureItem({ icon, text }) {
  return (
    <div style={styles.featureItem}>
      <span style={styles.featureIcon}>{icon}</span>
      <span style={styles.featureText}>{text}</span>
    </div>
  );
}

// -------------------------------------------------
// Styles
// -------------------------------------------------
const styles = {
  container: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "40px 24px", textAlign: "center", maxWidth: 460, margin: "0 auto",
  },
  iconRing: {
    fontSize: 48, background: "#1f2937", borderRadius: "50%",
    width: 80, height: 80, display: "flex", alignItems: "center",
    justifyContent: "center", marginBottom: 20,
  },
  heading: { color: "#f9fafb", fontSize: 20, fontWeight: 700, margin: "0 0 10px" },
  sub: { color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" },
  featureList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, width: "100%" },
  featureItem: {
    display: "flex", alignItems: "center", gap: 10,
    background: "#1f2937", borderRadius: 8, padding: "10px 14px",
  },
  featureIcon: { fontSize: 18 },
  featureText: { color: "#d1d5db", fontSize: 13 },
  ctaBtn: {
    background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8,
    padding: "12px 28px", fontSize: 15, fontWeight: 700, cursor: "pointer",
  },
  secondaryBtn: {
    background: "#1f2937", color: "#a78bfa", border: "1px solid #374151",
    borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  chartWrap: {
    width: "100%", background: "#1f2937", borderRadius: 10,
    padding: "16px 20px 8px", marginBottom: 20, position: "relative",
    border: "1px solid #374151",
  },
  chartTitle: { color: "#9ca3af", fontSize: 12, fontWeight: 600, marginBottom: 12, textAlign: "left" },
  chartBars: { display: "flex", alignItems: "flex-end", gap: 8, height: 80 },
  barCol: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, gap: 4 },
  bar: { width: "100%", background: "#7c3aed", borderRadius: "4px 4px 0 0", minHeight: 4 },
  barLabel: { color: "#6b7280", fontSize: 10 },
  chartOverlay: {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  overlayIcon: { fontSize: 28 },
  overlayText: { color: "#6b7280", fontSize: 13 },
};
