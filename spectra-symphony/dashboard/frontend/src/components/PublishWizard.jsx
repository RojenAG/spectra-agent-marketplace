import { useState } from "react";

const CATEGORIES = [
  "architect", "backend", "frontend", "qa", "security", "data", "devops", "custom"
];

const STEPS = ["Details", "Space & Capabilities", "Review & Submit"];

const emptyForm = {
  name: "",
  description: "",
  category: "",
  space_url: "",
  capabilities: "",
  config_schema: "",
  changelog: "",
};

export default function PublishWizard({ onClose, onSuccess }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validateStep = () => {
    const e = {};
    if (step === 0) {
      if (!form.name.trim()) e.name = "Required";
      if (!form.description.trim()) e.description = "Required";
      if (!form.category) e.category = "Required";
    }
    if (step === 1) {
      const HF = /^https:\/\/huggingface\.co\/spaces\/[a-zA-Z0-9_.\-]+\/[a-zA-Z0-9_.\-]+$/;
      if (!form.space_url.trim()) e.space_url = "Required";
      else if (!HF.test(form.space_url.trim()))
        e.space_url = "Must match https://huggingface.co/spaces/<user>/<space>";
      if (!form.capabilities.trim()) e.capabilities = "Required — comma separated";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep()) setStep((s) => s + 1); };
  const back = () => setStep((s) => s - 1);

  const submit = async () => {
    setSubmitting(true);
    setServerError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        space_url: form.space_url.trim(),
        capabilities: form.capabilities.split(",").map((c) => c.trim()).filter(Boolean),
        changelog: form.changelog.trim() || "Initial release",
      };
      if (form.config_schema.trim()) {
        try { payload.config_schema = JSON.parse(form.config_schema); }
        catch { setErrors({ config_schema: "Invalid JSON" }); setSubmitting(false); return; }
      }
      const res = await fetch("/functions/publishAgent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess && onSuccess(data);
      } else {
        setServerError(data.errors?.join(", ") || data.error || "Submission failed");
      }
    } catch (err) {
      setServerError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span style={styles.title}>Publish an Agent</span>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.stepBar}>
          {STEPS.map((label, i) => (
            <div key={i} style={styles.stepItem}>
              <div style={{ ...styles.stepDot, background: i <= step ? "#7c3aed" : "#374151" }}>
                {i < step ? "✓" : i + 1}
              </div>
              <span style={{ ...styles.stepLabel, color: i <= step ? "#7c3aed" : "#6b7280" }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div style={styles.body}>
            <Field label="Agent Name" error={errors.name}>
              <input style={styles.input} value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Code Review Bot" />
            </Field>
            <Field label="Description" error={errors.description}>
              <textarea style={{ ...styles.input, height: 80, resize: "vertical" }}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="What does this agent do?" />
            </Field>
            <Field label="Category" error={errors.category}>
              <select style={styles.input} value={form.category}
                onChange={(e) => set("category", e.target.value)}>
                <option value="">Select category...</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div style={styles.body}>
            <Field label="HuggingFace Space URL" error={errors.space_url}>
              <input style={styles.input} value={form.space_url}
                onChange={(e) => set("space_url", e.target.value)}
                placeholder="https://huggingface.co/spaces/you/your-space" />
            </Field>
            <Field label="Capabilities (comma separated)" error={errors.capabilities}>
              <input style={styles.input} value={form.capabilities}
                onChange={(e) => set("capabilities", e.target.value)}
                placeholder="e.g. code review, bug detection, refactoring" />
            </Field>
            <Field label="Config Schema JSON (optional)" error={errors.config_schema}>
              <textarea style={{ ...styles.input, height: 80, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
                value={form.config_schema}
                onChange={(e) => set("config_schema", e.target.value)}
                placeholder='{"model": "gpt-4", "temperature": 0.7}' />
            </Field>
            <Field label="Changelog (optional)">
              <input style={styles.input} value={form.changelog}
                onChange={(e) => set("changelog", e.target.value)}
                placeholder="Initial release" />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div style={styles.body}>
            <div style={styles.reviewCard}>
              <ReviewRow label="Name" value={form.name} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Description" value={form.description} />
              <ReviewRow label="Space URL" value={form.space_url} />
              <ReviewRow label="Capabilities" value={form.capabilities} />
              {form.changelog && <ReviewRow label="Changelog" value={form.changelog} />}
            </div>
            <p style={styles.reviewNote}>
              After submission, your agent will be reviewed automatically.
              Most agents are approved within minutes.
            </p>
            {serverError && <div style={styles.errorBanner}>{serverError}</div>}
          </div>
        )}

        <div style={styles.footer}>
          {step > 0 && (
            <button style={styles.secondaryBtn} onClick={back} disabled={submitting}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < 2 ? (
            <button style={styles.primaryBtn} onClick={next}>Next →</button>
          ) : (
            <button style={{ ...styles.primaryBtn, opacity: submitting ? 0.6 : 1 }}
              onClick={submit} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit for Review"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={styles.label}>{label}</label>
      {children}
      {error && <div style={styles.fieldError}>{error}</div>}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={styles.reviewRow}>
      <span style={styles.reviewLabel}>{label}</span>
      <span style={styles.reviewValue}>{value}</span>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  modal: {
    background: "#111827", borderRadius: 12, width: 520, maxWidth: "95vw",
    maxHeight: "90vh", display: "flex", flexDirection: "column",
    border: "1px solid #1f2937", boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 24px 16px", borderBottom: "1px solid #1f2937",
  },
  title: { color: "#f9fafb", fontWeight: 700, fontSize: 18 },
  closeBtn: {
    background: "none", border: "none", color: "#6b7280",
    cursor: "pointer", fontSize: 18, padding: 4,
  },
  stepBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 24px", borderBottom: "1px solid #1f2937",
  },
  stepItem: { display: "flex", alignItems: "center", gap: 8 },
  stepDot: {
    width: 28, height: 28, borderRadius: "50%", display: "flex",
    alignItems: "center", justifyContent: "center",
    color: "#fff", fontSize: 12, fontWeight: 700,
  },
  stepLabel: { fontSize: 13, fontWeight: 500 },
  body: { padding: "20px 24px", overflowY: "auto", flex: 1 },
  label: { display: "block", color: "#9ca3af", fontSize: 12, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 },
  input: {
    width: "100%", background: "#1f2937", border: "1px solid #374151",
    borderRadius: 8, padding: "10px 12px", color: "#f9fafb", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  },
  fieldError: { color: "#ef4444", fontSize: 12, marginTop: 4 },
  reviewCard: {
    background: "#1f2937", borderRadius: 8, padding: 16,
    border: "1px solid #374151", marginBottom: 16,
  },
  reviewRow: { display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" },
  reviewLabel: { color: "#6b7280", fontSize: 13, width: 100, flexShrink: 0 },
  reviewValue: { color: "#f9fafb", fontSize: 13, wordBreak: "break-all" },
  reviewNote: { color: "#6b7280", fontSize: 13, lineHeight: 1.5 },
  errorBanner: {
    background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8,
    padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginTop: 12,
  },
  footer: {
    display: "flex", alignItems: "center", padding: "16px 24px",
    borderTop: "1px solid #1f2937", gap: 8,
  },
  primaryBtn: {
    background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  secondaryBtn: {
    background: "#1f2937", color: "#9ca3af", border: "1px solid #374151",
    borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer",
  },
};
