import React, { useState } from "react";
import { ReportToolbar } from "../components/forms/index.jsx";
import {
  detailedWorkflowGuide,
  erpManualSections,
  faqItems,
  guidedLessons,
  keyboardGuideSections,
  knowledgeBaseItems,
  roleHelpProfiles,
  trainingSample,
  troubleshootingItems
} from "../config/helpContent.js";
import { flatNavItems } from "../config/navigation.js";
import { formatCurrency } from "../utils/formatters.js";
import { requestPrintPreview } from "../utils/uiHelpers.js";

export function HelpTrainingScreen({ currentView, trainingMode, setTrainingMode, onNavigate, onShortcutHelp, helpForView, matchesHelpQuery }) {
  const [helpQuery, setHelpQuery] = useState("");
  const moduleHelp = flatNavItems
    .filter((item) => item.key !== "help_training")
    .map((item) => helpForView(item.key));
  const currentHelp = helpForView(currentView);
  const filteredManual = erpManualSections.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredFaq = faqItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredTroubleshooting = troubleshootingItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredKnowledge = knowledgeBaseItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredShortcuts = keyboardGuideSections
    .map(([title, rows]) => [title, rows.filter((row) => matchesHelpQuery([title, ...row], helpQuery))])
    .filter(([title, rows]) => !helpQuery.trim() || rows.length || title.toLowerCase().includes(helpQuery.trim().toLowerCase()));
  const filteredModules = moduleHelp.filter((item) => matchesHelpQuery([item.title, item.description, ...item.howToUse, ...item.commonMistakes, ...item.bestPractices, ...item.relatedReports], helpQuery));

  return (
    <section className="help-training-screen" data-print-title="ERP User Manual">
      <div className="panel help-hero">
        <div>
          <h2>Help & Training Center 2.0</h2>
          <p>Searchable ERP manual, context help, workflow training, keyboard guide and knowledge base for self-service learning.</p>
        </div>
        <div className="help-hero-actions">
          <button type="button" className="primary-btn" onClick={() => setTrainingMode(!trainingMode)}>{trainingMode ? "Exit Training Mode" : "Start Training Mode"}</button>
          <button type="button" className="ghost-btn" onClick={onShortcutHelp}>Keyboard Shortcut Guide</button>
          <button type="button" className="ghost-btn" onClick={requestPrintPreview}>Export ERP Manual to PDF</button>
        </div>
      </div>

      <section className="panel help-section" data-print-ignore="true">
        <label className="field help-search-field">
          Help Search
          <input data-search-input="true" value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} placeholder="Search screens, fields, workflows, shortcuts, FAQ or reports" />
        </label>
        <div className="help-level-strip">
          <article><strong>Level 1</strong><span>Context help for screens, fields, mistakes and accounting impact.</span></article>
          <article><strong>Level 2</strong><span>Keyboard and productivity guide for fast desktop ERP work.</span></article>
          <article><strong>Level 3</strong><span>Full ERP user manual, workflow guide and knowledge base.</span></article>
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Level 1 - Current Screen Context Help" note={`${currentHelp.title}: ${currentHelp.description}`}>
          <span className="status active">Context Aware</span>
        </ReportToolbar>
        <div className="help-three-column">
          <HelpList title="Purpose and Workflow" items={[currentHelp.description, ...currentHelp.workflow]} />
          <HelpList title="Accounting Impact" items={currentHelp.accountingImpact} />
          <HelpList title="Common Mistakes" items={currentHelp.commonMistakes} />
        </div>
        <div className="help-three-column">
          <HelpList title="Field Explanations" items={currentHelp.fieldExplanations} />
          <HelpList title="Best Practices" items={currentHelp.bestPractices} />
          <HelpList title="Related Reports" items={currentHelp.relatedReports} />
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Level 2 - Keyboard & Productivity Guide" note="Complete shortcut guide including Smart Enter, function keys, voucher shortcuts and report actions." />
        <div className="shortcut-grid help-shortcut-grid">
          {filteredShortcuts.map(([title, rows]) => (
            <div className="shortcut-group" key={title}>
              <h3>{title}</h3>
              {(helpQuery.trim() ? rows : keyboardGuideSections.find(([name]) => name === title)?.[1] || rows).map(([keys, action]) => (
                <div className="shortcut-row" key={`${title}-${keys}`}><kbd>{keys}</kbd><span>{action}</span></div>
              ))}
            </div>
          ))}
        </div>
        <div className="help-callout">
          <strong>Smart Enter Logic</strong>
          <span>Enter moves forward through editable fields, Shift+Enter moves backward, disabled/read-only/hidden fields are skipped, and the last editable field opens a save confirmation.</span>
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Level 3 - ERP User Manual" note="Structured manual for new employees, operators, accountants and approvers.">
          <span className="status draft">Version 2.0</span>
        </ReportToolbar>
        <div className="manual-toc">
          <strong>Table of Contents</strong>
          <div>{erpManualSections.map(([title], index) => <span key={title}>{index + 1}. {title}</span>)}</div>
        </div>
        <div className="manual-grid">
          {filteredManual.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Government Supply Workflow Guide" note="Operational path from order receipt to profitability and closure." />
        <div className="workflow-guide workflow-guide-detailed">
          {detailedWorkflowGuide.filter((row) => matchesHelpQuery(row, helpQuery)).map(([title, module, note], index) => (
            <article key={title}>
              <strong>{index + 1}</strong>
              <div><h3>{title}</h3><small>{module}</small><p>{note}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Training Mode 2.0" note="Guided lessons and sample workflows for practice. Training Mode is isolated from live accounting data.">
          <span className={`status ${trainingMode ? "active" : "draft"}`}>{trainingMode ? "Active" : "Inactive"}</span>
        </ReportToolbar>
        <div className="training-grid">
          {Object.entries(trainingSample).map(([key, value]) => (
            <article key={key}>
              <span>{key.replaceAll("_", " ")}</span>
              <strong>{typeof value === "number" ? formatCurrency(value) : value}</strong>
            </article>
          ))}
        </div>
        <div className="module-help-grid training-lessons">
          {guidedLessons.filter((row) => matchesHelpQuery(row, helpQuery)).map(([title, note]) => (
            <article key={title}><h3>{title}</h3><p>{note}</p></article>
          ))}
        </div>
      </section>

      <section className="help-two-column">
        <div className="panel help-section">
          <h2>Frequently Asked Questions</h2>
          {filteredFaq.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}
        </div>
        <div className="panel help-section">
          <h2>Troubleshooting Guide</h2>
          {filteredTroubleshooting.map(([problem, solution]) => <details key={problem}><summary>{problem}</summary><p>{solution}</p></details>)}
        </div>
      </section>

      <section className="help-two-column">
        <div className="panel help-section">
          <h2>ERP Knowledge Base</h2>
          {filteredKnowledge.map(([title, note]) => <article className="knowledge-row" key={title}><strong>{title}</strong><span>{note}</span></article>)}
        </div>
        <div className="panel help-section">
          <h2>Role-Specific Help</h2>
          {roleHelpProfiles.filter((row) => matchesHelpQuery(row, helpQuery)).map(([role, note]) => <article className="knowledge-row" key={role}><strong>{role}</strong><span>{note}</span></article>)}
        </div>
      </section>

      <section className="panel help-section">
        <ReportToolbar title="Module Guidance Library" note="Purpose, workflow, accounting impact, mistakes and reports for implemented modules." />
        <div className="module-help-grid">
          {filteredModules.slice(0, helpQuery.trim() ? 80 : 36).map((item) => (
            <article key={item.key}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <small>{item.accountingImpact[0]}</small>
              <button type="button" className="ghost-btn" onClick={() => onNavigate(item.key)}>Open Module</button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export function HelpList({ title, items }) {
  return (
    <div className="help-list">
      <h3>{title}</h3>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}
