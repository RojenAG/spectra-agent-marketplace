import { useState, useEffect, useRef } from "react";

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 35000;

export default function RunAgentModal({ agentListingVersionId, configSchema, agentName, onClose }) {
  const [formValues, setFormValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null); // { run_id, status, existing, output?, error? }
  const pollRef = useRef(null);
  const pollStartRef = useRef(null);

  const properties = configSchema?.properties || {};
  const required = configSchema?.required || [];

  const setField = (key, value) => setFormValues((prev) => ({ ...prev, [key]: value }));

  // deployAgentRun runs synchronously (it awaits the HF Space call, up to a 30s hard timeout)
  // and returns the final status directly in most cases. Its idempotency guard — reusing an
  // in-flight run for the same version+user — is what lets us "poll": resending the same
  // payload while a run is still pending/running just returns the current state of that
  // same run instead of starting a duplicate one.
  const callDeploy = async () => {
    const res = await fetch("/functions/deployAgentRun", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_listing_version_id: agentListingVersionId, input: formValues }),
    });
    const data = await res.json();
    if (!res.ok && !data.run_id) throw new Error(data.error || "Failed to start run");
    return data;
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await callDeploy();
      setRun(data);
      pollStartRef.current = Date.now();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Poll while the run is still pending/running
  useEffect(() => {
    if (!run || !["pending", "running", "queued"].includes(run.status)) return;

    const poll = async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setError("Run is taking longer than expected. Check back later.");
        clearInterval(pollRef.current);
        return;
      }
      try {
        const data = await callDeploy();
        setRun(data);
      } catch (_) {
        // transient network error — keep polling
      }
    };

    pollRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status]);

  const renderField = (key, schema) => {
    const type = schema.type || "string";
    const isRequired = required.includes(key);
    if (type === "boolean") {
      return (
        <label key={key} style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={!!formValues[key]}
            onChange={(e) => setField(key, e.target.checked)}
          />
          <span>{schema.title || key}</span>
        </label>
      );
    }
    if (schema.enum) {
      return (
        <div key={key} style={styles.fieldRow}>
          <label style={styles.label}>{schema.title || key}{isRequired ? " *" : ""}</label>
          <select
            style={styles.input}
            value={formValues[key] || ""}
            onChange={(e) => setField(key, e.target.value)}
          >
            <option value="">Select...</option>
            {schema.enum.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }
    return (
      <div key={key} style={styles.fieldRow}>
        <label style={styles.label}>{schema.title || key}{isRequired ? " *" : ""}</label>
        <input
          style={styles.input}
          type={type === "number" ? "number" : "text"}
          value={formValues[key] ?? ""}
          onChange={(e) => setField(key, type === "number" ? Number(e.target.value) : e.target.value)}
        />
      </div>
    );
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.heading}>Run {agentName}</h3>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {!run && (
          <>
            {Object.keys(properties).length === 0 ? (
              <p style={styles.noInputs}>This agent takes no input — just hit run.</p>
            ) : (
              <div style={styles.form}>
                {Object.entries(properties).map(([key, schema]) => renderField(key, schema))}
              </div>
            )}
            {error && <div style={styles.errorBox}>⚠️ {error}</div>}
            <button style={styles.runBtn} onClick={submit} disabled={submitting}>
              {submitting ? "Starting..." : "Run agent"}
            </button>
          </>
        )}

        {run && (
          <div style={styles.statusBox}>
            {run.existing && (
              <div style={styles.infoNote}>A run was already in progress — showing its live status.</div>
            )}
            <div style={styles.statusRow}>
              <span style={styles.statusLabel}>Status:</span>
              <span style={{ ...styles.statusBadge, ...statusColor(run.status) }}>{run.status}</span>
            </div>
            {["pending", "running", "queued"].includes(run.status) && (
              <div style={styles.spinner}>Polling for updates every {POLL_MS / 1000}s...</div>
            )}
            {run.status === "completed" && run.output && (
              <pre style={styles.output}>{JSON.stringify(run.output, null, 2)}</pre>
            )}
            {run.status === "failed" && (
              <div style={styles.errorBox}>⚠️ {run.error || "Run failed"}</div>
            )}
            {error && <div style={styles.errorBox}>⚠️ {error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function statusColor(status) {
  if (status === "completed") return { background: "#064e3b", color: "#6ee7b7" };
  if (status === "failed") return { background: "#7f1d1d", color: "#fca5a5" };
  return { background: "#1e3a8a", color: "#93c5fd" };
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
  },
  modal: {
    background: "#111827", border: "1px solid #1f2937", borderRadius: 12,
    padding: 20, width: 420, maxWidth: "90vw", maxHeight: "85vh", overflowY: "auto",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  heading: { color: "#f9fafb", fontSize: 16, fontWeight: 700, margin: 0 },
  closeBtn: { background: "none", border: "none", color: "#6b7280", fontSize: 16, cursor: "pointer" },
  noInputs: { color: "#9ca3af", fontSize: 13 },
  form: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 },
  fieldRow: { display: "flex", flexDirection: "column", gap: 5 },
  label: { color: "#9ca3af", fontSize: 12, fontWeight: 600 },
  input: {
    background: "#1f2937", border: "1px solid #374151", borderRadius: 8,
    padding: "8px 10px", color: "#f9fafb", fontSize: 13, outline: "none",
  },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, color: "#d1d5db", fontSize: 13 },
  runBtn: {
    background: "#7c3aed", border: "none", borderRadius: 8, padding: "10px 16px",
    color: "#f9fafb", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%",
  },
  errorBox: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "8px 12px", color: "#fca5a5", fontSize: 12, marginTop: 10,
  },
  infoNote: {
    background: "#1f2937", borderRadius: 8, padding: "8px 12px",
    color: "#9ca3af", fontSize: 12, marginBottom: 10,
  },
  statusBox: { display: "flex", flexDirection: "column", gap: 10 },
  statusRow: { display: "flex", alignItems: "center", gap: 8 },
  statusLabel: { color: "#9ca3af", fontSize: 13 },
  statusBadge: { fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "3px 10px", textTransform: "capitalize" },
  spinner: { color: "#6b7280", fontSize: 12 },
  output: {
    background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8,
    padding: 12, color: "#a7f3d0", fontSize: 11.5, overflowX: "auto", margin: 0,
  },
};
