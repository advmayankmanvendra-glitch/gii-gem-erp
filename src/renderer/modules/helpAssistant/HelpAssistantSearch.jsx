import React from "react";

const HELP_ASSISTANT_MODES = [
  ["help", "Help Mode"],
  ["screen", "Screen Guidance"],
  ["onboarding", "Onboarding"],
  ["coach", "ERP Coach"],
  ["data", "Data Mode"]
];

const MODE_PLACEHOLDERS = {
  help: "Example: why is my voucher not posting?",
  screen: "Example: what should I do on this screen?",
  onboarding: "Example: I made the company, now where do I start?",
  coach: "Example: what should I do today?",
  data: "Example: show receivable outstanding summary"
};

function HelpAssistantSearch({ query, mode, onQueryChange, onModeChange, onAsk }) {
  return (
    <section className="panel help-assistant-search">
      <div>
        <h2>Ask GII ERP Help</h2>
        <p>Ask a question about modules, workflows, reports, shortcuts or common errors.</p>
      </div>
      <div className="help-assistant-controls">
        <label>
          <span>Question</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onAsk();
            }}
            placeholder={MODE_PLACEHOLDERS[mode] || MODE_PLACEHOLDERS.help}
          />
        </label>
        <div className="help-assistant-mode-buttons" role="group" aria-label="Help assistant mode">
          {HELP_ASSISTANT_MODES.map(([key, label]) => (
            <button type="button" key={key} className={mode === key ? "active" : ""} onClick={() => onModeChange(key)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="primary-btn" onClick={onAsk}>Ask</button>
      </div>
    </section>
  );
}

export { HELP_ASSISTANT_MODES, HelpAssistantSearch };
