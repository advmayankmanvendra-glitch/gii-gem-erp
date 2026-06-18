import React from "react";

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
            placeholder="Example: why is my voucher not posting?"
          />
        </label>
        <div className="help-assistant-mode-buttons" role="group" aria-label="Help assistant mode">
          <button type="button" className={mode === "help" ? "active" : ""} onClick={() => onModeChange("help")}>Help Mode</button>
          <button type="button" className={mode === "screen" ? "active" : ""} onClick={() => onModeChange("screen")}>Screen Guidance</button>
        </div>
        <button type="button" className="primary-btn" onClick={onAsk}>Ask</button>
      </div>
    </section>
  );
}

export { HelpAssistantSearch };
