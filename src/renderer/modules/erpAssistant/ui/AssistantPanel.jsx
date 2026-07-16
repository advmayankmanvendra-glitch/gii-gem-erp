import React, { useState, useCallback } from "react";
import { resolveQuery } from "../sources/knowledgeBridge.js";
import { renderForRole } from "../response/roleRenderer.js";
import { AssistantAnswerCard } from "./AssistantAnswerCard.jsx";

const PLACEHOLDER_QUESTIONS = [
  "Where is Work Order in the workflow?",
  "What should I do after CRAC?",
  "Which voucher is created by a receipt?",
  "Which table supports billing?",
  "How do I complete month-end closing?"
];

function AssistantPanel({ currentView, currentRole, onNavigate }) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);

  const ask = useCallback((q) => {
    const question = (q || query).trim();
    if (!question) return;
    setLoading(true);
    setAsked(true);
    const result = resolveQuery(question, currentView);
    const roleAdapted = renderForRole(result, currentRole || "readonly");
    setResponse(roleAdapted);
    setLoading(false);
  }, [query, currentView, currentRole]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  return (
    <section className="assistant-panel">
      <div className="assistant-panel-header">
        <h2>Ask ERP Help</h2>
        <span className="assistant-badge">Read-only guidance</span>
      </div>
      <div className="assistant-input-row">
        <textarea
          className="assistant-input"
          placeholder="Ask about this screen, a workflow, report, shortcut, or common issue."
          value={query}
          rows={5}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button type="button" className="primary-btn" onClick={() => ask()} disabled={loading || !query.trim()}>
          {loading ? "Searching..." : "Ask"}
        </button>
      </div>
      <small>Enter asks a question. Shift+Enter adds a new line.</small>
      {!asked && (
        <div className="assistant-suggestions">
          <p>Try asking:</p>
          <div className="assistant-suggestion-chips">
            {PLACEHOLDER_QUESTIONS.map((q) => (
              <button type="button" key={q} className="ghost-btn small-btn" onClick={() => { setQuery(q); ask(q); }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      {response && <AssistantAnswerCard response={response} onNavigate={onNavigate} />}
    </section>
  );
}

export { AssistantPanel };
