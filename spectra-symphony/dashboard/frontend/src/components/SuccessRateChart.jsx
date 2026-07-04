/**
 * SuccessRateChart — simple SVG line chart of success_rate % over time.
 * Props: timeSeries = [{ date, success_rate }]
 */
export default function SuccessRateChart({ timeSeries = [] }) {
  if (!timeSeries.length) return null;

  const points = timeSeries.map((d, i) => {
    const x = (i / Math.max(timeSeries.length - 1, 1)) * 100;
    const y = 58 - (d.success_rate / 100) * 52;
    return `${x},${y}`;
  }).join(" ");

  const latest = timeSeries[timeSeries.length - 1]?.success_rate ?? 0;
  const avg = Math.round(
    timeSeries.reduce((s, d) => s + d.success_rate, 0) / timeSeries.length
  );

  const color = avg >= 90 ? "#22c55e" : avg >= 70 ? "#eab308" : "#ef4444";

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <div style={styles.title}>Success rate</div>
        <div style={{ ...styles.badge, color, borderColor: color }}>{latest}% latest</div>
      </div>
      <div style={styles.chartArea}>
        <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={styles.svg}>
          <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {timeSeries.map((d, i) => {
            const x = (i / Math.max(timeSeries.length - 1, 1)) * 100;
            const y = 58 - (d.success_rate / 100) * 52;
            return <circle key={d.date} cx={x} cy={y} r="1" fill={color} />;
          })}
        </svg>
      </div>
      <div style={styles.legendRow}>
        <span style={styles.legendItem}>
          Avg (window): <b style={{ color: "#f9fafb" }}>{avg}%</b>
        </span>
      </div>
    </div>
  );
}

const styles = {
  wrap: { background: "#1f2937", borderRadius: 10, padding: "16px 18px", border: "1px solid #374151" },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: "#9ca3af", fontSize: 12, fontWeight: 600 },
  badge: {
    fontSize: 11, fontWeight: 700, border: "1px solid", borderRadius: 999,
    padding: "2px 8px",
  },
  chartArea: { width: "100%", height: 120 },
  svg: { width: "100%", height: "100%" },
  legendRow: { marginTop: 10, display: "flex", gap: 16 },
  legendItem: { color: "#9ca3af", fontSize: 12 },
};
