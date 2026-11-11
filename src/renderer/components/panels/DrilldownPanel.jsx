import { useState } from "react";
import { formatCurrency, formatNumber } from "../../utils/formatters.js";
import { buildDrilldownActions } from "../../features/accounting/drilldowns/drilldownUtils.js";
import { DrilldownActionCenter } from "./SmallComponents.jsx";
import { EmptyState } from "../common.jsx";

export function ReconciliationDrillTable({ title, rows = [] }) {
  const visibleRows = rows.slice(0, 25);
  const keys = visibleRows.length
    ? Object.keys(visibleRows[0]).filter((key) => !["id", "company_id", "is_deleted", "deleted_at", "deleted_by"].includes(key)).slice(0, 8)
    : [];
  return (
    <div className="source-box">
      <h3>{title}</h3>
      {visibleRows.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead><tr>{keys.map((key) => <th key={key}>{key.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.id || index}>
                  {keys.map((key) => <td key={key}>{typeof row[key] === "number" ? formatNumber(row[key]) : row[key] || "-"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No rows found" note="No linked rows are currently available for this drilldown." />}
      {rows.length > visibleRows.length ? <p className="hint">Showing first {visibleRows.length} of {rows.length} rows. Use export for full review.</p> : null}
    </div>
  );
}

export function DrilldownPanel({ drilldown, onClose, onNavigate, onInlineAction, notify, onDrillVoucher }) {
  const voucher = drilldown.voucher;
  const source = drilldown.source;
  const actions = buildDrilldownActions(drilldown);
  const [inlineAction, setInlineAction] = useState(null);
  const [inlineReason, setInlineReason] = useState("");
  const [inlineLoading, setInlineLoading] = useState(false);

  function openAction(action) {
    if (action.disabled) return;
    if (action.inlineAction) {
      setInlineAction(action);
      setInlineReason("");
      return;
    }
    if (!action.view || !onNavigate) return;
    onNavigate(action.view);
    onClose?.();
  }

  async function submitInlineAction() {
    if (!inlineAction) return;
    const action = inlineAction;
    const reason = inlineReason.trim();
    if (["reverse", "unallocate_receipt", "unallocate_supplier"].includes(action.actionType) && !reason) {
      if (typeof notify === "function") notify("Reason is required for this correction action", "error");
      return;
    }
    setInlineLoading(true);
    try {
      if (onInlineAction) {
        await onInlineAction(action, reason);
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

  function workflowNoteForMode(mode) {
    const row = drilldown.sourceRow || {};
    if (mode === "control_evidence") {
      return {
        status: row.status || "Review",
        message: row.blocking_reason || "Review linked source, voucher, ledger and audit evidence.",
        action: row.recommended_action || ""
      };
    }
    if (mode === "party_reconciliation") {
      return {
        status: row.status || "Review",
        message: row.possible_issue || "Check linked entries and allocations.",
        action: row.recommended_action || ""
      };
    }
    if (drilldown.ledger?.length) {
      const statusText = (voucher?.header?.status || "").toLowerCase();
      if (statusText === "posted") {
        return { status: "Posted (Locked)", message: "This voucher is posted and locked from direct editing.", action: "Use reversal workflow or create a correction voucher to adjust." };
      }
      if (statusText === "reversed") {
        return { status: "Reversed", message: "This voucher has been reversed. No further corrections are possible on this record.", action: "Review the reversal voucher or source records for context." };
      }
    }
    return { status: "Review", message: "Review ledger, voucher and source transaction below.", action: "Use Action Center to inspect, correct or allocate." };
  }

  const note = workflowNoteForMode(drilldown.mode);

  const inlineForm = inlineAction ? (
    <div className="source-box" style={{ border: "2px solid #d9534f", background: "#fff5f5" }}>
      <h3>{inlineAction.actionType === "reverse" ? "Reverse Voucher" : "Unallocation Confirmation"}</h3>
      <p>{inlineAction.description}</p>
      <div className="field-row">
        <label>Reason for {inlineAction.actionType === "reverse" ? "reversal" : "unallocation"}</label>
        <textarea
          value={inlineReason}
          onChange={(e) => setInlineReason(e.target.value)}
          placeholder={inlineAction.actionType === "reverse" ? "Enter the reason for reversing this posted voucher" : "Enter the reason for removing this allocation"}
          rows={2}
          disabled={inlineLoading}
        />
      </div>
      <div className="button-row">
        <button type="button" className="danger-btn" onClick={submitInlineAction} disabled={inlineLoading}>
          {inlineLoading ? "Processing..." : inlineAction.actionType === "reverse" ? "Yes, Reverse Voucher" : "Yes, Unallocate"}
        </button>
        <button type="button" className="ghost-btn" onClick={cancelInlineAction} disabled={inlineLoading}>Cancel</button>
      </div>
    </div>
  ) : null;

  if (drilldown.mode === "control_evidence") {
    return (
      <div className="voucher-detail-panel reconciliation-drill-panel">
        <div className="panel-head">
          <div>
            <h3>{drilldown.title}</h3>
            <p>{drilldown.sourceRow?.status_reason || "Financial control evidence and audit trace"}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="workflow-note">
          <strong>{note.status}</strong>
          <span>{note.message}</span>
          {note.action ? <small>{note.action}</small> : null}
        </div>
        <DrilldownActionCenter actions={actions} onAction={openAction} />
        {inlineForm}
        <ReconciliationDrillTable title={drilldown.sourceTitle} rows={drilldown.sourceRows} />
        <ReconciliationDrillTable title={drilldown.voucherTitle} rows={drilldown.voucherRows} />
        <ReconciliationDrillTable title={drilldown.ledgerTitle} rows={drilldown.ledgerRows} />
        <ReconciliationDrillTable title={drilldown.auditTitle} rows={drilldown.auditRows} />
      </div>
    );
  }
  if (drilldown.mode === "party_reconciliation") {
    return (
      <div className="voucher-detail-panel reconciliation-drill-panel">
        <div className="panel-head">
          <div>
            <h3>{drilldown.title}</h3>
            <p>{drilldown.sourceRow?.check_scope || "Ledger and sub-ledger reconciliation evidence"}</p>
          </div>
          <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="workflow-note">
          <strong>{note.status}</strong>
          <span>{note.message}</span>
          {note.action ? <small>{note.action}</small> : null}
        </div>
        <DrilldownActionCenter actions={actions} onAction={openAction} />
        {inlineForm}
        <ReconciliationDrillTable title={drilldown.ledgerTitle} rows={drilldown.ledgerRows} />
        <ReconciliationDrillTable title={drilldown.subledgerTitle} rows={drilldown.subledgerRows} />
        <ReconciliationDrillTable title={drilldown.relatedTitle} rows={drilldown.relatedRows} />
      </div>
    );
  }
  return (
    <div className="voucher-detail-panel">
      <div className="panel-head">
        <div>
          <h3>{drilldown.title}</h3>
          <p>Ledger, voucher and source transaction drilldown</p>
        </div>
        <button className="ghost-btn" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="workflow-note">
        <strong>{note.status}</strong>
        <span>{note.message}</span>
        {note.action ? <small>{note.action}</small> : null}
      </div>
      <DrilldownActionCenter actions={actions} onAction={openAction} />
      {inlineForm}
      {drilldown.ledger?.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Type</th>
                <th>Particulars</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Running</th>
                <th>Source</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {drilldown.ledger.map((row) => (
                <tr key={row.id}>
                  <td>{row.entry_date}</td>
                  <td>{row.voucher_number}</td>
                  <td>{row.voucher_type}</td>
                  <td>{row.narration || row.account_name}</td>
                  <td>{formatCurrency(Number(row.debit || 0))}</td>
                  <td>{formatCurrency(Number(row.credit || 0))}</td>
                  <td>{formatCurrency(Number(row.running_balance || 0))}</td>
                  <td>{row.source_module || "-"}</td>
                  <td>
                    <button className="ghost-btn small-btn" type="button" onClick={() => onDrillVoucher?.(row)} title="Open voucher drilldown">Voucher</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {voucher?.header && (
        <div className="drilldown-grid">
          <div>
            <h3>{voucher.header.voucher_number}</h3>
            <p>{voucher.header.voucher_date} | {voucher.header.voucher_type} | {voucher.header.status}</p>
            <p>{voucher.header.narration || "No narration"}</p>
          </div>
          <div>
            <strong>{voucher.header.company_name}</strong>
            <p>{voucher.header.financial_year_name || "No financial year"}</p>
            <p>{voucher.header.source_module || "-"} #{voucher.header.source_id || "-"}</p>
          </div>
        </div>
      )}
      {voucher?.lines?.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Narration</th></tr></thead>
            <tbody>
              {voucher.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.account_code} - {line.account_name}</td>
                  <td>{formatCurrency(Number(line.debit || 0))}</td>
                  <td>{formatCurrency(Number(line.credit || 0))}</td>
                  <td>{line.narration || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {source && (
        <div className="source-box">
          <h3>Source Transaction</h3>
          <p>{source.source_module} {source.record?.invoice_number || source.record?.purchase_invoice_number || source.record?.utr_number || source.record?.id || source.source_id}</p>
          <p>Order: {source.order?.order_number || "-"}</p>
          <p>Posting: {source.record?.posting_status || source.linkedVoucher?.status || "-"}</p>
          <p>Documents: {source.documents?.length || 0}</p>
        </div>
      )}
      {voucher?.audit?.length ? (
        <div className="source-box">
          <h3>Audit History</h3>
          {voucher.audit.slice(0, 5).map((row) => <p key={row.id}>{row.created_at} - {row.action}</p>)}
        </div>
      ) : null}
    </div>
  );
}
