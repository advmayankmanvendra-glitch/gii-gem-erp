import React from "react";

function HelpAssistantSuggestions({ suggestions, onAsk }) {
  return (
    <section className="panel help-assistant-suggestions">
      <h2>Suggested Questions</h2>
      <div>
        {suggestions.map((question) => (
          <button type="button" key={question} onClick={() => onAsk(question)}>{question}</button>
        ))}
      </div>
    </section>
  );
}

export { HelpAssistantSuggestions };
