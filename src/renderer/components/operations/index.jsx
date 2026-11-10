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
                      {row.target_view && <button type="button" className="ghost-btn subtle" onClick={() => onNavigate(row.target_view, { section: row.target_section || "entry" })}>{row.target_label || "Open Source"}</button>}
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

export function OperationsDrilldownContent({ drilldown, onClose, onNavigate, onInlineAction, notify }) {
  const summary = drilldown.summary;
  const actions = buildOperationsDrilldownActions(drilldown);
  const [inlineAction, setInlineAction] = React.useState(null);
  const [inlineReason, setInlineReason] = React.useState("");
  const [inlineLoading, setInlineLoading] = React.useState(false);

  function openAction(action) {
    if (action.disabled) return;
    if (action.inlineAction) {
      setInlineAction(action);
      setInlineReason("");
      return;
    }
    if (!action.view || !onNavigate) return;
    onNavigate(action.view, action.navigationContext || { section: action.section || "entry" });
    onClose?.();
  }

  async function submitInlineAction() {
    if (!inlineAction) return;
    const reason = inlineReason.trim();
    if (!reason) {
      if (typeof notify === "function") notify("Reason is required", "error");
      return;
    }
    setInlineLoading(true);
    try {
      if (onInlineAction) {
        await onInlineAction(inlineAction, reason);
      }
      setInlineAction(null);
      setInlineReason("");
    } catch (error) {
      if (typeof notify === "function") notify(error.message, "error");
    } finally {
      setInlineLoading(false);
    }
  }

  function cancelInlineAction() {
    setInlineAction(null);
    setInlineReason("");
  }

  const inlineForm = inlineAction ? (
    <div className="source-box" style={{ border: "2px solid #d9534f", background: "#fff5f5" }}>
      <h3>{inlineAction.actionType === "reverse" ? "Reverse Voucher" : "Inline Correction"}</h3>
      <p>{inlineAction.description}</p>
      <div className="field-row">
        <label>Reason for correction</label>
        <textarea
          value={inlineReason}
          onChange={(e) => setInlineReason(e.target.value)}
          placeholder="Enter the reason for this correction action"
          rows={2}
          disabled={inlineLoading}
        />
      </div>
      <div className="button-row">
        <button type="button" className="danger-btn" onClick={submitInlineAction} disabled={inlineLoading}>
          {inlineLoading ? "Processing..." : "Confirm Correction"}
        </button>
        <button type="button" className="ghost-btn" onClick={cancelInlineAction} disabled={inlineLoading}>Cancel</button>
      </div>
    </div>
  ) : null;

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
      <OperationsStatusTimeline steps={drilldown.timeline} onNavigate={onNavigate} />
      <OperationsExceptionSummary exceptions={drilldown.exceptions} onNavigate={onNavigate} />
      <OperationsRecommendations action={drilldown.recommendedAction} closure={drilldown.closure} />
      <OperationsClosureReadiness closure={drilldown.closure} />
      <OperationsActionCenter actions={actions} onAction={openAction} />
      {inlineForm}
      <OperationsEvidenceJumpBar sections={drilldown.sections} />
      <OperationsEvidenceSections sections={drilldown.sections} />
      <div className="button-row">
        {summary.target_view && <button type="button" className="ghost-btn" onClick={() => onNavigate(summary.target_view, { section: summary.target_section || "entry" })}>Open Source Screen</button>}
        <button type="button" className="primary-btn" onClick={onClose}>Done</button>
      </div>
    </section>
  );
}

/** Render same-page jump actions for long operational drilldown evidence panels. */
export function OperationsEvidenceJumpBar({ sections }) {
  const availableSections = (sections || []).filter((section) => section?.title);
  if (!availableSections.length) return null;
  return (
    <section className="operations-evidence-card operations-evidence-jump-card">
      <div>
        <h3>Evidence Navigation</h3>
        <span>Jump directly to the linked evidence section.</span>
      </div>
      <div className="operations-evidence-jump-list">
        {availableSections.map((section) => (
          <button
            key={section.title}
            type="button"
            className="ghost-btn"
            onClick={() => jumpToEvidenceSection(section.title)}
          >
            {section.title}
          </button>
        ))}
      </div>
    </section>
  );
}

export function OperationsActionCenter({ actions, onAction }) {
  const grouped = actions.reduce((acc, action) => {
    const key = action.group || "Actions";
    acc[key] = acc[key] || [];
    acc[key].push(action);
    return acc;
  }, {});
  return (
    <section className="operations-evidence-card operations-action-center">
      <div>
        <h3>Action Center</h3>
        <span>Perform inline corrections or open the next safe operational workflow.</span>
      </div>
      <div className="operations-action-groups">
        {Object.entries(grouped).map(([group, groupActions]) => (
          <div key={group} className="operations-action-group">
            <strong>{group}</strong>
            <div className="operations-action-list">
              {groupActions.map((action) => (
                <button
                  key={`${group}-${action.label}`}
                  type="button"
                  className={`operations-action ${action.tone || "normal"}`}
                  disabled={action.disabled}
                  onClick={() => onAction(action)}
                >
                  <span>{action.label}{action.inlineAction ? " (Inline)" : ""}</span>
                  <small>{action.reason || action.description}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
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

const stepToTarget = {
  order_created: { view: "supply_orders", section: "entry" },
  procurement_completed: { view: "purchase_bills", section: "entry" },
  grn_completed: { view: "stock_inwards", section: "entry" },
  stock_receipt_completed: { view: "stock_inwards", section: "entry" },
  stock_reserved: { view: "inventory_dashboard", section: "report" },
  stock_issued: { view: "stock_outwards", section: "entry" },
  billing_completed: { view: "invoices", section: "entry" },
  receipt_allocation_completed: { view: "receipt_allocation_workflow", section: "entry" },
  supplier_payment_completed: { view: "supplier_allocation_workflow", section: "entry" },
  profitability_calculated: { view: "profitability", section: "report" },
  order_closed: { view: "order_closure_tracking", section: "entry" }
};

const exceptionToTarget = {
  missing_supply_order: { view: "supply_orders", section: "entry" },
  missing_procurement: { view: "purchase_bills", section: "entry" },
  missing_grn: { view: "stock_inwards", section: "entry" },
  missing_stock_receipt: { view: "stock_inwards", section: "entry" },
  missing_stock_issue: { view: "stock_outwards", section: "entry" },
  missing_invoice: { view: "invoices", section: "entry" },
  missing_receipt_allocation: { view: "receipt_allocation_workflow", section: "entry" },
  missing_supplier_allocation: { view: "supplier_allocation_workflow", section: "entry" },
  posting_error: { view: "posting_control", section: "report" }
};

export function OperationsStatusTimeline({ steps, onNavigate }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Status Timeline</h3>
        <span>{steps.length} operational checkpoint(s)</span>
      </div>
      <div className="operations-timeline">
        {steps.map((step) => (
          <div key={step.key} className={`operations-timeline-step ${normalizeStatusClass(step.status)}` + (onNavigate && stepToTarget[step.key] ? " clickable" : "")} onClick={() => { const target = stepToTarget[step.key]; if (onNavigate && target) onNavigate(target.view, { section: target.section }); }}>
            <span className="timeline-icon">{step.icon}</span>
            <strong>{step.label}</strong>
            <small>{step.status}{step.note && step.note !== "Unlinked" ? ` - ${step.note}` : ""}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export function OperationsExceptionSummary({ exceptions, onNavigate }) {
  return (
    <section className="operations-evidence-card">
      <div>
        <h3>Exception Summary</h3>
        <span>{exceptions.length} active exception(s)</span>
      </div>
      {exceptions.length ? (
        <div className="operations-exception-list">
          {exceptions.map((item) => (
            <div key={item.code} className={`operations-exception ${item.severity.toLowerCase()}` + (onNavigate && exceptionToTarget[item.code] ? " clickable" : "")} onClick={() => { const target = exceptionToTarget[item.code]; if (onNavigate && target) onNavigate(target.view, { section: target.section }); }}>
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
            {pending.map((item) => <li key={item.label}>{item.detail ? `${item.label}: ${item.detail}` : item.label}</li>)}
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
            {check.detail ? <small>{check.detail}</small> : null}
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
    <section id={operationsEvidenceSectionId(title)} className="operations-evidence-card">
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

/** Build a stable DOM id for an operational evidence section. */
function operationsEvidenceSectionId(title) {
  const slug = String(title || "section")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `operations-evidence-${slug || "section"}`;
}

/** Move the current viewport to a selected operational evidence section. */
function jumpToEvidenceSection(title) {
  window.__giiGemScrollToSection?.(`#${operationsEvidenceSectionId(title)}`, false);
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

function buildOperationsDrilldownActions(drilldown) {
  const summary = drilldown.summary || {};
  const recommendation = String(drilldown.recommendedAction || summary.attention || "").toLowerCase();
  const exceptions = drilldown.exceptions || [];
  const closure = drilldown.closure || { ready: false, checks: [] };
  const actions = [];

  if (summary.target_view) {
    actions.push({
      group: "Source",
      label: summary.target_label || "Open Source Screen",
      view: summary.target_view,
      section: summary.target_section || "entry",
      description: "Review the linked source record."
    });
  }

  if (recommendation.includes("crac") || recommendation.includes("certificate")) {
    actions.push({ group: "Next Action", label: "Upload CRAC", view: "crac_entry", section: "entry", description: "Create CRAC record for this order." });
    actions.push({ group: "Next Action", label: "View CRAC Tracker", view: "crac_tracker", section: "report", description: "Open CRAC tracking screen." });
  }
  if (recommendation.includes("closure") || recommendation.includes("close")) {
    actions.push({ group: "Next Action", label: "Review Order Closure", view: "order_closure_tracking", section: "entry", description: "Open closure checklist for this order." });
  }
  if (recommendation.includes("payment") && !recommendation.includes("receipt")) {
    actions.push({ group: "Next Action", label: "Payment Readiness", view: "payment_readiness", section: "report", description: "Review payment readiness for this order." });
  }
  if (recommendation.includes("procurement")) {
    actions.push({ group: "Next Action", label: "Create Procurement", view: "procurements", section: "entry", description: "Open procurement workflow for pending order items." });
  }
  if (recommendation.includes("grn") || recommendation.includes("receipt") || recommendation.includes("stock receipt")) {
    actions.push({ group: "Next Action", label: "Open Stock Receipt", view: "stock_inwards", section: "entry", description: "Review or create goods receipt evidence." });
  }
  if (recommendation.includes("issue") || recommendation.includes("supply")) {
    actions.push({ group: "Next Action", label: "Issue Stock", view: "stock_outwards", section: "entry", description: "Open stock issue/delivery workflow." });
  }
  if (recommendation.includes("bill") || recommendation.includes("invoice")) {
    actions.push({ group: "Next Action", label: "Raise Invoice", view: "invoices", section: "entry", description: "Open billing workflow for this order." });
  }
  if (recommendation.includes("receipt") || recommendation.includes("allocate")) {
    actions.push({ group: "Next Action", label: "Allocate Receipt", view: "receipt_allocation_workflow", section: "entry", description: "Open receipt allocation workflow." });
  }

  if (exceptions.some((item) => String(item.code || item.title || "").toLowerCase().includes("document") || String(item.title || "").toLowerCase().includes("missing"))) {
    actions.push({ group: "Evidence", label: "Upload Documents", view: "documents", section: "documents", tone: "warning", description: "Attach missing order, delivery, CRAC, installation or payment proof." });
  }

  actions.push(
    { group: "Evidence", label: "Stock Ledger", view: "stock_ledger", section: "ledger", description: "Trace inventory movement evidence." },
    { group: "Evidence", label: "General Ledger", view: "ledger_view", section: "ledger", description: "Trace accounting movement evidence." },
    { group: "Evidence", label: "Audit Trail", view: "audit_log", section: "audit", description: "Review action history." },
    {
      group: "Closure",
      label: "Review Order Closure",
      view: "supply_orders",
      section: "entry",
      tone: closure.ready ? "normal" : "blocked",
      disabled: !closure.ready,
      description: "Open order screen when closure checks are complete.",
      reason: closure.ready ? "" : "Closure blocked until pending checklist items are complete."
    }
  );

  return dedupeOperationsActions(actions);
}

function dedupeOperationsActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    const key = `${action.group}-${action.label}-${action.view || ""}-${action.disabled ? "disabled" : "active"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
