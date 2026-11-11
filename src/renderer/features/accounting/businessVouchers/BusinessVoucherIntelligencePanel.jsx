import React from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { IntelligenceCard, MetricRows, MiniDataTable } from "../../../components/common.jsx";
import { voucherPlainLanguage, voucherTooltips } from "./businessVoucherUtils.js";

export function BusinessVoucherIntelligencePanel({
  form,
  data,
  selectedWorkflow,
  selectedOrder,
  selectedInvoice,
  selectedPurchaseBill,
  departmentInvoices,
  supplierBills,
  orderInvoices,
  orderPurchases,
  selectedItem,
  validationMessages,
  onApplyInvoice,
  onApplyPurchaseBill,
  onAutoAmount,
  onLearn
}) {
  const kind = form.voucher_kind;
  const tds = Number(form.tds_deducted || 0);
  const gstTds = Number(form.gst_tds_deducted || 0);
  const other = Number(form.other_deduction || 0);
  const amount = Number(form.amount || 0);
  const receivableReduction = amount + tds + gstTds + other;
  const invoiceBalance = Number(selectedInvoice?.balance_outstanding || 0);
  const purchaseBalance = Number(selectedPurchaseBill?.balance_due || selectedPurchaseBill?.balance_outstanding || 0);
  const proposedNoteAmount = Number(form.taxable_value || 0) + Number(form.gst_amount || (Number(form.taxable_value || 0) * Number(form.gst_rate || 0) / 100));
  const workIncentiveAmount = Number(form.billing_value || 0) * Number(form.commission_percentage || 0) / 100;
  const incentiveAmount = Number(form.initial_profit || 0) * Number(form.incentive_percentage || 0) / 100;
  const orderBillingValue = orderInvoices.reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
  const orderPurchaseValue = orderPurchases.reduce((sum, row) => sum + Number(row.invoice_amount || row.purchase_value || 0), 0);
  const orderQuantity = Number(selectedOrder?.order_quantity || selectedOrder?.quantity || 0);
  const suggestedExpenseHeads = ["Authorization", "L1 Expense", "Work Incentive", "Transport", "Installation", "Labour", "Documentation", "Miscellaneous"];

  return (
    <section className="voucher-intelligence-panel">
      <div className="voucher-intelligence-head">
        <div>
          <strong>{selectedWorkflow[1]} Intelligence</strong>
          <span>{voucherPlainLanguage(kind)}</span>
        </div>
        <button type="button" className="ghost-btn" onClick={onLearn}>Learn this voucher</button>
      </div>

      <div className="voucher-field-tips">
        {voucherTooltips(kind).map((tip) => (
          <span key={tip.label} title={tip.text}><strong>{tip.label}</strong>{tip.text}</span>
        ))}
      </div>

      {kind === "credit_note" && (
        <>
          <div className="workflow-note" style={{ marginBottom: 8 }}>
            <strong>Credit Note Lifecycle</strong>
            <span>Draft {">"} Submitted {">"} Approved {">"} Posted. A credit note reduces the original invoice value, sales and output GST.</span>
            <small>Use for correcting billing errors, rate differences, quantity differences or returns. The credit note is a controlled reversal of a posted sales invoice.</small>
          </div>
          <div className="intelligence-grid">
            <IntelligenceCard title="Invoices Available for Credit Note" note={form.department_id ? "Select the invoice being adjusted." : "Select a department to narrow this list."}>
              <MiniDataTable
                emptyTitle="No outstanding invoices"
                columns={["Invoice", "Date", "Value", "Received", "TDS", "GST TDS", "Balance", "Days", "Action"]}
                rows={departmentInvoices.map((row) => [
                  row.invoice_number || "-",
                  row.invoice_date || "-",
                  formatCurrency(row.invoice_amount || 0),
                  formatCurrency(row.amount_received || 0),
                  formatCurrency(row.tds_deducted || 0),
                  formatCurrency(row.gst_tds_deducted || 0),
                  formatCurrency(row.balance_outstanding || 0),
                  row.days_outstanding ?? 0,
                  <button type="button" className="ghost-btn" onClick={() => onApplyInvoice(row, "full")}>Use for note</button>
                ])}
              />
            </IntelligenceCard>
            <IntelligenceCard title="Credit Note Control">
              <MetricRows rows={[
                ["Original invoice", selectedInvoice?.invoice_number || "-"],
                ["Earlier credit notes", selectedInvoice ? formatCurrency(selectedInvoice.credit_note_adjusted || 0) : "-"],
                ["Invoice balance", selectedInvoice ? formatCurrency(invoiceBalance) : "-"],
                ["Proposed reduction", formatCurrency(proposedNoteAmount)],
                ["Balance after note", selectedInvoice ? formatCurrency(invoiceBalance - proposedNoteAmount) : "-"],
                ["Reason", form.reason_code || "-"],
                ["Lifecycle", selectedWorkflow?.status || "Draft"]
              ]} />
            </IntelligenceCard>
          </div>
        </>
      )}

      {kind === "receipt" && (
        <div className="intelligence-grid">
          <IntelligenceCard title="Outstanding Invoices" note={form.department_id ? "Select the invoice being allocated." : "Select a department to narrow this list."}>
            <MiniDataTable
              emptyTitle="No outstanding invoices"
              columns={["Invoice", "Date", "Value", "Received", "TDS", "GST TDS", "Balance", "Days", "Action"]}
              rows={departmentInvoices.map((row) => [
                row.invoice_number || "-",
                row.invoice_date || "-",
                formatCurrency(row.invoice_amount || 0),
                formatCurrency(row.amount_received || 0),
                formatCurrency(row.tds_deducted || 0),
                formatCurrency(row.gst_tds_deducted || 0),
                formatCurrency(row.balance_outstanding || 0),
                row.days_outstanding ?? 0,
                <button type="button" className="ghost-btn" onClick={() => onApplyInvoice(row, "full")}>Use full</button>
              ])}
            />
          </IntelligenceCard>
          <IntelligenceCard title="Receipt Allocation">
            <MetricRows rows={[
              ["Bank amount received", formatCurrency(amount)],
              ["Total deductions", formatCurrency(tds + gstTds + other)],
              ["Receivable reduction", formatCurrency(receivableReduction)],
              ["Remaining invoice outstanding", selectedInvoice ? formatCurrency(invoiceBalance - receivableReduction) : "-"]
            ]} />
          </IntelligenceCard>
        </div>
      )}

      {kind === "debit_note" && (
        <>
          <div className="workflow-note" style={{ marginBottom: 8 }}>
            <strong>Debit Note Lifecycle</strong>
            <span>Draft {">"} Submitted {">"} Approved {">"} Posted. A debit note reduces the original purchase bill value, purchase and input GST.</span>
            <small>Use for correcting purchase errors, rate differences, quantity differences or supplier returns. The debit note is a controlled reversal of a posted purchase bill.</small>
          </div>
          <div className="intelligence-grid">
            <IntelligenceCard title="Purchase Bills Available for Debit Note" note={form.supplier_id ? "Select the supplier bill being adjusted." : "Select a supplier to narrow this list."}>
              <MiniDataTable
                emptyTitle="No outstanding supplier bills"
                columns={["Purchase Bill", "Date", "Value", "Paid", "Balance", "Days", "Action"]}
                rows={supplierBills.map((row) => [
                  row.purchase_invoice_number || "-",
                  row.invoice_date || row.purchase_date || "-",
                  formatCurrency(row.invoice_amount || row.purchase_value || 0),
                  formatCurrency(row.amount_paid || 0),
                  formatCurrency(row.balance_due || row.balance_outstanding || 0),
                  row.days_outstanding ?? 0,
                  <button type="button" className="ghost-btn" onClick={() => onApplyPurchaseBill(row, "full")}>Use for note</button>
                ])}
              />
            </IntelligenceCard>
            <IntelligenceCard title="Debit Note Control">
              <MetricRows rows={[
                ["Original purchase bill", selectedPurchaseBill?.purchase_invoice_number || "-"],
                ["Earlier debit notes", selectedPurchaseBill ? formatCurrency(selectedPurchaseBill.debit_note_adjusted || 0) : "-"],
                ["Purchase bill balance", selectedPurchaseBill ? formatCurrency(purchaseBalance) : "-"],
                ["Proposed adjustment", formatCurrency(proposedNoteAmount)],
                ["Balance after note", selectedPurchaseBill ? formatCurrency(purchaseBalance - proposedNoteAmount) : "-"],
                ["Reason", form.reason_code || "-"],
                ["Lifecycle", selectedWorkflow?.status || "Draft"]
              ]} />
            </IntelligenceCard>
          </div>
        </>
      )}

      {kind === "supplier_payment" && (
        <div className="intelligence-grid">
          <IntelligenceCard title="Outstanding Purchase Bills" note={form.supplier_id ? "Select the supplier bill being paid." : "Select a supplier to narrow this list."}>
            <MiniDataTable
              emptyTitle="No outstanding supplier bills"
              columns={["Purchase Bill", "Date", "Value", "Paid", "Balance", "Days", "Action"]}
              rows={supplierBills.map((row) => [
                row.purchase_invoice_number || "-",
                row.invoice_date || row.purchase_date || "-",
                formatCurrency(row.invoice_amount || row.purchase_value || 0),
                formatCurrency(row.amount_paid || 0),
                formatCurrency(row.balance_due || row.balance_outstanding || 0),
                row.days_outstanding ?? 0,
                <button type="button" className="ghost-btn" onClick={() => onApplyPurchaseBill(row, "full")}>Use full</button>
              ])}
            />
          </IntelligenceCard>
          <IntelligenceCard title="Supplier Payment Allocation">
            <MetricRows rows={[
              ["Payment amount", formatCurrency(amount)],
              ["Allocated amount", formatCurrency(Number(form.allocation_amount || amount || 0))],
              ["Remaining payable", selectedPurchaseBill ? formatCurrency(purchaseBalance - Number(form.allocation_amount || amount || 0)) : "-"]
            ]} />
          </IntelligenceCard>
        </div>
      )}

      {kind === "sales" && (
        <>
          <div className="workflow-note" style={{ marginBottom: 8 }}>
            <strong>Sales-Inventory Dependency</strong>
            <span>Supply Order {">"} Delivery / Stock Issue {">"} Billing / Invoice {">"} Receivable</span>
            <small>Stock should be issued before (or concurrent with) billing to keep COGS and inventory synchronized. When Inventory Posting is enabled, a stock outward entry is created on voucher posting.</small>
          </div>
          <div className="intelligence-grid">
            <IntelligenceCard title="Order Context" note={selectedOrder ? "Order-linked fields are shown for review before voucher save." : "Select an order number to see linked business context."}>
              <MetricRows rows={[
                ["Order number", selectedOrder?.order_number || "-"],
                ["Department", selectedOrder?.department_name || "-"],
                ["Institution", selectedOrder?.institution_name || "-"],
                ["Location / place of supply", selectedOrder?.location || "-"],
                ["Linked billed value", formatCurrency(orderBillingValue)],
                ["Linked purchase value", formatCurrency(orderPurchaseValue)]
              ]} />
            </IntelligenceCard>
            <IntelligenceCard title="Billing Control">
              <MetricRows rows={[
                ["Ordered quantity", orderQuantity || "-"],
                ["Already billed", orderInvoices.length ? orderInvoices.length : 0],
                ["Balance quantity", orderQuantity ? orderQuantity - Number(form.quantity || 0) : "-"],
                ["GST rate", `${form.gst_rate || 0}%`]
              ]} />
            </IntelligenceCard>
            <IntelligenceCard title="Inventory Dependency">
              <MetricRows rows={[
                ["Inventory Posting", form.inventory_enabled === "1" ? "Enabled" : "Disabled"],
                ["Posting effect", form.inventory_enabled === "1" ? "Dr Receivable, Cr Sales, Cr Output GST + Stock Outward" : "Dr Receivable, Cr Sales, Cr Output GST (no stock impact)"],
                ["COGS tracking", form.inventory_enabled === "1" ? "Automatic on stock issue" : "Manual entry required"]
              ]} />
            </IntelligenceCard>
          </div>
        </>
      )}

      {kind === "purchase" && (
        <>
          <div className="workflow-note" style={{ marginBottom: 8 }}>
            <strong>Purchase-Inventory Dependency</strong>
            <span>Procurement {">"} GRN / Stock Receipt {">"} Purchase Bill {">"} Payable</span>
            <small>GRN should precede or accompany purchase billing to confirm stock receipt. When Inventory Posting is enabled, a stock inward entry is created on voucher posting.</small>
          </div>
          <div className="intelligence-grid">
            <IntelligenceCard title="Order Context" note={selectedOrder ? "Order-linked fields are shown for review before voucher save." : "Select an order number to see linked business context."}>
              <MetricRows rows={[
                ["Order number", selectedOrder?.order_number || "-"],
                ["Department", selectedOrder?.department_name || "-"],
                ["Institution", selectedOrder?.institution_name || "-"],
                ["Location / place of supply", selectedOrder?.location || "-"],
                ["Linked billed value", formatCurrency(orderBillingValue)],
                ["Linked purchase value", formatCurrency(orderPurchaseValue)]
              ]} />
            </IntelligenceCard>
            <IntelligenceCard title="Procurement Control">
              <MetricRows rows={[
                ["Item", selectedItem?.item_name || "-"],
                ["HSN", selectedItem?.hsn_code || "-"],
                ["Unit", selectedItem?.unit || "-"],
                ["Procurement bills linked", orderPurchases.length]
              ]} />
            </IntelligenceCard>
            <IntelligenceCard title="Inventory Dependency">
              <MetricRows rows={[
                ["Inventory Posting", form.inventory_enabled === "1" ? "Enabled" : "Disabled"],
                ["Posting effect", form.inventory_enabled === "1" ? "Dr Inventory, Dr Input GST, Cr Payable + Stock Inward" : "Dr Purchase, Dr Input GST, Cr Payable (no stock impact)"],
                ["GRN requirement", form.inventory_enabled === "1" ? "GRN auto-created on posting" : "GRN not required"]
              ]} />
            </IntelligenceCard>
          </div>
        </>
      )}

      {kind === "expense" && (
        <div className="intelligence-grid">
          <IntelligenceCard title="Order Expenses" note="Use this to avoid booking the same operational cost twice.">
            <MetricRows rows={[
              ["Order number", selectedOrder?.order_number || "-"],
              ["Paid status", form.paid_status],
              ["Bank required", form.paid_status === "paid" ? "Yes" : "No"],
              ["Selected expense head", form.expense_head_name || "-"]
            ]} />
          </IntelligenceCard>
          <IntelligenceCard title="Suggested Expense Heads">
            <div className="voucher-chip-list">
              {suggestedExpenseHeads.map((head) => <span key={head}>{head}</span>)}
            </div>
          </IntelligenceCard>
        </div>
      )}

      {["commission", "employee_incentive"].includes(kind) && (
        <div className="intelligence-grid">
          <IntelligenceCard title={kind === "commission" ? "Work Incentive Calculation" : "Employee Incentive Calculation"}>
            <MetricRows rows={kind === "commission" ? [
              ["Billing value", formatCurrency(form.billing_value || orderBillingValue || 0)],
              ["Work Incentive %", `${form.commission_percentage || 0}%`],
              ["Calculated work incentive", formatCurrency(workIncentiveAmount)],
              ["Existing booked", "Tracked after posting"]
            ] : [
              ["Initial profit", formatCurrency(form.initial_profit || 0)],
              ["Employee incentive %", `${form.incentive_percentage || 0}%`],
              ["Calculated incentive", formatCurrency(incentiveAmount)],
              ["Existing booked", "Tracked after posting"]
            ]} />
            <button type="button" className="ghost-btn" onClick={() => onAutoAmount(kind)}>Use calculated amount</button>
          </IntelligenceCard>
          <IntelligenceCard title="Order Link">
            <MetricRows rows={[
              ["Order number", selectedOrder?.order_number || "-"],
              ["Department", selectedOrder?.department_name || "-"],
              ["Linked billing", formatCurrency(orderBillingValue)]
            ]} />
          </IntelligenceCard>
        </div>
      )}

      {kind === "contra" && (
        <IntelligenceCard title="Contra Guidance">
          <p className="muted-text">Use contra only for cash-to-bank, bank-to-cash or bank-to-bank movement. Do not use it for customer receipts or supplier payments.</p>
        </IntelligenceCard>
      )}

      {validationMessages.length > 0 && (
        <div className="voucher-intelligence-warnings">
          {validationMessages.map((message) => <span key={message.message} className={message.severity === "error" ? "warning-line" : "ok-line"}>{message.message}</span>)}
        </div>
      )}
    </section>
  );
}
