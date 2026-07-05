import { useState } from "react";

export default function ReviewsSection({ agentListingId, reviews, reviewCount, averageRating, onReviewSubmitted, isAuthor }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const submit = async () => {
    if (rating < 1 || rating > 5) {
      setError("Please select a star rating.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/functions/submitAgentReview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_listing_id: agentListingId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to submit review");
      setSuccess(true);
      setComment("");
      setRating(0);
      if (onReviewSubmitted) onReviewSubmitted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <h3 style={styles.heading}>Reviews</h3>
        <span style={styles.summary}>
          ⭐ {averageRating || 0} · {reviewCount || 0} review{reviewCount === 1 ? "" : "s"}
        </span>
      </div>

      {isAuthor ? (
        <div style={styles.selfNote}>You can't review your own agent.</div>
      ) : (
        <div style={styles.formBox}>
          <div style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  ...styles.star,
                  color: n <= (hoverRating || rating) ? "#facc15" : "#374151",
                }}
              >
                ★
              </span>
            ))}
          </div>
          <textarea
            style={styles.textarea}
            placeholder="Share your experience with this agent (optional)"
            value={comment}
            maxLength={2000}
            onChange={(e) => setComment(e.target.value)}
          />
          {error && <div style={styles.errorBox}>⚠️ {error}</div>}
          {success && <div style={styles.successBox}>Review submitted, thanks!</div>}
          <button style={styles.submitBtn} onClick={submit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit review"}
          </button>
        </div>
      )}

      <div style={styles.list}>
        {(!reviews || reviews.length === 0) ? (
          <div style={styles.emptyBox}>No reviews yet — be the first to try this agent.</div>
        ) : (
          reviews.map((r) => (
            <div key={r.id} style={styles.reviewCard}>
              <div style={styles.reviewHeader}>
                <span style={styles.reviewStars}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                <span style={styles.reviewAuthor}>{r.created_by}</span>
              </div>
              {r.comment && <p style={styles.reviewComment}>{r.comment}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: { marginTop: 20 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  heading: { color: "#f9fafb", fontSize: 16, fontWeight: 700, margin: 0 },
  summary: { color: "#9ca3af", fontSize: 13 },
  selfNote: {
    color: "#6b7280", fontSize: 12, fontStyle: "italic", marginBottom: 14,
    background: "#1f2937", borderRadius: 8, padding: "10px 12px",
  },
  formBox: {
    background: "#111827", border: "1px solid #1f2937", borderRadius: 10,
    padding: 14, marginBottom: 16,
  },
  starsRow: { display: "flex", gap: 4, marginBottom: 10, cursor: "pointer" },
  star: { fontSize: 24, userSelect: "none" },
  textarea: {
    width: "100%", minHeight: 64, background: "#1f2937", border: "1px solid #374151",
    borderRadius: 8, padding: "9px 12px", color: "#f9fafb", fontSize: 13, outline: "none",
    resize: "vertical", boxSizing: "border-box",
  },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginTop: 10,
  },
  successBox: {
    background: "#064e3b", border: "1px solid #10b981", borderRadius: 8,
    padding: "8px 12px", color: "#6ee7b7", fontSize: 12, marginTop: 10,
  },
  submitBtn: {
    marginTop: 10, background: "#7c3aed", border: "none", borderRadius: 8,
    padding: "9px 16px", color: "#f9fafb", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  emptyBox: {
    color: "#6b7280", fontSize: 13, textAlign: "center", padding: 24,
    background: "#1f2937", borderRadius: 10, border: "1px solid #374151",
  },
  reviewCard: { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: 12 },
  reviewHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  reviewStars: { color: "#facc15", fontSize: 13 },
  reviewAuthor: { color: "#6b7280", fontSize: 11 },
  reviewComment: { color: "#d1d5db", fontSize: 12.5, lineHeight: 1.5, margin: 0 },
};
