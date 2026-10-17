import React, { useEffect, useMemo, useState } from "react";
import { HELP_ASSISTANT_SUGGESTIONS, buildHelpAssistantKnowledge } from "./helpAssistantKnowledge.js";
import { buildHelpAssistantAnswer, navigationLocationTopics, normalizeSubmittedQuestion, searchHelpTopics } from "./helpAssistantUtils.js";
import { HelpAssistantAnswer } from "./HelpAssistantAnswer.jsx";
import { HelpAssistantCoach } from "./HelpAssistantCoach.jsx";
import { HelpAssistantDataMode } from "./HelpAssistantDataMode.jsx";
import { HelpAssistantRecentErrors } from "./HelpAssistantRecentErrors.jsx";
import { HelpAssistantOnboarding } from "./HelpAssistantOnboarding.jsx";
import { HelpAssistantSearch } from "./HelpAssistantSearch.jsx";
import { HelpAssistantSuggestions } from "./HelpAssistantSuggestions.jsx";
import { rememberConversation } from "./helpAssistantConversation.js";
import { buildCoachPriorities, buildOnboardingReadiness } from "./helpAssistantReadiness.js";
import { AssistantPanel } from "../erpAssistant/ui/AssistantPanel.jsx";

function HelpAssistant({ companies = [], companyContext = {}, currentHelp, currentView, initialMode = "screen", onBack, onNavigate, session, stats }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState(initialMode);
  const [conversationHistory, setConversationHistory] = useState([]);
  const topics = useMemo(() => buildHelpAssistantKnowledge(currentHelp), [currentHelp]);
  const readiness = useMemo(() => buildOnboardingReadiness({ companies, companyContext, stats }), [companies, companyContext, stats]);
  const coach = useMemo(() => buildCoachPriorities({ readiness, stats, companyContext }), [readiness, stats, companyContext]);
  const answerContext = useMemo(() => ({ topics, currentHelp, currentView, readiness, coach, stats }), [topics, currentHelp, currentView, readiness, coach, stats]);
  const [answer, setAnswer] = useState(() => buildHelpAssistantAnswer({ query: "", mode: initialMode, ...answerContext }));
  const results = useMemo(() => {
    const navigationResults = navigationLocationTopics(query, topics);
    return navigationResults.length ? navigationResults : searchHelpTopics(topics, query, 8);
  }, [topics, query]);
  const guidanceContextKey = `${currentView || ""}|${currentHelp?.key || currentHelp?.title || ""}|${initialMode}`;

  function ask(nextQuery = query, nextMode = mode) {
    const asked = normalizeSubmittedQuestion(nextQuery);
    const nextAnswer = buildHelpAssistantAnswer({ query: asked, mode: nextMode, conversationHistory, ...answerContext });
    setQuery(asked);
    setMode(nextMode);
    setAnswer(nextAnswer);
    setConversationHistory((history) => rememberConversation(history, asked, nextAnswer));
  }

  function changeMode(nextMode) {
    setMode(nextMode);
    setAnswer(buildHelpAssistantAnswer({ query, mode: nextMode, conversationHistory, ...answerContext }));
  }

  function askRelated(title) {
    setMode("help");
    ask(title, "help");
  }

  function openTopicScreen(topic) {
    if (topic?.viewKey) onNavigate?.(topic.viewKey);
  }

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    onNavigate?.(currentView || "dashboard");
  }

  useEffect(() => {
    setAnswer(buildHelpAssistantAnswer({ query, mode, conversationHistory, ...answerContext }));
  }, [answerContext, conversationHistory, currentView, mode, query]);

  useEffect(() => {
    setQuery("");
    setMode(initialMode);
    setConversationHistory([]);
    setAnswer(buildHelpAssistantAnswer({ query: "", mode: initialMode, conversationHistory: [], ...answerContext }));
  }, [guidanceContextKey]);

  return (
    <section className="help-assistant-screen">
      <section className="panel help-assistant-hero">
        <div>
          <span>ERP Help</span>
          <h2>GII ERP Help Assistant</h2>
          <p>Search the ERP manual, workflow guide, FAQ, troubleshooting notes, screen metadata and keyboard shortcuts without changing any ERP data.</p>
        </div>
        <div className="help-assistant-hero-actions">
          <button type="button" className="ghost-btn" onClick={goBack}>Back</button>
          <button type="button" className="ghost-btn" onClick={() => changeMode("help")}>Open Full Help Assistant</button>
          <button type="button" className={mode === "brain" ? "primary-btn" : "ghost-btn"} onClick={() => changeMode("brain")}>Ask a Question</button>
          <div className="help-assistant-current">
            <small>Current guidance context</small>
            <strong>{currentHelp?.title || currentView || "ERP Screen"}</strong>
            <small>{companyContext?.company_name || "No company selected"}</small>
            <small>{session?.role === "admin" ? "Administrator help" : "User help"}</small>
          </div>
        </div>
      </section>

      <div className="help-assistant-layout">
        <div className="help-assistant-main">
          {mode === "brain" ? (
            <AssistantPanel currentView={currentView} currentRole={session?.role} onNavigate={onNavigate} />
          ) : (
            <>
              <HelpAssistantSearch query={query} mode={mode} onQueryChange={setQuery} onModeChange={changeMode} onAsk={(submittedQuery) => ask(submittedQuery)} />
              <HelpAssistantAnswer answer={answer} onAction={onNavigate} onOpenScreen={onNavigate} onRelatedTopic={askRelated} />
              {mode === "onboarding" && <HelpAssistantOnboarding readiness={readiness} onNavigate={onNavigate} />}
              {mode === "coach" && <HelpAssistantCoach coach={coach} onNavigate={onNavigate} />}
              {mode === "data" && <HelpAssistantDataMode onAsk={ask} />}
            </>
          )}
        </div>
        <aside className="help-assistant-side">
          <HelpAssistantRecentErrors companyContext={companyContext} onNavigate={onNavigate} />
          <HelpAssistantSuggestions suggestions={HELP_ASSISTANT_SUGGESTIONS} onAsk={(question) => {
            setMode("help");
            ask(question, "help");
          }} />
          <section className="panel help-assistant-results">
            <h2>Search Results</h2>
            {answer?.safetyBoundary === "action-refused" ? (
              <p>No screen actions are offered for a refused request. Ask where to find the relevant screen if you need navigation guidance.</p>
            ) : query.trim() ? (
              results.length ? (
                <div className="help-assistant-results-list">
                  {results.map((topic) => (
                    <article className="help-assistant-result-card" key={topic.id}>
                      <button type="button" className="help-assistant-result-topic" onClick={() => askRelated(topic.title)}>
                        <span>{topic.type}</span>
                        <strong>{topic.title}</strong>
                        {topic.menuPath && <small>{topic.menuPath}</small>}
                      </button>
                      {topic.viewKey && (
                        <button type="button" className="ghost-btn small-btn" onClick={() => openTopicScreen(topic)}>Open Screen</button>
                      )}
                    </article>
                  ))}
                </div>
              ) : <p>No matching topics yet.</p>
            ) : <p>Type a question to see matching help topics.</p>}
          </section>
          <section className="panel help-assistant-boundary">
            <h2>Safe Help</h2>
            <ul>
              <li>No record creation, posting, reversal, deletion or restore.</li>
              <li>I cannot display live records or balances here.</li>
              <li>Use module screens for actual ERP actions.</li>
            </ul>
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("help_training")}>Open Full Help & Training</button>
          </section>
          <section className="panel help-assistant-boundary">
            <h2>How I Can Help</h2>
            <ul>
              <li>Explain the current screen, workflows, reports, fields, and shortcuts.</li>
              <li>Guide first-time setup, daily work, and training tasks.</li>
              <li>Help find the correct ERP screen without changing records.</li>
            </ul>
          </section>
        </aside>
      </div>
    </section>
  );
}

export { HelpAssistant };
