import React from "react";
import { EmptyState } from "../common.jsx";
import { MetricLine, ReportActionButtons, ReportToolbar } from "../forms/index.jsx";
import { formatCurrency } from "../../utils/formatters.js";

export function OperationsAttentionQueueTable({ title, rows, columns, onNavigate, onDrilldown, onExport, onPrint }) {
  return (
    <section className="panel settings-panel report-panel">
      <ReportToolbar title={title} note={`${rows.length} row(s)`} className="accounting-toolbar">
        <ReportActionButtons onExport={onExport} onPrint={onPrint} />
      </ReportToolbar>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map(([, label]) => <th key={label}>{label}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || row.key || `${title}-${index}`}>
                  {columns.map(([key]) => (
                    <td key={key}>{renderOperationCell(row[key], key)}</td>
                  ))}
                  <td>
                    <div className="operations-row-actions">
                      {onDrilldown && <button type="button" className="ghost-btn" onClick={() => onDrilldown(row)}>View</button>}
                      {row.target_view && <button type="button" className="ghost-btn subtle" onClick={() => onNavigate(row.target_view)}>{row.target_label || "Open Source"}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No operational exceptions" note="Current posted and draft records do not require attention for this view." />}
    </section>
  );
}

export function OperationsDrilldownContent({ drilldown, onClose, onNavigate }) {
  const summary = drilldown.summary;
  return (
    <section className="panel operations-drilldown-panel">
      <div className="panel-head">
        <div>
          <h2>Operational Drilldown</h2>
          <p>{summary.attention || "Operational evidence"} for {operationDisplay(summary.order_number_display)}</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
      </div>
      <OperationsDrilldownSummary summary={summary} />
      <OperationsIntelligenceSummary drilldown={drilldown} />
      <OperationsStatusTimeline steps={drilldown.timeline} />
      <OperationsExceptionSummary exceptions={drilldown.exceptions} />
      <OperationsRecommendations action={drilldown.recommendedAction} closure={drilldown.closure} />
      <OperationsClosureReadiness closure={drilldown.closure} />
      <OperationsEvidenceSections sections={drilldown.sections} />
      <div className="button-row">
        {summary.target_view && <button type="button" className="ghost-btn" onClick={() => onNavigate(summary.target_view)}>Open Source Screen</button>}
        <button type="button" className="primary-btn" onClick={onClose}>Done</button>
      </div>
    </section>
  );
}

export function OperationsDrilldownSummary({ summary }) {
  return (
    <div className="operations-drilldown-summary">
      <MetricLine label="Order Number" value={operationDisplay(summary.order_number_display)} />
      <MetricLine label="Department" value={operationDisplay(summary.department_name_display)} />
      <MetricLine label="Invoice Number" value={operationDisplay(summary.invoice_number_display)} />
      <MetricLine label="Amount" value={operationDisplay(summary.amount_display)} />
      <MetricLine label="Status" value={operationDisplay(summary.status_display)} />
    </div>
  );
}

export function OperationsIntelligenceSummary({ drilldown }) {
  return (
    <div className="operations-intelligence-grid">
      <section className="operations-health-card">
        <span>Operational Health Score</span>
        <strong>{drilldown.healthScore.score}%</strong>
        <small>{drilldown.healthScore.note}</small>
      </section>
      <MetricLine label="Attention Reason" value={operationDisplay(drilldown.attentionReason)} />
      <MetricLine label="Recommended Next Action" value={operationDisplay(drilldown.recommendedAction)} />
      <MetricLine label="Ready For Closure" value={drilldown.closure.ready ? "Yes" : "No"} />
    </div>
  );
}

export function OperationsStatusTimeline({ steps }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Status Timeline</h3>
        <span>{steps.length} operational checkpoint(s)</span>
      </div>
      <div className="operations-timeline">
        {steps.map((step) => (
          <div key={step.key} className={`operations-timeline-step ${normalizeStatusClass(step.status)}`}>
            <span className="timeline-icon">{step.icon}</span>
            <strong>{step.label}</strong>
            <small>{step.status}{step.note && step.note !== "Unlinked" ? ` - ${step.note}` : ""}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OperationsExceptionSummary({ exceptions }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Exception Summary</h3>
        <span>{exceptions.length} active exception(s)</span>
      </div>
      {exceptions.length ? (
        <div className="operations-exception-list">
          {exceptions.map((item) => (
            <div key={item.code} className={`operations-exception ${item.severity.toLowerCase()}`}>
              <span>{item.severity}</span>
              <strong>{item.title}</strong>
              <small>{item.details}</small>
            </div>
          ))}
        </div>
      ) : <EmptyState title="No exceptions" note="No missing linked evidence was detected for this queue row." />}
    </section>
  );
}

export function OperationsRecommendations({ action, closure }) {
  const pending = closure.checks.filter((check) => !check.ready).slice(0, 4);
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Recommendations</h3>
        <span>Next operational action</span>
      </div>
      <div className="operations-recommendation">
        <strong>{operationDisplay(action)}</strong>
        {pending.length ? (
          <ul>
            {pending.map((item) => <li key={item.label}>{item.label}</li>)}
          </ul>
        ) : <small>All closure checks are clear.</small>}
      </div>
    </section>
  );
}

export function OperationsClosureReadiness({ closure }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Order Closure Readiness</h3>
        <span>{closure.ready ? "Ready for closure" : "Not ready for closure"}</span>
      </div>
      <div className="operations-closure-grid">
        {closure.checks.map((check) => (
          <div key={check.label} className={check.ready ? "ready" : "pending"}>
            <strong>{check.label}</strong>
            <span>{check.ready ? "Yes" : "No"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OperationsEvidenceSections({ sections }) {
  return (
    <div className="operations-drilldown-sections">
      {sections.map((section) => (
        <OperationsEvidenceTable key={section.title} title={section.title} rows={section.rows} columns={section.columns} />
      ))}
    </div>
  );
}

export function OperationsEvidenceTable({ title, rows, columns }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>{title}</h3>
        <span>{rows.length} linked row(s)</span>
      </div>
      {rows.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>{columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 8).map((row, index) => (
                <tr key={row.id || row.key || `${title}-${index}`}>
                  {columns.map((column) => <td key={column}>{renderEvidenceCell(row[column], column)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="Unlinked" note="No linked evidence is available for this section yet." />}
    </section>
  );
}

function renderOperationCell(value, key) {
  if (key.includes("status") || key === "status") {
    const display = operationDisplay(value);
    return <span className={`status ${normalizeStatusClass(display)}`}>{display}</span>;
  }
  return operationDisplay(value);
}

function renderEvidenceCell(value, column) {
  if (["debit", "credit", "billing_value", "gst_amount", "invoice_value", "invoice_amount", "allocated_amount", "amount_received", "balance_outstanding", "purchase_value", "amount_paid", "balance_due"].includes(column) && value !== undefined && value !== null && value !== "") {
    return formatCurrency(value);
  }
  if (column === "new_value" && String(value || "").length > 110) return `${String(value).slice(0, 110)}...`;
  return operationDisplay(value);
}

function normalizeStatusClass(status) {
  return String(status || "draft").toLowerCase().replaceAll(" ", "-").replaceAll("/", "-");
}

function operationDisplay(value) {
  if (value === null || value === undefined) return "Unlinked";
  const text = String(value).trim();
  if (!text || text === "-") return "Unlinked";
  return value;
}
