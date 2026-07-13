import { useEffect, useState } from "react";
import { EmptyState, Metric } from "../../components/common.jsx";
import { OperationsAttentionQueueTable } from "../../components/operations/index.jsx";
import { OperationsDrilldownPanel } from "../../screens/OperationsDrilldownPanel.jsx";
import { buildOperationsData, buildOperationsAttentionRows, filterOperationsAttentionRows, buildOperationsDashboardInsights, buildOperationsDrilldown, documentChecklistColumns } from "./operationsIntelligence.js";
import { exportRows } from "../../utils/formatters.js";
import { requestPrintPreview } from "../../utils/uiHelpers.js";
import { scrollToSection } from "../../utils/navigationScroll.js";

export function OperationsScreen({ view, notify, onNavigate, companyContext, api }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [queueFilter, setQueueFilter] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const [billing, inventory, accounting] = await Promise.all([
        api.getBillingData(companyContext),
        api.getInventoryData(companyContext),
        api.getAccountingData(companyContext)
      ]);
      setData(buildOperationsData(billing || {}, inventory || {}, accounting || {}));
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [view, companyContext?.company_id, companyContext?.company_scope]);

  if (loading || !data) return <section className="panel settings-panel report-panel"><EmptyState title="Loading operations data" note="Gathering order, procurement, billing, inventory and posting status." /></section>;

  if (view === "operations_dashboard") {
    const allAttentionRows = buildOperationsAttentionRows(data);
    const attentionRows = filterOperationsAttentionRows(allAttentionRows, queueFilter);
    const insightCards = buildOperationsDashboardInsights(allAttentionRows);
    const activeFilter = insightCards.find((card) => card.key === queueFilter);
    return (
      <section className="page operations-command-center">
        <div className="metric-grid profit-grid">
          <Metric label="Orders Received" value={data.orders.length} note="All active orders" icon="clipboard" onClick={() => onNavigate("supply_orders")} />
          <Metric label="Pending Procurement" value={data.pendingProcurement.length} note="Shortage or procurement pending" icon="cart" onClick={() => onNavigate("procurements")} />
          <Metric label="Pending Supply" value={data.pendingSupply.length} note="Not fully issued/supplied" icon="truck" onClick={() => onNavigate("order_lifecycle")} />
          <Metric label="Pending Billing" value={data.pendingBilling.length} note="Billed quantity/value pending" icon="file" onClick={() => onNavigate("invoices")} />
          <Metric label="Pending Collection" value={data.pendingPayment.length} note="Outstanding receivables" icon="wallet" onClick={() => onNavigate("payments")} />
          <Metric label="Pending GRNs" value={data.grnPending.length} note="Receipt completion pending" icon="box" onClick={() => onNavigate("grn_status")} />
          <Metric label="Missing Documents" value={data.missingDocuments.length} note="Checklist gaps" icon="file" onClick={() => onNavigate("missing_documents")} />
          <Metric label="Profitability Issues" value={data.profitabilityExceptions.length} note="Loss or missing basis" icon="trend" onClick={() => onNavigate("order_profitability_exceptions")} />
          <Metric label="Posting Errors" value={data.postingErrors.length} note="Operational posting issues" icon="shield" onClick={() => onNavigate("posting_control")} />
        </div>
        <div className="operations-insight-grid">
          {insightCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`operations-insight-card ${queueFilter === card.key ? "active" : ""}`}
              onClick={() => setQueueFilter(queueFilter === card.key ? "all" : card.key)}
            >
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </button>
          ))}
        </div>
        {queueFilter !== "all" && (
          <div className="operations-filter-bar">
            <span>Filtered by: <strong>{activeFilter?.label || queueFilter}</strong></span>
            <button type="button" className="ghost-btn subtle" onClick={() => setQueueFilter("all")}>Clear Filter</button>
          </div>
        )}
        <OperationsAttentionQueueTable
          title={queueFilter === "all" ? "Operations Attention Queue" : `Operations Attention Queue - ${activeFilter?.label || "Filtered"}`}
          rows={attentionRows}
          columns={[
            ["attention", "Attention"],
            ["order_number_display", "Order Number"],
            ["department_name_display", "Department"],
            ["invoice_number_display", "Invoice Number"],
            ["amount_display", "Amount"],
            ["status_display", "Status"],
            ["attention_reason", "Attention Reason"],
            ["recommended_action", "Next Recommended Action"]
          ]}
          onNavigate={onNavigate}
          onDrilldown={(row) => { setDrilldown(buildOperationsDrilldown(row, data)); scrollToSection(".operations-drilldown-panel"); }}
          onExport={() => exportRows(queueFilter === "all" ? "Operations Attention Queue" : `Operations Attention Queue - ${activeFilter?.label || "Filtered"}`, attentionRows)}
          onPrint={requestPrintPreview}
        />
        {drilldown && <OperationsDrilldownPanel drilldown={drilldown} onClose={() => { setDrilldown(null); scrollToSection(".operations-command-center", false); }} onNavigate={onNavigate} notify={notify} />}
      </section>
    );
  }

  const reportMap = {
    order_items: ["Order Item Grid", data.orderItems, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["item_description", "Description"],
      ["hsn_code", "HSN"],
      ["quantity_text", "Qty"],
      ["taxable_text", "Taxable"],
      ["gst_text", "GST"],
      ["gross_text", "Gross"],
      ["required_delivery_date", "Required Delivery"],
      ["billed_text", "Billed"]
    ]],
    order_lifecycle: ["Order Lifecycle Summary", data.lifecycle, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["reserved_qty", "Reserved"],
      ["procured_qty", "Procured"],
      ["received_qty", "Received"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["collected_text", "Collected"]
    ]],
    purchase_bills: ["Purchase Bills", data.purchaseBills, [
      ["purchase_invoice_number", "Purchase Bill"],
      ["order_number", "Order"],
      ["supplier_name", "Supplier"],
      ["purchase_date", "Date"],
      ["purchase_text", "Purchase"],
      ["procurement_status", "Procurement"],
      ["posting_status", "Posting"]
    ]],
    grn_status: ["GRN Status", data.grnRows, [
      ["purchase_bill", "Purchase Bill"],
      ["supplier_name", "Supplier"],
      ["item_name", "Item"],
      ["ordered_qty", "Ordered"],
      ["received_qty", "Received"],
      ["damaged_qty", "Damaged"],
      ["accepted_qty", "Accepted"],
      ["warehouse_name", "Warehouse"],
      ["status", "GRN Status"]
    ]],
    expense_posting_status: ["Expense Posting Status", data.expensePosting, [
      ["reference", "Expense"],
      ["order_number", "Order"],
      ["record_date", "Date"],
      ["amount_text", "Amount"],
      ["posting_status", "Posting"],
      ["voucher_number", "Voucher"],
      ["posting_error", "Posting Error"]
    ]],
    billing_pending: ["Billing Pending", data.pendingBilling, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["billed_qty", "Billed"],
      ["balance_qty", "Balance"],
      ["status_text", "Status"]
    ]],
    order_documents: ["Order Documents", data.documentChecklist.filter((row) => ["Supply Order", "Work Order", "OEM Authorization"].includes(row.document_type)), documentChecklistColumns()],
    invoice_documents: ["Invoice Documents", data.documentChecklist.filter((row) => ["Delivery Challan", "Installation Report", "CRAC", "Invoice Copy"].includes(row.document_type)), documentChecklistColumns()],
    payment_documents: ["Payment Documents", data.documentChecklist.filter((row) => row.document_type === "Payment Proof"), documentChecklistColumns()],
    missing_documents: ["Missing Documents", data.missingDocuments, documentChecklistColumns()],
    pending_procurement: ["Pending Procurement Report", data.pendingProcurement, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["ordered_qty", "Ordered"],
      ["procured_qty", "Procured"],
      ["balance_qty", "Required"],
      ["status_text", "Status"]
    ]],
    pending_billing: ["Pending Billing Report", data.pendingBilling, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["ordered_qty", "Ordered"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["balance_qty", "Balance"]
    ]],
    pending_payment: ["Pending Payment Report", data.pendingPayment, [
      ["invoice_number", "Invoice"],
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["invoice_text", "Invoice Value"],
      ["received_text", "Received"],
      ["outstanding_text", "Outstanding"],
      ["status", "Status"]
    ]],
    order_posting_status_report: ["Order Posting Status Report", data.postingStatus, [
      ["module", "Module"],
      ["reference", "Reference"],
      ["record_date", "Date"],
      ["amount_text", "Amount"],
      ["posting_status", "Posting"],
      ["voucher_number", "Voucher"],
      ["posting_error", "Error"]
    ]],
    stock_issue_vs_billing: ["Stock Issue vs Billing Reconciliation", data.stockIssueVsBilling, [
      ["order_number", "Order"],
      ["item_name", "Item"],
      ["issued_qty", "Issued"],
      ["billed_qty", "Billed"],
      ["difference_qty", "Difference"],
      ["status_text", "Status"]
    ]],
    order_profitability_exceptions: ["Order Profitability Exception Report", data.profitabilityExceptions, [
      ["order_number", "Order"],
      ["department_name", "Department"],
      ["billing_text", "Billing"],
      ["cost_text", "Cost"],
      ["profit_text", "Net Profit"],
      ["roi_text", "ROI"],
      ["status_text", "Exception"]
    ]],
    grn_pending_report: ["GRN Pending Report", data.grnPending, [
      ["purchase_bill", "Purchase Bill"],
      ["supplier_name", "Supplier"],
      ["item_name", "Item"],
      ["accepted_qty", "Accepted"],
      ["status", "Status"]
    ]]
  };

  const documentReportViews = new Set(["order_documents", "invoice_documents", "payment_documents", "missing_documents", "purchase_bills"]);
  const [title, rows, columns] = reportMap[view] || ["Operations Report", [], []];
  return (
    <>
      {documentReportViews.has(view) && (
        <section className="panel operations-upload-panel">
          <div>
            <h2>Upload Documents</h2>
            <p>Open Document Center to attach PDF, image, Excel or CSV files to orders, invoices, payments and procurement records.</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => onNavigate?.("documents")}>Open Document Center</button>
        </section>
      )}
      <OperationsAttentionQueueTable
        title={title}
        rows={rows}
        columns={columns}
        onNavigate={onNavigate}
        onDrilldown={(row) => { setDrilldown(buildOperationsDrilldown(row, data)); scrollToSection(".operations-drilldown-panel"); }}
        onExport={() => exportRows(title, rows)}
        onPrint={requestPrintPreview}
      />
      {drilldown && <OperationsDrilldownPanel drilldown={drilldown} onClose={() => { setDrilldown(null); scrollToSection(".operations-command-center", false); }} onNavigate={onNavigate} notify={notify} />}
    </>
  );
}
