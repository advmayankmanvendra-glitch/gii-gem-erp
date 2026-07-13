import { useEffect, useState } from "react";
import { EmptyState, Metric } from "../../components/common.jsx";
import { PhasePanel, VoucherProposalTable } from "../../components/panels/SmallComponents.jsx";
import { ReconciliationDrillTable } from "../../components/panels/DrilldownPanel.jsx";
import { ReportActionButtons, ReportToolbar } from "../../components/forms/index.jsx";
import { approveConfirmOptions, postConfirmOptions } from "../../config/confirmations.js";
import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { viewTitles } from "../../config/navigation.js";
import { exportRows, formatCurrency } from "../../utils/formatters.js";
import { requestPrintPreview } from "../../utils/uiHelpers.js";

function normalizeStatusClass(status) {
  return String(status || "draft").toLowerCase().replaceAll(" ", "-").replaceAll("/", "-");
}

export function VoucherProposalScreen({ view, notify, role, companyContext, api, confirmAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState({});
  const canReview = roleAllowsAction(role, "voucher");
  const canApprove = roleAllowsAction(role, "approve");
  const canPost = roleAllowsAction(role, "voucher");

  async function load() {
    setLoading(true);
    try {
      const result = await api.getVoucherProposals(companyContext);
      setData(result);
      const first = result.proposals?.[0] || null;
      if (!selected && first) selectProposal(first);
    } catch (error) {
      notify(error.message || "Voucher proposals failed to load", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyContext?.company_id, companyContext?.company_scope]);

  function selectProposal(row) {
    setSelected(row);
    setReview({
      suggested_voucher_type: row.suggested_voucher_type || "Receipt",
      suggested_party_type: row.suggested_party_type || "",
      suggested_party_id: row.suggested_party_id || "",
      suggested_party_name: row.suggested_party_name || "",
      suggested_ledger_id: row.suggested_ledger_id || "",
      suggested_ledger_name: row.suggested_ledger_name || "",
      linked_invoice_id: row.linked_invoice_id || "",
      linked_procurement_id: row.linked_procurement_id || "",
      linked_order_id: row.linked_order_id || "",
      narration: row.narration || "",
      remarks: row.remarks || ""
    });
  }

  async function runAction(action) {
    if (!selected) {
      notify("Select a proposal first", "error");
      return;
    }
    if (["save", "draft", "post"].includes(action) && !canPost) {
      notify("Your role cannot create or post voucher proposal records", "error");
      return;
    }
    if (["approve", "reject"].includes(action) && !canApprove) {
      notify("Your role cannot approve or reject voucher proposals", "error");
      return;
    }
    try {
      let result;
      if (action === "save") result = await api.updateVoucherProposal(selected.id, review);
      if (action === "approve") {
        const confirmed = await confirmAction(approveConfirmOptions("voucher_proposals", selected.id));
        if (!confirmed.confirmed) return;
        result = await api.approveVoucherProposal(selected.id, null, review.remarks);
      }
      if (action === "reject") {
        const confirmed = await confirmAction({
          mode: "danger",
          title: "Reject Voucher Proposal",
          message: "Do you want to reject this voucher proposal?",
          confirmLabel: "Yes, Proceed",
          cancelLabel: "No, Cancel",
          requireReason: true,
          reasonLabel: "Reason for rejection",
          reasonPlaceholder: review.remarks || "Enter rejection reason",
          moduleName: "voucher_proposals",
          recordId: selected.id
        });
        if (!confirmed.confirmed) return;
        result = await api.rejectVoucherProposal(selected.id, null, confirmed.reason);
      }
      if (action === "draft") result = await api.createDraftVoucherFromProposal(selected.id, null);
      if (action === "post") {
        const confirmed = await confirmAction({
          ...postConfirmOptions("voucher_proposals", selected.id),
          message: "Post this draft voucher? This will affect ledger, trial balance, party ledgers and bank book."
        });
        if (!confirmed.confirmed) return;
        result = await api.postDraftVoucherFromProposal(selected.id, null);
      }
      setData(result);
      const refreshed = result.proposals.find((row) => Number(row.id) === Number(selected.id)) || result.proposals[0] || null;
      if (refreshed) selectProposal(refreshed);
      notify(action === "post" ? "Draft voucher posted" : `Proposal ${action} completed`);
    } catch (error) {
      notify(error.message || "Proposal action failed", "error");
    }
  }

  if (loading) return <PhasePanel title="Loading Voucher Proposal Queue" note="Reading controlled bank-to-voucher proposals." />;

  const proposals = data?.proposals || [];
  const reportRows = proposalRowsForView(view, proposals, data?.audit || []);
  const selectedAudit = selected ? (data?.audit || []).filter((row) => Number(row.proposal_id) === Number(selected.id)) : [];
  if (view !== "voucher_proposal_queue") {
    return (
      <section className="panel settings-panel report-panel">
        <ReportToolbar title={viewTitles[view]?.[0] || "Voucher Proposal Report"} note={`${reportRows.length} row(s)`}>
          <ReportActionButtons
            exportLabel="Export CSV"
            onExport={() => exportRows(viewTitles[view]?.[0] || "voucher-proposals", reportRows)}
            onPrint={requestPrintPreview}
          />
        </ReportToolbar>
        <VoucherProposalTable rows={reportRows} onSelect={selectProposal} reportOnly />
      </section>
    );
  }

  return (
    <div className="grid-two">
      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h2>Accounting Control Dashboard</h2>
            <p>Bank entries become accounting only after proposal approval, draft voucher creation and posting.</p>
          </div>
        </div>
        <div className="metric-grid compact-metrics">
          <Metric label="Pending" value={data?.dashboard?.pendingProposals || 0} note="Suggested / review" icon="file" />
          <Metric label="Approved" value={data?.dashboard?.approvedPendingPosting || 0} note="Pending draft/post" icon="shield" />
          <Metric label="Rejected" value={data?.dashboard?.rejectedProposals || 0} note="Stopped" icon="undo" />
          <Metric label="Posted" value={data?.dashboard?.postedProposals || 0} note="Ledger impact" icon="receipt" />
          <Metric label="Duplicates" value={data?.dashboard?.duplicateBankEntries || 0} note="Blocked rows" icon="grid" />
          <Metric label="Unmatched" value={data?.dashboard?.unmatchedEntries || 0} note="Needs review" icon="wallet" />
        </div>
        <div className="records-toolbar">
          <div>
            <h2>Voucher Proposal Queue</h2>
            <span>{proposals.length} proposal(s)</span>
          </div>
          <ReportActionButtons onExport={() => exportRows("voucher-proposal-queue", proposals)} />
        </div>
        <VoucherProposalTable rows={proposals} selectedId={selected?.id} onSelect={selectProposal} />
      </section>

      <section className="panel settings-panel">
        <div className="panel-head">
          <div>
            <h2>Proposal Review</h2>
            <p>{selected ? `Proposal #${selected.id} - ${selected.status}` : "Select a proposal to review."}</p>
          </div>
          {selected && <span className={`status ${normalizeStatusClass(selected.status)}`}>{selected.status}</span>}
        </div>
        {selected ? (
          <>
            <div className="metric-grid compact-metrics">
              <Metric label="Debit" value={formatCurrency(selected.debit || 0)} note="Bank debit" icon="wallet" />
              <Metric label="Credit" value={formatCurrency(selected.credit || 0)} note="Bank credit" icon="receipt" />
              <Metric label="Confidence" value={`${selected.confidence_score || 0}%`} note="Matching score" icon="trend" />
              <Metric label="Draft" value={selected.draft_voucher_number || "-"} note={selected.draft_voucher_status || "No draft"} icon="file" />
            </div>
            <div className="mini-panel">
              <h3>Control Status</h3>
              <p><strong>Status reason:</strong> {selected.status_reason || proposalControlMeta(selected).status_reason}</p>
              <p><strong>Blocking reason:</strong> {selected.blocking_reason || proposalControlMeta(selected).blocking_reason}</p>
              <p><strong>Recommended action:</strong> {selected.recommended_action || proposalControlMeta(selected).recommended_action}</p>
            </div>
            <div className="form-grid">
              <label>
                Voucher Type
                <select value={review.suggested_voucher_type} onChange={(event) => setReview({ ...review, suggested_voucher_type: event.target.value })}>
                  {["Receipt", "Advance Receipt", "Customer Receipt", "Other Income Receipt", "Payment", "Supplier Payment", "Expense Payment", "Bank Charges", "Contra"].map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Party Type
                <select value={review.suggested_party_type} onChange={(event) => setReview({ ...review, suggested_party_type: event.target.value })}>
                  <option value="">No party</option>
                  <option>Department</option>
                  <option>Supplier</option>
                </select>
              </label>
              <label>
                Party
                <select value={review.suggested_party_id} onChange={(event) => {
                  const list = review.suggested_party_type === "Supplier" ? data.suppliers : data.departments;
                  const party = (list || []).find((item) => String(item.id) === event.target.value);
                  setReview({ ...review, suggested_party_id: event.target.value, suggested_party_name: party?.supplier_name || party?.department_name || "" });
                }}>
                  <option value="">No party selected</option>
                  {((review.suggested_party_type === "Supplier" ? data.suppliers : data.departments) || []).map((item) => <option key={item.id} value={item.id}>{item.supplier_name || item.department_name}</option>)}
                </select>
              </label>
              <label>
                Ledger Account
                <select value={review.suggested_ledger_id} onChange={(event) => {
                  const account = (data.accounts || []).find((item) => String(item.id) === event.target.value);
                  setReview({ ...review, suggested_ledger_id: event.target.value, suggested_ledger_name: account?.account_name || "" });
                }}>
                  <option value="">Default ledger</option>
                  {(data.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}
                </select>
              </label>
              <label>
                Invoice ID
                <input value={review.linked_invoice_id} onChange={(event) => setReview({ ...review, linked_invoice_id: event.target.value })} />
              </label>
              <label>
                Purchase Bill ID
                <input value={review.linked_procurement_id} onChange={(event) => setReview({ ...review, linked_procurement_id: event.target.value })} />
              </label>
              <label>
                Order ID
                <input value={review.linked_order_id} onChange={(event) => setReview({ ...review, linked_order_id: event.target.value })} />
              </label>
              <label>
                Remarks
                <input value={review.remarks} onChange={(event) => setReview({ ...review, remarks: event.target.value })} />
              </label>
            </div>
            <label>
              Narration
              <textarea value={review.narration} onChange={(event) => setReview({ ...review, narration: event.target.value })} />
            </label>
            <div className="button-row">
              <button className="ghost-btn" type="button" onClick={() => runAction("save")} disabled={!canReview || ["Draft Voucher Created", "Posted"].includes(selected.status)}>Save Review</button>
              <button className="ghost-btn" type="button" onClick={() => runAction("approve")} disabled={!canApprove || !["Suggested", "Needs Review", "Approved"].includes(selected.status)}>Approve</button>
              <button className="ghost-btn danger" type="button" onClick={() => runAction("reject")} disabled={!canApprove || selected.status === "Posted"}>Reject</button>
              <button className="primary-btn" type="button" onClick={() => runAction("draft")} disabled={!canPost || selected.status !== "Approved"}>Create Draft Voucher</button>
              <button className="primary-btn" type="button" onClick={() => runAction("post")} disabled={!canPost || selected.status !== "Draft Voucher Created"}>Post Draft</button>
            </div>
            <div className="mini-panel">
              <h3>Accounting Safety</h3>
              <p>Suggested, reviewed, approved and draft vouchers do not affect trial balance. Ledger, party ledger and bank book update only after Post Draft.</p>
            </div>
            <ReconciliationDrillTable title="Proposal Source and Voucher Links" rows={[selected]} />
            <ReconciliationDrillTable title="Proposal Audit Trail" rows={selectedAudit} />
          </>
        ) : <EmptyState title="No proposal selected" note="Generate proposals from an approved bank statement import." />}
      </section>
    </div>
  );
}

function proposalControlMeta(row) {
  const status = row?.status || "Suggested";
  if (status === "Posted") return { status_reason: "Posted voucher is linked and has ledger impact", blocking_reason: "Posted proposals cannot be edited directly", recommended_action: "Review posted voucher, ledger and audit trail" };
  if (status === "Draft Voucher Created") return { status_reason: "Draft voucher exists but is not posted", blocking_reason: "Posting is pending final review", recommended_action: "Review draft voucher and post only if safe" };
  if (status === "Approved") return { status_reason: "Proposal approved by checker", blocking_reason: "Draft voucher creation is pending", recommended_action: "Create draft voucher, then review before posting" };
  if (status === "Rejected") return { status_reason: "Proposal rejected and stopped", blocking_reason: row?.rejection_reason || row?.remarks || "Rejection reason not recorded", recommended_action: "Review rejection reason and source bank entry" };
  if (status === "Needs Review") return { status_reason: "Maker review changed or confirmed proposal mapping", blocking_reason: "Checker approval is pending", recommended_action: "Approve, reject or correct the proposal mapping" };
  return { status_reason: "Auto-suggested from approved bank statement", blocking_reason: Number(row?.confidence_score || 0) < 70 ? "Low confidence score requires manual review" : "Manual review is pending", recommended_action: "Review party, ledger, source links and narration" };
}

function proposalRowsForView(view, proposals, audit) {
  if (view === "pending_proposal_report") return proposals.filter((row) => ["Suggested", "Needs Review"].includes(row.status));
  if (view === "approved_proposal_report") return proposals.filter((row) => ["Approved", "Draft Voucher Created"].includes(row.status));
  if (view === "rejected_proposal_report") return proposals.filter((row) => row.status === "Rejected");
  if (view === "posted_bank_voucher_report") return proposals.filter((row) => row.status === "Posted");
  if (view === "proposal_audit_report") return audit.map((row) => ({ ...row, transaction_date: row.created_at, narration: row.action, status: row.remarks || row.new_value || "-" }));
  return proposals;
}
