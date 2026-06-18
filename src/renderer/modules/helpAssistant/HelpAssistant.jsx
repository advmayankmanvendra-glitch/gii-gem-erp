import React, { useEffect, useMemo, useState } from "react";
import { HELP_ASSISTANT_SUGGESTIONS, buildHelpAssistantKnowledge } from "./helpAssistantKnowledge.js";
import { buildHelpAssistantAnswer, searchHelpTopics } from "./helpAssistantUtils.js";
import { HelpAssistantAnswer } from "./HelpAssistantAnswer.jsx";
import { HelpAssistantCoach } from "./HelpAssistantCoach.jsx";
import { HelpAssistantDataMode } from "./HelpAssistantDataMode.jsx";
import { HelpAssistantOnboarding } from "./HelpAssistantOnboarding.jsx";
import { HelpAssistantSearch } from "./HelpAssistantSearch.jsx";
import { HelpAssistantSuggestions } from "./HelpAssistantSuggestions.jsx";
import { buildCoachPriorities, buildOnboardingReadiness } from "./helpAssistantReadiness.js";

function HelpAssistant({ companies = [], companyContext = {}, currentHelp, currentView, onNavigate, session, stats }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("screen");
  const topics = useMemo(() => buildHelpAssistantKnowledge(currentHelp), [currentHelp]);
  const readiness = useMemo(() => buildOnboardingReadiness({ companies, companyContext, stats }), [companies, companyContext, stats]);
  const coach = useMemo(() => buildCoachPriorities({ readiness, stats, companyContext }), [readiness, stats, companyContext]);
  const answerContext = useMemo(() => ({ topics, currentHelp, readiness, coach, stats }), [topics, currentHelp, readiness, coach, stats]);
  const [answer, setAnswer] = useState(() => buildHelpAssistantAnswer({ query: "", mode: "screen", ...answerContext }));
  const results = useMemo(() => searchHelpTopics(topics, query, 8), [topics, query]);

  function ask(nextQuery = query, nextMode = mode) {
    const asked = String(nextQuery || "").trim();
    setQuery(asked);
    setMode(nextMode);
    setAnswer(buildHelpAssistantAnswer({ query: asked, mode: nextMode, ...answerContext }));
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setAnswer(buildHelpAssistantAnswer({ query, mode: nextMode, ...answerContext }));
  }

  function askRelated(title) {
    setMode("help");
    ask(title, "help");
  }

  useEffect(() => {
    setAnswer(buildHelpAssistantAnswer({ query, mode, ...answerContext }));
  }, [answerContext, currentView]);

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
          <small>{companyContext?.company_name || "No company selected"}</small>
          <small>{session?.role || "User"} guidance only</small>
        </div>
      </section>

      <div className="help-assistant-layout">
        <div className="help-assistant-main">
          <HelpAssistantSearch query={query} mode={mode} onQueryChange={setQuery} onModeChange={changeMode} onAsk={() => ask()} />
          <HelpAssistantAnswer answer={answer} onAction={onNavigate} onRelatedTopic={askRelated} />
          {mode === "onboarding" && <HelpAssistantOnboarding readiness={readiness} onNavigate={onNavigate} />}
          {mode === "coach" && <HelpAssistantCoach coach={coach} onNavigate={onNavigate} />}
          {mode === "data" && <HelpAssistantDataMode onAsk={ask} />}
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
          <section className="panel help-assistant-boundary">
            <h2>Mode Coverage</h2>
            <ul>
              <li>H1: conversational help intent routing.</li>
              <li>H2: onboarding readiness from safe summary counts.</li>
              <li>H3: current screen help.</li>
              <li>H4: guided coach priorities.</li>
              <li>H5: read-only data mode foundation.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

export { HelpAssistant };
