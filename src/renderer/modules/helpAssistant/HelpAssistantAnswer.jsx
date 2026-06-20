import React from "react";

function HelpAssistantAnswer({ answer, onAction, onOpenScreen, onRelatedTopic }) {
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
        <div className="help-assistant-answer-actions">
          <strong>{answer.type}</strong>
          {answer.viewKey && <button type="button" className="ghost-btn small-btn" onClick={() => onOpenScreen?.(answer.viewKey)}>Open Screen</button>}
        </div>
      </div>
      {answer.question && (
        <div className="help-assistant-submitted-question">
          <span>Submitted question</span>
          <p>{answer.question}</p>
        </div>
      )}
      {!!answer.extractedEntities?.length && (
        <div className="help-assistant-entity-row">
          <span>I found these references:</span>
          {answer.extractedEntities.map((entity) => (
            <strong key={`${entity.type}-${entity.value}`} className="help-assistant-entity-chip">{entity.label}</strong>
          ))}
        </div>
      )}
      {answer.directAnswer && (
        <div className="help-assistant-direct-answer">
          <span>Direct answer</span>
          <p>{answer.directAnswer}</p>
        </div>
      )}
      <p>{answer.summary}</p>
      {(answer.purpose || answer.fieldsToCheck?.length || answer.recommendedNextStep) && (
        <div className="help-assistant-screen-guidance-grid">
          {answer.purpose && (
            <article>
              <span>Purpose</span>
              <p>{answer.purpose}</p>
            </article>
          )}
          {!!answer.fieldsToCheck?.length && (
            <article>
              <span>Check before action</span>
              <ul>
                {answer.fieldsToCheck.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          )}
          {answer.recommendedNextStep && (
            <article>
              <span>Recommended next step</span>
              <p>{answer.recommendedNextStep}</p>
            </article>
          )}
        </div>
      )}
      {!!answer.prerequisites?.length && (
        <div className="help-assistant-answer-block">
          <h3>Prerequisites</h3>
          <ul>
            {answer.prerequisites.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {(answer.keyFields?.length || answer.requiredFields?.length) && (
        <div className="help-assistant-screen-guidance-grid">
          {!!answer.keyFields?.length && (
            <article>
              <span>Key fields</span>
              <ul>{answer.keyFields.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
          {!!answer.requiredFields?.length && (
            <article>
              <span>Required fields</span>
              <ul>{answer.requiredFields.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
        </div>
      )}
      {(answer.accountingImpact?.length || answer.inventoryImpact?.length || answer.gstImpact?.length) && (
        <div className="help-assistant-screen-guidance-grid">
          {!!answer.accountingImpact?.length && (
            <article>
              <span>Accounting impact</span>
              <ul>{answer.accountingImpact.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
          {!!answer.inventoryImpact?.length && (
            <article>
              <span>Inventory impact</span>
              <ul>{answer.inventoryImpact.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
          {!!answer.gstImpact?.length && (
            <article>
              <span>GST impact</span>
              <ul>{answer.gstImpact.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
        </div>
      )}
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
      {!!answer.commonBlockers?.length && (
        <div className="help-assistant-answer-block warning">
          <h3>Common blockers</h3>
          <ul>
            {answer.commonBlockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {!!answer.whatToCheckNext?.length && (
        <div className="help-assistant-answer-block">
          <h3>What to check next</h3>
          <ul>
            {answer.whatToCheckNext.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
      {answer.suggestedNextAction && (
        <div className="help-assistant-answer-block">
          <h3>Suggested next action</h3>
          <p>{answer.suggestedNextAction}</p>
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
      {!!answer.relatedActions?.length && (
        <div className="help-assistant-answer-block">
          <h3>Related actions</h3>
          <div className="help-assistant-related">
            {answer.relatedActions.map((action) => (
              <button type="button" key={`${action.title}-${action.view || action.detail}`} onClick={() => action.view ? onAction?.(action.view) : onRelatedTopic?.(action.title)}>
                <span>{action.tone || "Action"}</span>
                <strong>{action.title}</strong>
                {action.detail && <small>{action.detail}</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      {(answer.relatedReports?.length || answer.relatedShortcuts?.length) && (
        <div className="help-assistant-screen-guidance-grid">
          {!!answer.relatedReports?.length && (
            <article>
              <span>Related reports</span>
              <ul>{answer.relatedReports.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
          {!!answer.relatedShortcuts?.length && (
            <article>
              <span>Relevant shortcuts</span>
              <ul>{answer.relatedShortcuts.map((item) => <li key={answerListKey(item)}>{answerListText(item)}</li>)}</ul>
            </article>
          )}
        </div>
      )}
      {answer.noMatch && (
        <div className="help-assistant-answer-block">
          <h3>Try these instead</h3>
          {!!answer.alternativeKeywords?.length && (
            <div className="help-assistant-keyword-row">
              {answer.alternativeKeywords.map((keyword) => (
                <button type="button" key={keyword} onClick={() => onRelatedTopic?.(keyword)}>{keyword}</button>
              ))}
            </div>
          )}
          {!!answer.closeMatches?.length && (
            <div className="help-assistant-related">
              {answer.closeMatches.map((topic) => (
                <article className="help-assistant-related-card" key={topic.id}>
                  <button type="button" onClick={() => onRelatedTopic?.(topic.title)}>
                    <span>{topic.type}</span>
                    <strong>{topic.title}</strong>
                    {topic.menuPath && <small>{topic.menuPath}</small>}
                  </button>
                  {topic.viewKey && <button type="button" className="ghost-btn small-btn" onClick={() => onOpenScreen?.(topic.viewKey)}>Open Screen</button>}
                </article>
              ))}
            </div>
          )}
          {!!answer.exampleQuestions?.length && (
            <div className="help-assistant-question-grid">
              {answer.exampleQuestions.map((question) => (
                <button type="button" key={question} onClick={() => onRelatedTopic?.(question)}>{question}</button>
              ))}
            </div>
          )}
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
              <article className="help-assistant-related-card" key={topic.id}>
                <button type="button" onClick={() => onRelatedTopic(topic.title)}>
                  <span>{topic.type}</span>
                  <strong>{topic.title}</strong>
                  {topic.menuPath && <small>{topic.menuPath}</small>}
                </button>
                {topic.viewKey && <button type="button" className="ghost-btn small-btn" onClick={() => onOpenScreen?.(topic.viewKey)}>Open Screen</button>}
              </article>
            ))}
          </div>
        </div>
      )}
      {!!answer.relatedQuestions?.length && (
        <div className="help-assistant-answer-block">
          <h3>Related questions</h3>
          <div className="help-assistant-question-grid">
            {answer.relatedQuestions.map((question) => (
              <button type="button" key={question} onClick={() => onRelatedTopic?.(question)}>{question}</button>
            ))}
          </div>
        </div>
      )}
      <div className="help-assistant-safety">{answer.safetyNote}</div>
    </section>
  );
}

/**
 * Builds a stable list key for text or metadata objects.
 */
function answerListKey(item) {
  if (typeof item === "object" && item) return item.title || item.label || item.detail || JSON.stringify(item);
  return String(item);
}

/**
 * Converts text or metadata objects into readable list copy.
 */
function answerListText(item) {
  if (typeof item === "object" && item) return item.title || item.label || item.detail || "";
  return String(item);
}

export { HelpAssistantAnswer };
