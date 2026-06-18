import React from "react";

function HelpAssistantAnswer({ answer, onAction, onRelatedTopic }) {
  if (!answer) return null;
  return (
    <section className="panel help-assistant-answer">
      <div className="help-assistant-answer-head">
        <div>
          <span>{answer.mode}</span>
          <h2>{answer.title}</h2>
          {answer.menuPath && <small>{answer.menuPath}</small>}
          {answer.sourceLabel && <small>{answer.sourceLabel}</small>}
        </div>
        <strong>{answer.type}</strong>
      </div>
      <p>{answer.summary}</p>
      {!!answer.steps?.length && (
        <div className="help-assistant-answer-block">
          <h3>What to do</h3>
          <ol>
            {answer.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
      )}
      {!!answer.commonMistakes?.length && (
        <div className="help-assistant-answer-block warning">
          <h3>Common mistakes</h3>
          <ul>
            {answer.commonMistakes.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {!!answer.suggestedNextActions?.length && (
        <div className="help-assistant-answer-block">
          <h3>Suggested next actions</h3>
          <div className="help-assistant-related">
            {answer.suggestedNextActions.map((action) => (
              <button type="button" key={`${action.title}-${action.view || action.detail}`} onClick={() => action.view ? onAction?.(action.view) : onRelatedTopic(action.title)}>
                <span>{action.tone || "Action"}</span>
                <strong>{action.title}</strong>
                {action.detail && <small>{action.detail}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {!!answer.businessTips?.length && (
        <div className="help-assistant-answer-block">
          <h3>Business tips</h3>
          <ul>
            {answer.businessTips.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {!!answer.relatedTopics?.length && (
        <div className="help-assistant-answer-block">
          <h3>Related help</h3>
          <div className="help-assistant-related">
            {answer.relatedTopics.map((topic) => (
              <button type="button" key={topic.id} onClick={() => onRelatedTopic(topic.title)}>
                <span>{topic.type}</span>
                <strong>{topic.title}</strong>
                {topic.menuPath && <small>{topic.menuPath}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="help-assistant-safety">{answer.safetyNote}</div>
    </section>
  );
}

export { HelpAssistantAnswer };
