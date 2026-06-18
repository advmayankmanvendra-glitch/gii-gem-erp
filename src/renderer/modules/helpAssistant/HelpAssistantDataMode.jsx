import React from "react";

const APPROVED_DATA_QUESTIONS = [
  "What is my GST payable?",
  "Show receivable outstanding summary",
  "Show payable summary",
  "Do I have low stock items?",
  "Which report should I open for unpaid invoices?"
];

function HelpAssistantDataMode({ onAsk }) {
  return (
    <section className="panel help-assistant-insight">
      <div className="help-assistant-section-head">
        <div>
          <h2>Read-only Data Mode Foundation</h2>
          <p>This mode answers only approved safe-summary questions when the data is already available to the renderer.</p>
        </div>
        <span className="help-assistant-safe-chip">No SQL / No Writes</span>
      </div>
      <div className="help-assistant-data-mode">
        <article>
          <h3>Allowed in H1-H5</h3>
          <ul>
            <li>Safe counts and summary values already loaded by dashboard, accounting or inventory summaries.</li>
            <li>Guidance about which report to open for row-level verification.</li>
            <li>Clear refusal when a question needs the future read-only Data Assistant API.</li>
          </ul>
        </article>
        <article>
          <h3>Not allowed yet</h3>
          <ul>
            <li>No unrestricted SQL.</li>
            <li>No record-level probing through mutation APIs.</li>
            <li>No posting, importing, approval, restore, delete or correction action.</li>
          </ul>
        </article>
      </div>
      <div className="help-assistant-question-grid">
        {APPROVED_DATA_QUESTIONS.map((question) => (
          <button type="button" key={question} onClick={() => onAsk?.(question, "data")}>
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

export { APPROVED_DATA_QUESTIONS, HelpAssistantDataMode };
