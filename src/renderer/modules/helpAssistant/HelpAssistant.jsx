import React, { useMemo, useState } from "react";
import { HELP_ASSISTANT_SUGGESTIONS, buildHelpAssistantKnowledge } from "./helpAssistantKnowledge.js";
import { buildHelpAssistantAnswer, searchHelpTopics } from "./helpAssistantUtils.js";
import { HelpAssistantAnswer } from "./HelpAssistantAnswer.jsx";
import { HelpAssistantSearch } from "./HelpAssistantSearch.jsx";
import { HelpAssistantSuggestions } from "./HelpAssistantSuggestions.jsx";

function HelpAssistant({ currentHelp, currentView, onNavigate }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("screen");
  const topics = useMemo(() => buildHelpAssistantKnowledge(currentHelp), [currentHelp]);
  const [answer, setAnswer] = useState(() => buildHelpAssistantAnswer({ query: "", mode: "screen", topics, currentHelp }));
  const results = useMemo(() => searchHelpTopics(topics, query, 8), [topics, query]);

  function ask(nextQuery = query, nextMode = mode) {
    const asked = String(nextQuery || "").trim();
    setQuery(asked);
    setAnswer(buildHelpAssistantAnswer({ query: asked, mode: nextMode, topics, currentHelp }));
  }

  function askRelated(title) {
    setMode("help");
    ask(title, "help");
  }

  return (
    <section className="help-assistant-screen">
      <section className="panel help-assistant-hero">
        <div>
          <span>Guidance-only assistant</span>
          <h2>GII ERP Help Assistant</h2>
          <p>Search the ERP manual, workflow guide, FAQ, troubleshooting notes, screen metadata and keyboard shortcuts without changing any ERP data.</p>
        </div>
        <div className="help-assistant-current">
          <small>Current guidance context</small>
          <strong>{currentHelp?.title || currentView || "ERP Screen"}</strong>
        </div>
      </section>

      <div className="help-assistant-layout">
        <div className="help-assistant-main">
          <HelpAssistantSearch query={query} mode={mode} onQueryChange={setQuery} onModeChange={setMode} onAsk={() => ask()} />
          <HelpAssistantAnswer answer={answer} onRelatedTopic={askRelated} />
        </div>
        <aside className="help-assistant-side">
          <HelpAssistantSuggestions suggestions={HELP_ASSISTANT_SUGGESTIONS} onAsk={(question) => {
            setMode("help");
            ask(question, "help");
          }} />
          <section className="panel help-assistant-results">
            <h2>Search Results</h2>
            {query.trim() ? (
              results.length ? results.map((topic) => (
                <button type="button" key={topic.id} onClick={() => askRelated(topic.title)}>
                  <span>{topic.type}</span>
                  <strong>{topic.title}</strong>
                  {topic.menuPath && <small>{topic.menuPath}</small>}
                </button>
              )) : <p>No matching topics yet.</p>
            ) : <p>Type a question to see matching help topics.</p>}
          </section>
          <section className="panel help-assistant-boundary">
            <h2>Safety Boundary</h2>
            <ul>
              <li>No record creation, posting, reversal, deletion or restore.</li>
              <li>No live accounting data query in this phase.</li>
              <li>Use module screens for actual ERP actions.</li>
            </ul>
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("help_training")}>Open Full Help & Training</button>
          </section>
        </aside>
      </div>
    </section>
  );
}

export { HelpAssistant };
