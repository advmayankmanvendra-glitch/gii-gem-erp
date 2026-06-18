import React from "react";

function HelpAssistantCoach({ coach, onNavigate }) {
  const priorities = coach?.priorities || [];
  return (
    <section className="panel help-assistant-insight">
      <div className="help-assistant-section-head">
        <div>
          <h2>Guided ERP Coach</h2>
          <p>Operational guidance from safe summary data. It does not post, edit, delete or approve anything.</p>
        </div>
        <small>{coach?.sourceLabel || "Safe summary data only"}</small>
      </div>
      <div className="help-assistant-priority-grid">
        {priorities.map((priority) => (
          <article key={`${priority.title}-${priority.view}`} className={`help-assistant-priority ${priority.severity?.toLowerCase() || "information"}`}>
            <span>{priority.severity}</span>
            <h3>{priority.title}</h3>
            <p>{priority.detail}</p>
            {priority.view && (
              <button type="button" className="ghost-btn" onClick={() => onNavigate?.(priority.view)}>
                {priority.actionLabel || "Open"}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export { HelpAssistantCoach };
