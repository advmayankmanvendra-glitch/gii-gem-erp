import { EmptyState, Icon } from "../common.jsx";
import { formatCurrency } from "../../utils/formatters.js";

export function FinancialControlOverview({ data, onDrill }) {
  const controls = data.financialControl || [];
  const findControl = (id) => controls.find((row) => row.id === id) || {};
  const unposted = findControl("unposted");
  const approval = findControl("approval");
  const partyRecon = findControl("party_recon");
  const trial = findControl("trial");
  const lockedYears = (data.financialYears || []).filter((row) => ["Closed", "Locked"].includes(row.status));
  const blockers = controls.filter((row) => ["Mismatch", "Review Required", "Checker Pending", "Missing"].includes(row.status));
  return (
    <div className="control-dashboard">
      <div className="metric-grid compact-metrics">
        <button type="button" className="metric-card metric-card-link" onClick={() => onDrill(unposted)}>
          <span>Unposted Records</span>
          <strong>{unposted.value ?? 0}</strong>
          <small>{unposted.status || "Clear"}</small>
        </button>
        <button type="button" className="metric-card metric-card-link" onClick={() => onDrill(approval)}>
          <span>Pending Approvals</span>
          <strong>{approval.value ?? 0}</strong>
          <small>{approval.status || "Clear"}</small>
        </button>
        <button type="button" className="metric-card metric-card-link" onClick={() => onDrill(partyRecon)}>
          <span>Reconciliation</span>
          <strong>{partyRecon.value ?? 0}</strong>
          <small>{partyRecon.status || "Matched"}</small>
        </button>
        <button type="button" className="metric-card metric-card-link" onClick={() => onDrill(trial)}>
          <span>Trial Balance</span>
          <strong>{formatCurrency(Number(trial.value || 0))}</strong>
          <small>{trial.status || "Balanced"}</small>
        </button>
      </div>
      {lockedYears.length ? (
        <div className="workflow-note">
          <strong>Locked year warning</strong>
          <span>{lockedYears.length} closed/locked financial year(s) exist. Backdated posting should be routed through controlled reopening or correction workflow.</span>
        </div>
      ) : null}
      {blockers.length ? (
        <div className="source-box">
          <h3>Pending Control Attention</h3>
          {blockers.slice(0, 5).map((row) => (
            <p key={row.id}><strong>{row.control}:</strong> {row.blocking_reason || row.status_reason || row.status}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LockedYearControlNotice({ data }) {
  const lockedYears = (data.financialYears || []).filter((row) => ["Closed", "Locked"].includes(row.status));
  if (!lockedYears.length) return null;
  return (
    <div className="mini-panel">
      <h3>Locked Year Warning</h3>
      <p>{lockedYears.length} financial year(s) are closed or locked. Posting, opening-balance changes and carry-forward actions for those periods should remain blocked unless the year is formally reopened.</p>
    </div>
  );
}

export function AccountingControlReportTable({
  config,
  rows,
  formatCell,
  canApproveControls,
  canPostControls,
  handlePostingAction,
  openFinancialControlDrill
}) {
  if (!rows.length) {
    return <EmptyState title="No accounting control data" note="No posting, approval, audit or financial-control rows are available for this view." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.account_code || row.voucher_line_id || index}>
              {config.columns.map((column) => (
                <td key={column.key}>
                  {column.type === "posting_actions" ? (
                    <div className="row-actions">
                      <button type="button" title={canApproveControls ? "Approve" : "Approval requires approver role"} onClick={() => handlePostingAction("approve", row)} disabled={!canApproveControls || row.approval_status === "Approved" || row.posting_status === "Posted"}><Icon name="shield" /></button>
                      <button type="button" title={canPostControls ? "Post" : "Posting requires accounting role"} onClick={() => handlePostingAction("post", row)} disabled={!canPostControls || row.posting_status === "Posted" || row.posting_status === "Reversed"}><Icon name="receipt" /></button>
                      <button type="button" title={row.retry_available === "Yes" ? "Retry safe failed posting" : "Retry only appears for failed posting records"} onClick={() => handlePostingAction("retry", row)} disabled={!canPostControls || row.retry_available !== "Yes"}><Icon name="undo" /></button>
                      <button type="button" title="View Error" onClick={() => handlePostingAction("error", row)} disabled={!row.posting_error}><Icon name="file" /></button>
                      <button type="button" title="Control drilldown" onClick={() => openFinancialControlDrill(row)}><Icon name="grid" /></button>
                    </div>
                  ) : column.type === "control_drill" ? (
                    <button className="ghost-btn small-btn" type="button" onClick={() => openFinancialControlDrill(row)}>Drill</button>
                  ) : formatCell(row[column.key], column.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
