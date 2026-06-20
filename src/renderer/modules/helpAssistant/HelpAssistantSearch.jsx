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

const MODE_DESCRIPTIONS = {
  help: "Searches the full help library: modules, reports, workflows, FAQ, troubleshooting and shortcuts.",
  screen: "Uses only the current screen context and explains what this exact screen is for.",
  onboarding: "Guides a new user through first setup and the order-to-cash workflow.",
  coach: "Highlights practical next actions based on safe dashboard and readiness signals.",
  data: "Answers read-only summary questions without changing ERP records."
};

function HelpAssistantSearch({ query, mode, onQueryChange, onModeChange, onAsk }) {
  return (
    <section className="panel help-assistant-search">
      <div>
        <h2>Ask GII ERP Help</h2>
        <p>Ask a question about modules, workflows, reports, shortcuts or common errors.</p>
      </div>
      <div className="help-assistant-controls">
        <label className="help-assistant-question-field">
          <span>Question</span>
          <textarea
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                onAsk();
              }
            }}
            placeholder={MODE_PLACEHOLDERS[mode] || MODE_PLACEHOLDERS.help}
          />
          <small>Use multiple lines for long questions. Press Ctrl+Enter to submit.</small>
        </label>
        <div className="help-assistant-control-actions">
          <div className="help-assistant-mode-wrap">
            <div className="help-assistant-mode-buttons" role="group" aria-label="Help assistant mode">
              {HELP_ASSISTANT_MODES.map(([key, label]) => (
                <button type="button" key={key} className={mode === key ? "active" : ""} onClick={() => onModeChange(key)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="help-assistant-mode-help">{MODE_DESCRIPTIONS[mode] || MODE_DESCRIPTIONS.help}</p>
          </div>
          <button type="button" className="primary-btn help-assistant-submit-btn" onClick={onAsk}>Submit</button>
        </div>
      </div>
    </section>
  );
}

export { HELP_ASSISTANT_MODES, HelpAssistantSearch };
