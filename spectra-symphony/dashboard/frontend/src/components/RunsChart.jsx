/**
 * RunsChart — simple SVG bar chart of run_count per day.
 * Props: timeSeries = [{ date, run_count, success_count, success_rate }]
 */
export default function RunsChart({ timeSeries = [] }) {
  if (!timeSeries.length) return null;

  const max = Math.max(...timeSeries.map((d) => d.run_count), 1);
  const barW = 100 / timeSeries.length;

  return (
    <div style={styles.wrap}>
      <div style={styles.title}>Runs per day</div>
      <div style={styles.chartArea}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={styles.svg}>
          {timeSeries.map((d, i) => {
            const h = (d.run_count / max) * 52;
            return (
              <rect
                key={d.date}
                x={i * barW + barW * 0.15}
                y={58 - h}
                width={barW * 0.7}
                height={h}
                rx={0.6}
                fill="#7c3aed"
              />
            );
          })}
        </svg>
      </div>
      <div style={styles.labels}>
        {timeSeries.map((d, i) => (
          i % Math.ceil(timeSeries.length / 7) === 0 ? (
            <span key={d.date} style={styles.label}>
              {d.date.slice(5)}
            </span>
          ) : null
        ))}
      </div>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}>
          Total runs: <b style={{ color: "#f9fafb" }}>{timeSeries.reduce((s, d) => s + d.run_count, 0)}</b>
        </span>
      </div>
    </div>
  );
}

const styles = {
  wrap: { background: "#1f2937", borderRadius: 10, padding: "16px 18px", border: "1px solid #374151" },
  title: { color: "#9ca3af", fontSize: 12, fontWeight: 600, marginBottom: 10 },
  chartArea: { width: "100%", height: 120 },
  svg: { width: "100%", height: "100%" },
  labels: { display: "flex", justifyContent: "space-between", marginTop: 4 },
  label: { color: "#6b7280", fontSize: 10 },
  legendRow: { marginTop: 10, display: "flex", gap: 16 },
  legendItem: { color: "#9ca3af", fontSize: 12 },
};
