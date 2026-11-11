import React, { useState, useEffect, useCallback } from "react";
import { flatNavItems } from "../../config/navigation.js";

const CATEGORIES = ["suggestion", "bug", "question", "improvement", "other"];

const DIRECT_NAVIGATION_HINTS = [
  {
    terms: ["bill history", "purchase bill", "supplier bill", "bills"],
    title: "Bill history",
    answer: "Supplier bill history is available under Operations -> Purchase Bills. For customer billing history, open Operations -> Billing Voucher / Sales Invoice.",
    screens: ["procurements", "invoices"]
  },
  {
    terms: ["invoice history", "sales invoice", "billing history", "customer bill"],
    title: "Invoice history",
    answer: "Customer invoice history is available under Operations -> Billing Voucher / Sales Invoice.",
    screens: ["invoices"]
  },
  {
    terms: ["opening balance", "opening balances"],
    title: "Opening balances",
    answer: "Opening balances are available under Financial Control -> Opening Balances.",
    screens: ["opening_balances"]
  },
  {
    terms: ["supply order", "work order", "order history"],
    title: "Supply orders",
    answer: "Work Order / Supply Order records are available under Operations -> Supply Orders.",
    screens: ["supply_orders"]
  },
  {
    terms: ["gst report", "gst reports", "gst summary"],
    title: "GST reports",
    answer: "GST reports are available from the GST & Tax or Reports sections, depending on the report you need.",
    screens: ["gst_reports", "gst"]
  }
];

function feedbackErrorMessage(error, action) {
  const detail = String(error?.message || error || "").trim();
  if (!detail) return `${action} failed. Please reopen the desktop app and try again.`;
  return `${action} failed: ${detail}`;
}

function normalizeFeedbackText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isGuidanceLikeFeedback(message, category) {
  const normalized = normalizeFeedbackText(message);
  if (!normalized) return false;
  if (category === "question") return true;
  return /^(where|how|which|what)\b/.test(normalized) ||
    normalized.includes("where is") ||
    normalized.includes("how do i") ||
    normalized.includes("not able to find") ||
    normalized.includes("cannot find") ||
    normalized.includes("can't find");
}

function screenLabel(viewKey) {
  const item = flatNavItems.find((row) => row.key === viewKey);
  if (!item) return viewKey;
  return `${item.group || "ERP"} -> ${item.label}`;
}

function buildFeedbackGuidance(message, category) {
  if (!isGuidanceLikeFeedback(message, category)) return null;
  const normalized = normalizeFeedbackText(message);
  const direct = DIRECT_NAVIGATION_HINTS.find((hint) => hint.terms.some((term) => normalized.includes(normalizeFeedbackText(term))));
  if (direct) {
    return {
      title: direct.title,
      answer: direct.answer,
      screens: direct.screens.map((viewKey) => ({ viewKey, label: screenLabel(viewKey) })),
      note: "You can still submit this as feedback if the label, menu or screen is unclear."
    };
  }

  const tokens = normalized.split(/\s+/).filter((token) => token.length > 2);
  const matches = flatNavItems
    .map((item) => {
      const haystack = normalizeFeedbackText(`${item.label} ${item.group} ${item.description || ""}`);
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => ({ viewKey: item.key, label: screenLabel(item.key) }));

  if (!matches.length) return null;
  return {
    title: "Possible matching screens",
    answer: `This may already be covered by ${matches[0].label}.`,
    screens: matches,
    note: "I can suggest where to look, but I cannot show your specific live records from this feedback form."
  };
}

export default function FeedbackLogPanel({ session, companyContext, onClose, api, onOpenHelp }) {
  const feedbackApi = api || window.giiGemErp;
  const [view, setView] = useState("submit");
  const [category, setCategory] = useState("suggestion");
  const [message, setMessage] = useState("");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);
  const guidance = buildFeedbackGuidance(message, category);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await feedbackApi.listFeedback({});
      setEntries(data);
    } catch (e) {
      setError(feedbackErrorMessage(e, "Loading feedback entries"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === "list") loadEntries();
  }, [view, loadEntries]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setError(null);
    try {
      await feedbackApi.submitFeedback({
        company_id: companyContext?.company_id || null,
        user_id: session?.userId || null,
        user_name: session?.displayName || "",
        category,
        message: message.trim()
      });
      setSubmitted(true);
      setMessage("");
      setCategory("suggestion");
    } catch (e) {
      setError(feedbackErrorMessage(e, "Submitting feedback"));
    }
  }

  async function handleExport(format) {
    setExporting(true);
    setExportResult(null);
    try {
      const result = await feedbackApi.exportFeedback(format);
      setExportResult(result);
    } catch (e) {
      setError(feedbackErrorMessage(e, "Exporting feedback"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="feedback-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <h2>Feedback & Improvement Log</h2>
          <button type="button" className="feedback-close" onClick={onClose} title="Close">&times;</button>
        </div>

        <div className="feedback-tabs">
          <button type="button" className={`ghost-btn ${view === "submit" ? "active" : ""}`} onClick={() => { setView("submit"); setSubmitted(false); setError(null); }}>Submit</button>
          <button type="button" className={`ghost-btn ${view === "list" ? "active" : ""}`} onClick={() => { setView("list"); setError(null); }}>History</button>
          <button type="button" className={`ghost-btn ${view === "export" ? "active" : ""}`} onClick={() => { setView("export"); setError(null); }}>Export</button>
        </div>

        {error && <div className="feedback-error">{error}</div>}

        {view === "submit" && (
          <form className="feedback-form" onSubmit={handleSubmit}>
            {submitted ? (
              <div className="feedback-success">
                <p>Thank you! Your feedback has been recorded.</p>
                <button type="button" className="ghost-btn" onClick={() => setSubmitted(false)}>Submit another</button>
              </div>
            ) : (
              <>
                <div className="field">
                  <label>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Your Message</label>
                  <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Describe the improvement, bug, or suggestion..." required />
                </div>
                {guidance && (
                  <div className="feedback-help-suggestion">
                    <strong>Possible help answer</strong>
                    <p>{guidance.answer}</p>
                    <div className="feedback-help-screens">
                      {guidance.screens.map((screen) => <span key={screen.viewKey}>{screen.label}</span>)}
                    </div>
                    <small>{guidance.note}</small>
                    <div className="feedback-help-actions">
                      {onOpenHelp && <button type="button" className="ghost-btn" onClick={onOpenHelp}>Open Help</button>}
                      <button type="submit" className="ghost-btn">Submit anyway</button>
                    </div>
                  </div>
                )}
                <button type="submit" className="primary-btn" disabled={!message.trim()}>Submit Feedback</button>
              </>
            )}
          </form>
        )}

        {view === "list" && (
          <div className="feedback-list">
            {loading ? (
              <p className="feedback-muted">Loading...</p>
            ) : entries.length === 0 ? (
              <p className="feedback-muted">No feedback entries yet.</p>
            ) : (
              entries.map(entry => (
                <div key={entry.id} className={`feedback-entry feedback-${entry.status}`}>
                  <div className="feedback-entry-head">
                    <strong className={`feedback-cat feedback-cat-${entry.category}`}>{entry.category}</strong>
                    <span className={`feedback-status status-${entry.status}`}>{entry.status}</span>
                    <time>{entry.created_at}</time>
                  </div>
                  <p>{entry.message}</p>
                  {entry.user_name && <small className="feedback-author">by {entry.user_name}</small>}
                  {entry.resolution_notes && <div className="feedback-resolution"><strong>Resolution:</strong> {entry.resolution_notes}</div>}
                </div>
              ))
            )}
          </div>
        )}

        {view === "export" && (
          <div className="feedback-export">
            <p>Export all feedback entries for developer review.</p>
            <div className="feedback-export-actions">
              <button type="button" className="ghost-btn" onClick={() => handleExport("csv")} disabled={exporting}>
                {exporting ? "Exporting..." : "Export as CSV"}
              </button>
              <button type="button" className="ghost-btn" onClick={() => handleExport("json")} disabled={exporting}>
                {exporting ? "Exporting..." : "Export as JSON"}
              </button>
            </div>
            {exportResult && (
              <div className="feedback-export-result">
                {exportResult.success ? (
                  <p>Exported to: <code>{exportResult.filePath}</code></p>
                ) : (
                  <p className="feedback-error">{exportResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
