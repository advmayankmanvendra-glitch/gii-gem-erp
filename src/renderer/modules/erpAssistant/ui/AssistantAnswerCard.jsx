import React from "react";
import { AssistantSourceRefs } from "./AssistantSourceRefs.jsx";
import { AssistantSafetyNotice } from "./AssistantSafetyNotice.jsx";

const CONFIDENCE_CLASS = { high: "confidence-high", medium: "confidence-medium", low: "confidence-low" };

function AssistantAnswerCard({ response, onNavigate }) {
  if (!response) return null;
  const { answer, confidence, needsReview, sourceReferences, relatedWorkflowStages, relatedScreens, relatedTables, relatedVoucherTypes, relatedReports, safetyBoundary, knownGaps, suggestedNextHelpTopic, prohibitedActions, rolePresentation } = response;

  return (
    <div className="assistant-answer-card">
      {needsReview && (
        <div className="assistant-review-banner">
          Source confidence is low. Verify the information in the relevant ERP screen or manual before acting.
        </div>
      )}
      <div className="assistant-answer-header">
        <span className={`assistant-confidence ${CONFIDENCE_CLASS[confidence] || "confidence-low"}`}>
          {confidence === "high" ? "High confidence" : confidence === "medium" ? "Moderate confidence" : "Low confidence"}
        </span>
      </div>
      {answer && <div className="assistant-answer-text">{answer}</div>}
      {rolePresentation?.showSources && sourceReferences?.length > 0 && (
        <AssistantSourceRefs references={sourceReferences} />
      )}
      <div className="assistant-related-grid">
        {relatedWorkflowStages?.length > 0 && (
          <div className="assistant-related-section">
            <span>Related workflow stages</span>
            <ul>{relatedWorkflowStages.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        )}
        {relatedScreens?.length > 0 && (
          <div className="assistant-related-section">
            <span>Related screens</span>
            <ul>
              {relatedScreens.map((s) => (
                <li key={s}>
                  {onNavigate ? (
                    <button type="button" className="link-btn" onClick={() => onNavigate(s)}>{s}</button>
                  ) : s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {relatedTables?.length > 0 && (
          <div className="assistant-related-section">
            <span>Related tables</span>
            <ul>{relatedTables.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {relatedVoucherTypes?.length > 0 && (
          <div className="assistant-related-section">
            <span>Related vouchers</span>
            <ul>{relatedVoucherTypes.map((v) => <li key={v}>{v}</li>)}</ul>
          </div>
        )}
        {relatedReports?.length > 0 && (
          <div className="assistant-related-section">
            <span>Related reports</span>
            <ul>{relatedReports.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
      </div>
      {rolePresentation?.showSafety && safetyBoundary && (
        <AssistantSafetyNotice boundary={safetyBoundary} />
      )}
      {rolePresentation?.showGaps && knownGaps?.length > 0 && (
        <div className="assistant-known-gaps">
          <h3>Known gaps</h3>
          <ul>
            {knownGaps.map((gap, i) => (
              <li key={`gap-${i}`}>
                <strong>{gap.title}</strong> — {gap.summary}
                {gap.sourceKind && <small> ({gap.sourceKind})</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {suggestedNextHelpTopic && (
        <div className="assistant-next-topic">
          <span>Suggested next:</span> {suggestedNextHelpTopic}
        </div>
      )}
      {prohibitedActions?.length > 0 && (
        <div className="assistant-prohibited">
          I cannot: {prohibitedActions.join(", ")}.
        </div>
      )}
    </div>
  );
}

export { AssistantAnswerCard };
