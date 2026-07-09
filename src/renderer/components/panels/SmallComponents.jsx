import { useState } from "react";
import { EmptyState, MetricRows } from "../common.jsx";
import { Field, MetricLine, SelectBox } from "../forms/index.jsx";
import { formatCurrency } from "../../utils/formatters.js";

export function PhasePanel({ title, note }) {
  return (
    <section className="panel settings-panel">
      <EmptyState title={title} note={note} />
    </section>
  );
}

export function ValidationGuidanceBanner({ errors, compact = false, onFocusError }) {
  if (!errors?.length) return null;
  const firstError = errors[0];
  const visibleErrors = compact ? errors.slice(0, 1) : errors.slice(0, 4);
  return (
    <div className={`validation-guidance ${compact ? "compact" : ""}`}>
      <div>
        <strong>{compact ? firstError.message : "Validation needs attention"}</strong>
        {!compact && <span>{errors.length} issue{errors.length === 1 ? "" : "s"} found. Click an issue to jump to the related field or section.</span>}
      </div>
      <div className="validation-list">
        {visibleErrors.map((error, index) => (
          <button type="button" key={`${error.name || error.section}-${index}`} onClick={() => onFocusError?.(error)}>
            <span>{error.section}</span>
            <div>
              <strong>{error.message}</strong>
              {error.action ? <small>{error.action}</small> : null}
              {error.detail ? <small>{error.detail}</small> : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SupplyOrderFieldSection({ title, note, hasError = false, children }) {
  return (
    <section className={`supply-order-section ${hasError ? "section-has-error" : ""}`} data-validation-section={title}>
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          {note && <span>{note}</span>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SupplyOrderSummaryCard({ totals, form }) {
  return (
    <section className="supply-order-summary-card">
      <div className="section-header">
        <div>
          <h2>Order Summary</h2>
          <span>Item details captured</span>
        </div>
      </div>
      <div className="summary-card-grid">
        <MetricLine label="Total Quantity" value={formatNumber(totals.quantity)} />
        <MetricLine label="Taxable Value" value={formatCurrency(totals.taxable)} />
        <MetricLine label="GST Amount" value={formatCurrency(totals.gst)} />
        <MetricLine label="Gross Order Value" value={formatCurrency(totals.gross)} />
      </div>
      <div className="readiness-mini">
        <span>Supply Type</span>
        <strong>{form.supply_type || "GeM"}</strong>
      </div>
      <div className="readiness-mini">
        <span>Status</span>
        <strong>{form.order_status || "Received"}</strong>
      </div>
    </section>
  );
}

function voucherLearningContent(kind) {
  const map = {
    receipt: ["Receipt Voucher", "Record money received from a department.", "Use after payment is credited or deductions are known.", "Dr Bank/Cash and deductions, Cr Trade Receivables.", "Do not enter a new sale here; allocate against invoice.", "Receivables, Party Ledger, Cash/Bank Book"],
    supplier_payment: ["Supplier Payment Voucher", "Record money paid to supplier.", "Use after supplier payment is made or payable is settled.", "Dr Trade Payables, Cr Bank/Cash.", "Do not book purchases here; use Purchase Voucher first.", "Payables, Supplier Ledger, Cash/Bank Book"],
    sales: ["Sales Voucher", "Raise taxable billing and receivable.", "Use for approved supply billing.", "Dr Trade Receivables, Cr Sales and Output GST.", "Do not enter payment receipt here.", "Sales Register, GST Summary, Receivables"],
    purchase: ["Purchase Voucher", "Book supplier bill or inventory receipt.", "Use when supplier invoice/procurement is accepted.", "Dr Purchase/Inventory and Input GST, Cr Trade Payables.", "Do not pay supplier from this voucher unless using payment workflow.", "Purchase Register, Payables, Stock Ledger"],
    expense: ["Expense Voucher", "Book order-linked operational cost.", "Use for authorization, L1, transport, installation and similar costs.", "Dr Expense, Cr Expense Payable or Bank.", "Do not duplicate work incentive/employee incentive expenses.", "Expense Analysis, Profitability"],
    commission: ["Work Incentive Voucher", "Book work incentive from billing value.", "Use after billing value is known.", "Dr Work Incentive Expense, Cr Payable or Bank.", "Check if work incentive was already booked.", "Work Incentive Analysis, Profitability"],
    employee_incentive: ["Employee Incentive Voucher", "Book employee incentive from initial profit.", "Use after order profitability is known.", "Dr Incentive Expense, Cr Incentive Payable or Bank.", "Do not calculate incentive on gross billing.", "Employee Performance, Profitability"],
    contra: ["Contra Voucher", "Move money between cash and bank ledgers.", "Use for bank deposit, withdrawal or bank-to-bank transfer.", "Dr receiving account, Cr paying account.", "Do not use for customer or supplier settlement.", "Cash Book, Bank Book"],
    "credit note": ["Credit Note", "Reduce a sales invoice.", "Use for return, discount, billing error or rate difference.", "Dr Sales/Output GST, Cr Trade Receivables.", "Do not exceed original invoice balance.", "GST Register, Receivables"],
    "debit note": ["Debit Note", "Adjust supplier bill or purchase value.", "Use for supplier return, purchase error or rate difference.", "Dr Trade Payables, Cr Purchase/Input GST.", "Do not exceed original purchase bill balance.", "GST Register, Payables"]
  };
  const row = map[kind] || ["Business Voucher", "Guided voucher entry.", "Use for controlled operational posting.", "Preview appears before posting.", "Review before posting.", "Voucher Register"];
  return { title: row[0], purpose: row[1], when: row[2], accounting: row[3], mistake: row[4], reports: row[5] };
}

export function VoucherLearnDialog({ kind, onClose }) {
  const content = voucherLearningContent(kind);
  return (
    <div className="modal-backdrop">
      <section className="confirm-dialog voucher-learn-dialog">
        <h2>{content.title}</h2>
        <div className="learn-grid">
          <MetricRows rows={[
            ["Purpose", content.purpose],
            ["When to use", content.when],
            ["Accounting impact", content.accounting],
            ["Common mistake", content.mistake],
            ["Related reports", content.reports]
          ]} />
        </div>
        <div className="button-row">
          <button type="button" className="primary-btn" onClick={onClose}>OK</button>
        </div>
      </section>
    </div>
  );
}

export function DeliveryChallanQuickForm({ data, notify, onSaved, api, confirmAction }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ order_id: "", item_id: "", warehouse_id: "", quantity: "", dispatch_date: today, vehicle_details: "", remarks: "" });
  async function submit(event) {
    event.preventDefault();
    try {
      const order = (data.references?.orders || []).find((row) => Number(row.id) === Number(form.order_id));
      const challan = await api.createDeliveryChallan({
        company_id: data.company_id,
        order_id: Number(form.order_id),
        department_id: order?.department_id || null,
        dispatch_date: form.dispatch_date,
        vehicle_details: form.vehicle_details,
        remarks: form.remarks,
        lines: [{ item_id: Number(form.item_id), warehouse_id: Number(form.warehouse_id), quantity: Number(form.quantity), remarks: form.remarks }]
      });
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Confirm Delivery Challan",
        message: "Do you want to proceed with this inventory action? Stock balances may be affected.",
        confirmLabel: "Yes, Proceed",
        cancelLabel: "No, Cancel",
        moduleName: "delivery_challans",
        recordId: challan.id
      });
      if (!confirmed.confirmed) return;
      await api.confirmDeliveryChallan(challan.id, 1);
      notify(`Delivery challan confirmed: ${challan.challan_number || challan.id}`);
      setForm({ order_id: "", item_id: "", warehouse_id: "", quantity: "", dispatch_date: today, vehicle_details: "", remarks: "" });
      onSaved();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  return (
    <form className="inline-entry-form" onSubmit={submit}>
      <SelectBox label="Order" value={form.order_id} onChange={(value) => setForm({ ...form, order_id: value })} options={(data.references?.orders || []).map((row) => [row.id, row.order_number])} />
      <SelectBox label="Item" value={form.item_id} onChange={(value) => setForm({ ...form, item_id: value })} options={(data.references?.items || []).map((row) => [row.id, row.item_name])} />
      <SelectBox label="Warehouse" value={form.warehouse_id} onChange={(value) => setForm({ ...form, warehouse_id: value })} options={(data.references?.warehouses || []).map((row) => [row.id, row.warehouse_name])} />
      <Field name="quantity" label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
      <Field name="dispatch_date" label="Dispatch Date" type="date" value={form.dispatch_date} onChange={(value) => setForm({ ...form, dispatch_date: value })} />
      <Field name="vehicle_details" label="Vehicle Details" type="text" value={form.vehicle_details} onChange={(value) => setForm({ ...form, vehicle_details: value })} />
      <button className="primary-btn">Create & Confirm Delivery</button>
    </form>
  );
}

export function DrilldownActionCenter({ actions, onAction }) {
  const grouped = actions.reduce((acc, action) => {
    const key = action.group || "Review";
    acc[key] = acc[key] || [];
    acc[key].push(action);
    return acc;
  }, {});
  return (
    <section className="drilldown-action-center">
      <div>
        <h3>Action Center</h3>
        <span>Perform inline corrections or navigate to the appropriate workflow.</span>
      </div>
      <div className="drilldown-action-groups">
        {Object.entries(grouped).map(([group, groupActions]) => (
          <div key={group} className="drilldown-action-group">
            <strong>{group}</strong>
            <div className="drilldown-action-list">
              {groupActions.map((action) => (
                <button
                  key={`${group}-${action.label}`}
                  type="button"
                  className={`drilldown-action ${action.tone || "normal"}`}
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

export function VoucherProposalTable({ rows, selectedId, onSelect, reportOnly = false, proposalControlMeta }) {
  if (!rows?.length) return <EmptyState title="No voucher proposals" note="Approve a bank statement import and generate proposals to populate this queue." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Narration</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Voucher</th>
            <th>Party</th>
            <th>Ledger</th>
            <th>Score</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Next Action</th>
            {!reportOnly && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index} className={Number(selectedId) === Number(row.id) ? "selected-row" : ""}>
              <td>{row.id || row.proposal_id || "-"}</td>
              <td>{row.transaction_date || row.created_at || "-"}</td>
              <td><strong>{row.narration || row.action || "-"}</strong><br /><span>{row.utr || row.reference_number || row.draft_voucher_number || row.posted_voucher_number || ""}</span></td>
              <td>{formatCurrency(row.debit || 0)}</td>
              <td>{formatCurrency(row.credit || 0)}</td>
              <td>{row.suggested_voucher_type || row.draft_voucher_number || "-"}</td>
              <td>{row.suggested_party_name || row.suggested_party_type || "-"}</td>
              <td>{row.suggested_ledger_name || "-"}</td>
              <td>{row.confidence_score ? `${row.confidence_score}%` : "-"}</td>
              <td><span className={`status-pill ${String(row.status || "Draft").toLowerCase().replaceAll(" ", "-")}`}>{row.status || "Draft"}</span></td>
              <td>{row.status_reason || proposalControlMeta?.(row).status_reason}<br /><span>{row.blocking_reason || proposalControlMeta?.(row).blocking_reason}</span></td>
              <td>{row.recommended_action || proposalControlMeta?.(row).recommended_action}</td>
              {!reportOnly && <td><button className="ghost-btn small-btn" type="button" onClick={() => onSelect?.(row)}>Review</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}
