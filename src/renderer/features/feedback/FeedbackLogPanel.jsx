import React, { useState, useEffect, useCallback } from "react";

const CATEGORIES = ["suggestion", "bug", "question", "improvement", "other"];

function feedbackErrorMessage(error, action) {
  const detail = String(error?.message || error || "").trim();
  if (!detail) return `${action} failed. Please reopen the desktop app and try again.`;
  return `${action} failed: ${detail}`;
}

export default function FeedbackLogPanel({ session, companyContext, onClose, api }) {
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
