import React, { useState } from "react";
import { Icon } from "../common.jsx";
import FeedbackLogPanel from "../../features/feedback/FeedbackLogPanel.jsx";

export default function HelpQuickActionsBar({ onHelp, onHelpAssistant, onLearnThisScreen, onTraining, session, companyContext, api }) {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <div className="help-quick-actions-bar">
      <span className="help-bar-label">Help</span>
      <div className="help-bar-actions">
        <button type="button" className="help-bar-btn" title="Open screen-specific guidance" onClick={onHelp}>
          <Icon name="help" />
          <span>Screen Help</span>
        </button>
        <button type="button" className="help-bar-btn" title="Learn the current screen's purpose and workflow" onClick={onLearnThisScreen}>
          <Icon name="book" />
          <span>Learn This Screen</span>
        </button>
        <button type="button" className="help-bar-btn" title="Open safe sample-data training mode" onClick={onTraining}>
          <Icon name="book" />
          <span>Training</span>
        </button>
        <button type="button" className="help-bar-btn ask-help-btn" title="Ask a general ERP help question" onClick={onHelpAssistant}>
          <Icon name="help" />
          <span>Ask ERP Help</span>
        </button>
        <button type="button" className={`help-bar-btn ${showFeedback ? "active" : ""}`} title="Submit feedback, suggestions, and improvement requests" onClick={() => setShowFeedback((current) => !current)}>
          <Icon name="edit" />
          <span>Feedback</span>
        </button>
      </div>
      {showFeedback && (
        <FeedbackLogPanel
          session={session}
          companyContext={companyContext}
          api={api}
          onClose={() => setShowFeedback(false)}
          onOpenHelp={() => {
            setShowFeedback(false);
            if (onHelpAssistant) onHelpAssistant();
          }}
        />
      )}
    </div>
  );
}
