import React from "react";

function HelpAssistantOnboarding({ readiness, onNavigate }) {
  const sections = readiness?.sections || [];
  const summary = readiness?.summary || {};
  return (
    <section className="panel help-assistant-insight">
      <div className="help-assistant-section-head">
        <div>
          <h2>ERP Onboarding Readiness</h2>
          <p>Use this as a safe setup checklist before live orders, posting or imports.</p>
        </div>
        <div className="help-assistant-score-strip">
          <span><strong>{summary.ready || 0}</strong> Ready</span>
          <span><strong>{summary.review || 0}</strong> Review</span>
          <span><strong>{summary.blocking || 0}</strong> Missing</span>
        </div>
      </div>
      <div className="help-assistant-readiness-grid">
        {sections.map((section) => (
          <article key={section.title}>
            <h3>{section.title}</h3>
            <p>{section.description}</p>
            <div className="help-assistant-check-list">
              {section.checks.map((check) => (
                <div key={check.title} className={`help-assistant-check ${check.tone}`}>
                  <div>
                    <strong>{check.title}</strong>
                    <small>{check.detail}</small>
                  </div>
                  <span>{check.status}</span>
                  {check.view && (
                    <button type="button" className="ghost-btn" onClick={() => onNavigate?.(check.view)}>
                      {check.actionLabel || "Open"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export { HelpAssistantOnboarding };
