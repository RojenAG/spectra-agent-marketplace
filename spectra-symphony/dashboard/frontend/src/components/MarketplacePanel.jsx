import { useState, useEffect, useRef } from "react";

const CATEGORIES = ["", "architect", "backend", "frontend", "qa", "security", "data", "devops", "custom"];
const DEBOUNCE_MS = 350;

export default function MarketplacePanel({ onSelectAgent }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/functions/searchAgents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, category, sort, page: 1, limit: 12 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.records || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Debounced free-text search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(search, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, sort]);

  return (
    <div>
      <h2 style={styles.heading}>Marketplace</h2>

      <div style={styles.controls}>
        <input
          style={styles.searchInput}
          placeholder="Search agents by name, description, capability..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={styles.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c ? c.charAt(0).toUpperCase() + c.slice(1) : "All categories"}</option>
          ))}
        </select>
        <select style={styles.select} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="rating">Top rated</option>
          <option value="popular">Most popular</option>
        </select>
      </div>

      {loading && <div style={styles.loading}>Searching...</div>}
      {error && <div style={styles.errorBox}>⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div style={styles.resultCount}>{total} agent{total !== 1 ? "s" : ""} found</div>
          {results.length === 0 ? (
            <div style={styles.emptyBox}>
              No agents match your search. Try a different category or keyword.
            </div>
          ) : (
            <div style={styles.grid}>
              {results.map((r) => (
                <div
                  key={r.id}
                  style={styles.card}
                  onClick={() => onSelectAgent && onSelectAgent(r.id)}
                  role={onSelectAgent ? "button" : undefined}
                  tabIndex={onSelectAgent ? 0 : undefined}
                >
                  <div style={styles.cardHeader}>
                    <span style={styles.cardTitle}>{r.name}</span>
                    <span style={styles.cardCategory}>{r.category}</span>
                  </div>
                  <p style={styles.cardDesc}>{r.description}</p>
                  <div style={styles.cardFooter}>
                    <span style={styles.statText}>{r.run_count || 0} runs</span>
                    <span style={styles.statText}>⭐ {r.average_rating || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  heading: { color: "#f9fafb", fontSize: 18, fontWeight: 700, margin: "0 0 16px" },
  controls: { display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  searchInput: {
    flex: 2, minWidth: 220, background: "#1f2937", border: "1px solid #374151",
    borderRadius: 8, padding: "9px 12px", color: "#f9fafb", fontSize: 13, outline: "none",
  },
  select: {
    background: "#1f2937", border: "1px solid #374151", borderRadius: 8,
    padding: "9px 12px", color: "#f9fafb", fontSize: 13, outline: "none",
  },
  loading: { color: "#6b7280", padding: 24, textAlign: "center" },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "12px 16px", color: "#fca5a5", fontSize: 13,
  },
  resultCount: { color: "#6b7280", fontSize: 12, marginBottom: 10 },
  emptyBox: {
    color: "#6b7280", fontSize: 13, textAlign: "center", padding: 32,
    background: "#1f2937", borderRadius: 10, border: "1px solid #374151",
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 },
  card: { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 16, cursor: "pointer" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  cardTitle: { color: "#f9fafb", fontWeight: 700, fontSize: 14 },
  cardCategory: {
    color: "#a78bfa", fontSize: 11, background: "#2e1065", borderRadius: 999,
    padding: "2px 8px", textTransform: "capitalize",
  },
  cardDesc: { color: "#9ca3af", fontSize: 12, lineHeight: 1.5, margin: "0 0 12px" },
  cardFooter: { display: "flex", gap: 12 },
  statText: { color: "#6b7280", fontSize: 12 },
};
