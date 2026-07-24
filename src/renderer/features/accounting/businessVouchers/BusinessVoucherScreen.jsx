import { useEffect, useState } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { roleAllowsAction } from "../../../components/helpProductivity/index.jsx";
import { EmptyState } from "../../../components/common.jsx";
import { Field, SearchableSelect, SelectBox, SelectField } from "../../../components/forms/index.jsx";
import { QuickCreateMasterDialog, quickCreateRecords } from "../../../components/overlays/index.jsx";
import { VoucherLearnDialog } from "../../../components/panels/SmallComponents.jsx";
import { BusinessVoucherIntelligencePanel } from "./BusinessVoucherIntelligencePanel.jsx";
import { businessVoucherPreview, businessVoucherValidationMessages } from "./businessVoucherUtils.js";
import { confirmAction, postConfirmOptions, approveConfirmOptions } from "../../../utils/actionUtils.js";
import { SmartEntityPicker } from "../../../components/entityPicker/SmartEntityPicker.jsx";

function splitGrossByGst(grossAmount, gstRate) {
  const rate = Number(gstRate) || 0;
  if (!rate) return { taxable: Number(grossAmount) || 0, gst: 0 };
  const gross = Number(grossAmount) || 0;
  const gst = Math.round((gross * rate / (100 + rate)) * 100) / 100;
  return { taxable: Math.round((gross - gst) * 100) / 100, gst };
}

function normalizeStatusClass(status) {
  if (!status) return "";
  const s = String(status).toLowerCase();
  if (s.includes("open") || s.includes("active") || s.includes("approved") || s.includes("posted")) return "active";
  if (s.includes("pending") || s.includes("draft") || s.includes("review")) return "warn";
  if (s.includes("closed") || s.includes("locked") || s.includes("reversed") || s.includes("rejected")) return "danger";
  return "";
}

export function BusinessVoucherScreen({ notify, onNavigate, role, requestedVoucherKind, companyContext, api }) {
  const today = new Date().toISOString().slice(0, 10);
  const businessVoucherWorkflows = [
    ["receipt", "Receipt Voucher", "Department receipt with TDS/GST TDS deductions"],
    ["supplier_payment", "Supplier Payment Voucher", "Payment against supplier bills or advances"],
    ["sales", "Sales Voucher", "Taxable billing with output GST"],
    ["purchase", "Purchase Voucher", "Inventory or purchase booking with input GST"],
    ["expense", "Expense Voucher", "Authorization, L1, transport, installation or other costs"],
    ["commission", "Work Incentive Voucher", "Percentage-based work incentive expense"],
    ["employee_incentive", "Employee Incentive Voucher", "Employee incentive accrual or payment"],
    ["contra", "Contra Voucher", "Cash/bank transfer between ledgers"],
    ["credit_note", "Credit Note", "Reduce department receivable and sales/GST"],
    ["debit_note", "Debit Note", "Reduce supplier payable or purchase/GST"]
  ];
  const originationDocuments = [
    ["supply_orders", "Work Order / Supply Order", "Root commercial document for procurement, stock, billing, receipt and profitability."]
  ];
  const accountingVoucherWorkflows = [
    ["manual_voucher", "Advanced Journal Entry", "Accountant-controlled debit and credit voucher", "manual_voucher"],
    ["gst_adjustment", "GST Adjustment", "GST correction through controlled journal entry", "manual_voucher"],
    ["opening_balance_voucher", "Opening Balance Voucher", "Create controlled opening balance entries", "opening_balances"],
    ["year_end_voucher", "Year End Voucher", "Close year and carry forward balances", "year_end_closing"],
    ["reversal_voucher", "Reversal Voucher", "Reverse posted vouchers through audit-controlled workflow", "voucher_register"]
  ];
  const workflows = businessVoucherWorkflows;
  const [data, setData] = useState(null);
  const [lastPostedVoucher, setLastPostedVoucher] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    voucher_kind: "receipt",
    voucher_date: today,
    amount: "",
    taxable_value: "",
    gst_rate: "18",
    gst_amount: "",
    billing_value: "",
    purchase_value: "",
    item_id: "",
    item_hsn: "",
    item_unit: "Nos",
    warehouse_id: "",
    quantity: "",
    damaged_quantity: "",
    accepted_quantity: "",
    rate: "",
    commission_percentage: "10",
    incentive_percentage: "15",
    initial_profit: "",
    tds_deducted: "",
    gst_tds_deducted: "",
    other_deduction: "",
    department_id: "",
    supplier_id: "",
    employee_id: "",
    bank_account_id: "",
    payment_mode: "Bank",
    reference_number: "",
    invoice_number: "",
    purchase_invoice_number: "",
    expense_head_name: "Transport",
    paid_status: "unpaid",
    inventory_enabled: "1",
    from_account_id: "",
    to_account_id: "",
    order_id: "",
    manual_order_number: "",
    linked_invoice_id: "",
    linked_purchase_id: "",
    allocation_amount: "",
    reason_code: "",
    authorize_excess: false,
    narration: ""
  });
  const [quickCreate, setQuickCreate] = useState(null);
  const [learnVoucherOpen, setLearnVoucherOpen] = useState(false);

  useEffect(() => {
    const preferred = requestedVoucherKind || window.__giiGemPreferredVoucherKind;
    if (preferred && workflows.some(([key]) => key === preferred)) {
      setForm((current) => ({ ...current, voucher_kind: preferred }));
      window.__giiGemPreferredVoucherKind = "";
    }
    function applyVoucherKind(event) {
      const kind = event.detail;
      if (kind && workflows.some(([key]) => key === kind)) {
        setForm((current) => ({ ...current, voucher_kind: kind }));
      }
    }
    window.addEventListener("gii-gem-voucher-kind", applyVoucherKind);
    return () => window.removeEventListener("gii-gem-voucher-kind", applyVoucherKind);
  }, [requestedVoucherKind]);

  async function load(companyId = companyContext?.company_id || form.company_id) {
    try {
      const result = await api.getAccountingData(companyId ? { company_id: companyId } : {});
      setData(result);
      if (companyId && String(form.company_id || "") !== String(companyId)) setForm((current) => ({ ...current, company_id: companyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load(companyContext?.company_id);
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    if (companyContext?.company_id && String(form.company_id || "") !== String(companyContext.company_id)) {
      setForm((current) => ({ ...current, company_id: companyContext.company_id }));
    }
  }, [companyContext?.company_id, form.company_id]);

  const selectedWorkflow = workflows.find(([key]) => key === form.voucher_kind) || workflows[0];
  const accounts = (data?.accounts || []).map((account) => [account.id, `${account.account_code} - ${account.account_name}`]);
  const bankOptions = (data?.banks || []).map((bank) => [bank.id, `${bank.bank_account_name}${bank.bank_name ? ` / ${bank.bank_name}` : ""}`]);
  const supplierOptions = (data?.suppliers || data?.references?.suppliers || []).map((row) => [row.id, row.supplier_name]);
  const previewLines = businessVoucherPreview(form, data || {});
  const orderOptions = (data?.references?.orders || []).map((row) => [row.id, row.order_number || `Order #${row.id}`, [row.department_name, row.institution_name, row.location].filter(Boolean).join(" / ")]);
  const selectedOrder = (data?.references?.orders || []).find((row) => String(row.id) === String(form.order_id) || String(row.order_number) === String(form.order_id));
  const selectedInvoice = (data?.billWiseReceivables || []).find((row) => String(row.billing_id || row.id) === String(form.linked_invoice_id));
  const selectedPurchaseBill = (data?.billWisePayables || []).find((row) => String(row.procurement_id || row.id) === String(form.linked_purchase_id));
  const departmentInvoices = (data?.billWiseReceivables || [])
    .filter((row) => !form.department_id || String(row.department_id) === String(form.department_id))
    .filter((row) => Number(row.balance_outstanding || 0) > 0);
  const supplierBills = (data?.billWisePayables || [])
    .filter((row) => !form.supplier_id || String(row.supplier_id) === String(form.supplier_id))
    .filter((row) => Number(row.balance_due || row.balance_outstanding || 0) > 0);
  const orderInvoices = (data?.billWiseReceivables || []).filter((row) => selectedOrder && row.order_number === selectedOrder.order_number);
  const orderPurchases = (data?.billWisePayables || []).filter((row) => selectedOrder && row.order_number === selectedOrder.order_number);
  const orderBillingValue = orderInvoices.reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
  const orderPurchaseValue = orderPurchases.reduce((sum, row) => sum + Number(row.invoice_amount || row.purchase_value || 0), 0);
  const selectedItem = (data?.references?.items || []).find((row) => String(row.id) === String(form.item_id));
  const validationMessages = businessVoucherValidationMessages({ form, selectedInvoice, selectedPurchaseBill, selectedOrder, previewLines });
  const cashSettlementKinds = ["receipt", "supplier_payment"];
  const accrualExpenseKinds = ["expense", "commission", "employee_incentive"];
  const isPaidAccrualVoucher = accrualExpenseKinds.includes(form.voucher_kind) && form.paid_status === "paid";
  const needsCashBank = cashSettlementKinds.includes(form.voucher_kind) || isPaidAccrualVoucher;
  const needsPaymentMode = needsCashBank;
  const needsReference = needsCashBank;
  const customerKinds = ["receipt", "sales", "credit_note"];
  const supplierKinds = ["supplier_payment", "purchase", "debit_note"];
  const salesLikeKinds = ["sales", "credit_note"];
  const noteLikeKinds = ["credit_note", "debit_note"];
  const taxableLabel = form.voucher_kind === "sales" ? "Sales Taxable Value" : form.voucher_kind === "credit_note" ? "Credit Note Taxable Value" : form.voucher_kind === "debit_note" ? "Debit Note Taxable Value" : "Taxable Value";
  const invoiceLabel = form.voucher_kind === "credit_note" ? "Original / Credit Note Invoice Number" : "Invoice Number";
  const purchaseInvoiceLabel = form.voucher_kind === "debit_note" ? "Original / Debit Note Purchase Invoice Number" : "Purchase Invoice Number";
  const amountLabel = form.voucher_kind === "receipt" ? "Receipt Amount" : form.voucher_kind === "supplier_payment" ? "Payment Amount" : form.voucher_kind === "contra" ? "Transfer Amount" : "Amount";

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSalesLine(patch = {}) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const quantity = Number(next.quantity || 0);
      const rate = Number(next.rate || 0);
      if (["sales", "credit_note"].includes(next.voucher_kind) && quantity > 0 && rate >= 0) {
        next.taxable_value = String(quantity * rate);
      }
      return next;
    });
  }

  function applyVoucherItem(value) {
    const item = (data?.references?.items || []).find((row) => String(row.id) === String(value));
    setForm((current) => ({
      ...current,
      item_id: value,
      gst_rate: item?.gst_rate ?? current.gst_rate,
      item_hsn: item?.hsn_code || current.item_hsn || "",
      item_unit: item?.unit || current.item_unit || "Nos"
    }));
  }

  function nextManualOrderReference() {
    const year = new Date(form.voucher_date || today).getFullYear();
    const count = (data?.references?.orders || []).length + 1;
    setValue("manual_order_number", `ORD-${year}-${String(count).padStart(5, "0")}`);
  }

  function applyOrder(value) {
    const order = (data?.references?.orders || []).find((row) => String(row.id) === String(value) || String(row.order_number) === String(value));
    const billingTotal = (data?.billWiseReceivables || []).filter((row) => order && row.order_number === order.order_number).reduce((sum, row) => sum + Number(row.invoice_amount || 0), 0);
    const purchaseTotal = (data?.billWisePayables || []).filter((row) => order && row.order_number === order.order_number).reduce((sum, row) => sum + Number(row.invoice_amount || row.purchase_value || 0), 0);
    setForm((current) => ({
      ...current,
      order_id: value,
      department_id: order?.department_id || current.department_id,
      billing_value: billingTotal || current.billing_value,
      purchase_value: purchaseTotal || current.purchase_value,
      manual_order_number: order?.order_number || current.manual_order_number,
      narration: current.narration || (order?.order_number ? `Against order ${order.order_number}` : "")
    }));
  }

  function applyInvoice(row, mode = "full") {
    const balance = Number(row.balance_outstanding || 0);
    const allocation = mode === "full" ? balance : Number(form.allocation_amount || form.amount || 0);
    setForm((current) => {
      const isCreditNote = current.voucher_kind === "credit_note";
      const noteSplit = isCreditNote ? splitGrossByGst(allocation, current.gst_rate || 18) : null;
      return {
        ...current,
        linked_invoice_id: row.billing_id || row.id,
        department_id: row.department_id || current.department_id,
        invoice_number: row.invoice_number || current.invoice_number,
        order_id: row.order_id || current.order_id,
        amount: String(allocation),
        allocation_amount: String(allocation),
        taxable_value: isCreditNote ? String(noteSplit.taxable) : current.taxable_value,
        gst_amount: isCreditNote ? String(noteSplit.gst) : current.gst_amount,
        gst_rate: isCreditNote ? String(current.gst_rate || 18) : current.gst_rate,
        reason_code: isCreditNote ? (current.reason_code || "Rate Difference") : current.reason_code,
        reference_number: isCreditNote ? (current.reference_number || `CN-${row.invoice_number || row.billing_id || row.id}`) : current.reference_number,
        narration: current.narration || `${isCreditNote ? "Credit note" : "Against"} invoice ${row.invoice_number || ""}`.trim()
      };
    });
  }

  function applyPurchaseBill(row, mode = "full") {
    const balance = Number(row.balance_due || row.balance_outstanding || 0);
    const allocation = mode === "full" ? balance : Number(form.allocation_amount || form.amount || 0);
    setForm((current) => {
      const isDebitNote = current.voucher_kind === "debit_note";
      const noteSplit = isDebitNote ? splitGrossByGst(allocation, current.gst_rate || 18) : null;
      return {
        ...current,
        linked_purchase_id: row.procurement_id || row.id,
        supplier_id: row.supplier_id || current.supplier_id,
        purchase_invoice_number: row.purchase_invoice_number || current.purchase_invoice_number,
        order_id: row.order_id || current.order_id,
        amount: String(allocation),
        allocation_amount: String(allocation),
        taxable_value: isDebitNote ? String(noteSplit.taxable) : current.taxable_value,
        gst_amount: isDebitNote ? String(noteSplit.gst) : current.gst_amount,
        gst_rate: isDebitNote ? String(current.gst_rate || 18) : current.gst_rate,
        reason_code: isDebitNote ? (current.reason_code || "Rate Difference") : current.reason_code,
        reference_number: isDebitNote ? (current.reference_number || `DN-${row.purchase_invoice_number || row.procurement_id || row.id}`) : current.reference_number,
        narration: current.narration || `${isDebitNote ? "Debit note" : "Against"} purchase bill ${row.purchase_invoice_number || ""}`.trim()
      };
    });
  }

  function applyAutoAmount(kind) {
    if (kind === "commission") {
      const commission = Number(form.billing_value || orderBillingValue || 0) * Number(form.commission_percentage || 0) / 100;
      setValue("amount", String(commission));
    }
    if (kind === "employee_incentive") {
      const incentive = Number(form.initial_profit || 0) * Number(form.incentive_percentage || 0) / 100;
      setValue("amount", String(incentive));
    }
  }

  function openQuickCreate(type, field, defaults = {}) {
    if (!roleAllowsAction(role, "new")) {
      confirmAction({
        title: "Permission Required",
        message: "You do not have permission to create master records. Please contact administrator.",
        confirmLabel: "OK",
        hideCancel: true
      });
      return;
    }
    setQuickCreate({ type, field, defaults });
  }

  async function handleQuickCreated(type, saved, request) {
    const field = request?.field;
    const valueMap = {
      department: saved.id,
      supplier: saved.id,
      employee: saved.id,
      bank: saved.id,
      item: saved.id,
      warehouse: saved.id,
      expense_head: saved.expense_head_name,
      ledger_account: saved.id
    };
    if (field && Object.prototype.hasOwnProperty.call(valueMap, type)) {
      if (type === "item") {
        setForm((current) => ({
          ...current,
          [field]: valueMap[type],
          gst_rate: saved.gst_rate ?? current.gst_rate,
          item_hsn: saved.hsn_code || current.item_hsn || "",
          item_unit: saved.unit || current.item_unit || "Nos"
        }));
      } else {
        setValue(field, valueMap[type]);
      }
    }
    await load(form.company_id);
  }

  async function submit(event) {
    event.preventDefault();
    const action = event.nativeEvent?.submitter?.value || "draft";
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving a business voucher.");
      if (form.company_id && String(form.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and voucher company do not match.");
      const blocking = businessVoucherValidationMessages({ form, selectedInvoice, selectedPurchaseBill, selectedOrder, previewLines }).filter((message) => message.severity === "error");
      if (blocking.length) throw new Error(blocking[0].message);
      const voucher = await api.createBusinessVoucher({
        ...form,
        company_id: Number(companyContext.company_id),
        department_id: form.department_id ? Number(form.department_id) : null,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        employee_id: form.employee_id ? Number(form.employee_id) : null,
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
        from_account_id: form.from_account_id ? Number(form.from_account_id) : null,
        to_account_id: form.to_account_id ? Number(form.to_account_id) : null,
        inventory_enabled: form.inventory_enabled === "1"
      });
      if (action === "submit") {
        await api.updateGuidedVoucherStatus(voucher.id, "submit", 1, "Submitted from guided voucher entry");
        notify("Guided voucher saved and submitted for review");
      } else if (action === "post") {
        const confirmed = await confirmAction({
          ...postConfirmOptions("guided_vouchers", voucher.id),
          message: "Do you want to approve and post this guided voucher now? This will create ledger entries and may lock the transaction from direct editing.",
          confirmLabel: "Yes, Approve & Post",
          cancelLabel: "No, Keep Draft"
        });
        if (confirmed.confirmed) {
          await api.updateGuidedVoucherStatus(voucher.id, "submit", 1, "Admin fast-track submit");
          await api.updateGuidedVoucherStatus(voucher.id, "review", 1, "Admin fast-track review");
          await api.updateGuidedVoucherStatus(voucher.id, "approve", 1, "Admin fast-track approval");
          const posted = await api.postGuidedVoucher(voucher.id, 1);
          setLastPostedVoucher(posted);
          notify(`Guided voucher posted: ${posted.voucher_number}`);
        } else {
          notify(`Guided voucher saved as ${voucher.status}`);
        }
      } else {
        notify(`Guided voucher saved as ${voucher.status}. Submit, approve and post it from the queue below.`);
      }
      setForm((current) => ({
        ...current,
        amount: "",
        taxable_value: "",
        gst_amount: "",
        billing_value: "",
        purchase_value: "",
        manual_order_number: "",
        item_hsn: "",
        item_unit: "Nos",
        initial_profit: "",
        tds_deducted: "",
        gst_tds_deducted: "",
        other_deduction: "",
        reference_number: "",
        invoice_number: "",
        purchase_invoice_number: "",
        narration: ""
      }));
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function guidedAction(id, action) {
    try {
      if (action === "post") {
        const confirmed = await confirmAction(postConfirmOptions("guided_vouchers", id));
        if (!confirmed.confirmed) return;
        const voucher = await api.postGuidedVoucher(id, 1);
        setLastPostedVoucher(voucher);
        notify(`Guided voucher posted: ${voucher.voucher_number}`);
      } else {
        if (action === "approve") {
          const confirmed = await confirmAction(approveConfirmOptions("guided_vouchers", id));
          if (!confirmed.confirmed) return;
        }
        const row = await api.updateGuidedVoucherStatus(id, action, 1, "");
        notify(`Guided voucher moved to ${row.status}`);
      }
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function guidedPostNow(id) {
    try {
      const confirmed = await confirmAction({
        ...postConfirmOptions("guided_vouchers", id),
        message: "Do you want to move this guided voucher through review, approval and posting now? This will create ledger entries.",
        confirmLabel: "Yes, Approve & Post",
        cancelLabel: "No, Cancel"
      });
      if (!confirmed.confirmed) return;
      const current = (data?.guidedVouchers || []).find((row) => Number(row.id) === Number(id));
      if (!current) throw new Error("Guided voucher not found in the queue");
      if (current.status === "Draft") await api.updateGuidedVoucherStatus(id, "submit", 1, "Admin fast-track submit");
      if (["Draft", "Pending Review"].includes(current.status)) await api.updateGuidedVoucherStatus(id, "review", 1, "Admin fast-track review");
      if (["Draft", "Pending Review", "Pending Approval"].includes(current.status)) await api.updateGuidedVoucherStatus(id, "approve", 1, "Admin fast-track approval");
      const posted = await api.postGuidedVoucher(id, 1);
      setLastPostedVoucher(posted);
      notify(`Guided voucher posted: ${posted.voucher_number}`);
      await load(form.company_id);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="voucher-layout">
      <form className="panel entry-form voucher-form" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Voucher Dashboard</h2>
            <p>Start from Work Order / Supply Order, then post downstream business and accounting vouchers.</p>
          </div>
        </div>
        <div className="voucher-selector-section origination-section">
          <div className="voucher-section-head">
            <span>Origination Documents</span>
            <small>Start the GII business file here before procurement, stock, billing, receipts and ledger posting.</small>
          </div>
          <div className="voucher-type-grid origination-voucher-grid">
            {originationDocuments.map(([targetView, label, note]) => (
              <button key={targetView} type="button" title={note} onClick={() => onNavigate?.(targetView)}>
                {label}
              </button>
            ))}
          </div>
          <div className="voucher-flow-path">
            <span>Work Order / Supply Order</span>
            <span>Procurement</span>
            <span>Stock</span>
            <span>Billing</span>
            <span>Receipt</span>
            <span>Vouchers</span>
            <span>Reports</span>
          </div>
        </div>
        <div className="voucher-selector-section">
          <div className="voucher-section-head">
            <span>Business Vouchers</span>
            <small>Routine operational entries for supply, billing, payments and expenses.</small>
          </div>
          <div className="voucher-type-grid">
            {businessVoucherWorkflows.map(([key, label]) => (
              <button key={key} type="button" className={form.voucher_kind === key ? "active" : ""} onClick={() => setValue("voucher_kind", key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="voucher-selector-section accountant-section">
          <div className="voucher-section-head">
            <span>Accounting Vouchers</span>
            <small>Use for accountant-controlled corrections, opening entries, year-end and reversals.</small>
          </div>
          <div className="voucher-type-grid accounting-voucher-grid">
            {accountingVoucherWorkflows.map(([key, label, note, targetView]) => (
              <button key={key} type="button" className="accounting-voucher-btn" title={note} onClick={() => onNavigate?.(targetView)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="workflow-note">
          <strong>Selected business workflow</strong>
          <span>{selectedWorkflow[1]} - {selectedWorkflow[2]}</span>
        </div>
        <BusinessVoucherIntelligencePanel
          form={form}
          data={data || {}}
          selectedWorkflow={selectedWorkflow}
          selectedOrder={selectedOrder}
          selectedInvoice={selectedInvoice}
          selectedPurchaseBill={selectedPurchaseBill}
          departmentInvoices={departmentInvoices}
          supplierBills={supplierBills}
          orderInvoices={orderInvoices}
          orderPurchases={orderPurchases}
          selectedItem={selectedItem}
          validationMessages={validationMessages}
          onApplyInvoice={applyInvoice}
          onApplyPurchaseBill={applyPurchaseBill}
          onAutoAmount={applyAutoAmount}
          onLearn={() => setLearnVoucherOpen(true)}
        />
        <div className="form-grid">
          <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={(data?.companies || []).map((company) => [company.id, company.company_name])} />
          <Field name="voucher_date" label="Voucher Date" type="date" value={form.voucher_date} onChange={(value) => setValue("voucher_date", value)} />
          {form.voucher_kind !== "contra" && <SmartEntityPicker entityType="supply_order" api={api} role={role} companyId={companyContext?.company_id} value={form.order_id} onChange={applyOrder} onQuickCreate={(type, defaults) => openQuickCreate(type, "order_id", defaults)} />}
          {form.voucher_kind !== "contra" && (
            <label className="field">
              Order Reference
              <div className="field-with-action">
                <input
                  type="text"
                  value={form.manual_order_number}
                  onChange={(event) => setValue("manual_order_number", event.target.value)}
                  placeholder="Auto next or enter manually"
                />
                <button type="button" className="ghost-btn" onClick={nextManualOrderReference}>Auto Next</button>
              </div>
            </label>
          )}
          {needsCashBank && <SmartEntityPicker entityType="bank" api={api} role={role} companyId={companyContext?.company_id} value={form.bank_account_id} onChange={(value) => setValue("bank_account_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "bank_account_id", defaults)} />}
          {needsPaymentMode && <SelectField label="Payment Mode" value={form.payment_mode} onChange={(value) => setValue("payment_mode", value)} options={["Bank", "Cash"]} />}
          {customerKinds.includes(form.voucher_kind) && <SmartEntityPicker entityType="department" api={api} role={role} companyId={companyContext?.company_id} value={form.department_id} onChange={(value) => setValue("department_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "department_id", defaults)} />}
          {supplierKinds.includes(form.voucher_kind) && <SmartEntityPicker entityType="supplier" api={api} role={role} companyId={companyContext?.company_id} value={form.supplier_id} onChange={(value) => setValue("supplier_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "supplier_id", defaults)} />}
          {form.voucher_kind === "employee_incentive" && <SmartEntityPicker entityType="employee" api={api} role={role} companyId={companyContext?.company_id} value={form.employee_id} onChange={(value) => setValue("employee_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "employee_id", defaults)} />}
          {form.voucher_kind === "contra" && <SmartEntityPicker entityType="ledger" api={api} role={role} companyId={companyContext?.company_id} value={form.from_account_id} onChange={(value) => setValue("from_account_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "from_account_id", defaults)} />}
          {form.voucher_kind === "contra" && <SmartEntityPicker entityType="ledger" api={api} role={role} companyId={companyContext?.company_id} value={form.to_account_id} onChange={(value) => setValue("to_account_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "to_account_id", defaults)} />}
          {["sales", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="taxable_value" label={taxableLabel} type="number" value={form.taxable_value} onChange={(value) => setValue("taxable_value", value)} />}
          {["sales", "purchase", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="gst_rate" label="GST Rate %" type="number" value={form.gst_rate} onChange={(value) => setValue("gst_rate", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="purchase_value" label="Purchase Value" type="number" value={form.purchase_value} onChange={(value) => setValue("purchase_value", value)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SelectField label="Inventory Posting" value={form.inventory_enabled} onChange={(value) => setValue("inventory_enabled", value)} options={[["1", "Inventory + Accounting"], ["0", "Accounting Only"]]} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SmartEntityPicker entityType="item" api={api} role={role} companyId={companyContext?.company_id} value={form.item_id} onChange={applyVoucherItem} onQuickCreate={(type, defaults) => openQuickCreate(type, "item_id", defaults)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <SmartEntityPicker entityType="warehouse" api={api} role={role} companyId={companyContext?.company_id} value={form.warehouse_id} onChange={(value) => setValue("warehouse_id", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "warehouse_id", defaults)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && (
            <label className="field">
              HSN
              <input type="text" value={form.item_hsn || selectedItem?.hsn_code || ""} readOnly placeholder="Select item to auto-fill" />
            </label>
          )}
          {["sales", "purchase"].includes(form.voucher_kind) && (
            <label className="field">
              Unit
              <input type="text" value={form.item_unit || selectedItem?.unit || "Nos"} readOnly />
            </label>
          )}
          {["sales", "purchase"].includes(form.voucher_kind) && <Field name="quantity" label={form.voucher_kind === "sales" ? "Quantity to Issue" : "Quantity Received"} type="number" value={form.quantity} onChange={(value) => form.voucher_kind === "sales" ? updateSalesLine({ quantity: value }) : setValue("quantity", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="damaged_quantity" label="Damaged Quantity" type="number" value={form.damaged_quantity} onChange={(value) => setValue("damaged_quantity", value)} />}
          {["purchase"].includes(form.voucher_kind) && <Field name="accepted_quantity" label="Accepted Quantity" type="number" value={form.accepted_quantity} onChange={(value) => setValue("accepted_quantity", value)} />}
          {["sales", "purchase"].includes(form.voucher_kind) && <Field name="rate" label={form.voucher_kind === "sales" ? "Billing Rate" : "Receipt Rate"} type="number" value={form.rate} onChange={(value) => form.voucher_kind === "sales" ? updateSalesLine({ rate: value }) : setValue("rate", value)} />}
          {["expense"].includes(form.voucher_kind) && <SmartEntityPicker entityType="expense_head" api={api} role={role} companyId={companyContext?.company_id} value={form.expense_head_name} onChange={(value) => setValue("expense_head_name", value)} onQuickCreate={(type, defaults) => openQuickCreate(type, "expense_head_name", defaults)} />}
          {["commission"].includes(form.voucher_kind) && <Field name="billing_value" label="Billing Value" type="number" value={form.billing_value} onChange={(value) => setValue("billing_value", value)} />}
          {["commission"].includes(form.voucher_kind) && <Field name="commission_percentage" label="Work Incentive %" type="number" value={form.commission_percentage} onChange={(value) => setValue("commission_percentage", value)} />}
          {["employee_incentive"].includes(form.voucher_kind) && <Field name="initial_profit" label="Initial Profit" type="number" value={form.initial_profit} onChange={(value) => setValue("initial_profit", value)} />}
          {["employee_incentive"].includes(form.voucher_kind) && <Field name="incentive_percentage" label="Incentive %" type="number" value={form.incentive_percentage} onChange={(value) => setValue("incentive_percentage", value)} />}
          {!["sales", "purchase", "commission", "employee_incentive", "credit_note", "debit_note"].includes(form.voucher_kind) && <Field name="amount" label={amountLabel} type="number" value={form.amount} onChange={(value) => setValue("amount", value)} />}
          {form.voucher_kind === "receipt" && <Field name="tds_deducted" label="TDS Deducted" type="number" value={form.tds_deducted} onChange={(value) => setValue("tds_deducted", value)} />}
          {form.voucher_kind === "receipt" && <Field name="gst_tds_deducted" label="GST TDS Deducted" type="number" value={form.gst_tds_deducted} onChange={(value) => setValue("gst_tds_deducted", value)} />}
          {form.voucher_kind === "receipt" && <Field name="other_deduction" label="Other Deduction" type="number" value={form.other_deduction} onChange={(value) => setValue("other_deduction", value)} />}
          {salesLikeKinds.includes(form.voucher_kind) && <Field name="invoice_number" label={invoiceLabel} type="text" value={form.invoice_number} onChange={(value) => setValue("invoice_number", value)} />}
          {["purchase", "debit_note"].includes(form.voucher_kind) && <Field name="purchase_invoice_number" label={purchaseInvoiceLabel} type="text" value={form.purchase_invoice_number} onChange={(value) => setValue("purchase_invoice_number", value)} />}
          {["expense", "commission", "employee_incentive"].includes(form.voucher_kind) && <SelectField label="Paid Status" value={form.paid_status} onChange={(value) => setValue("paid_status", value)} options={["unpaid", "paid"]} />}
          {noteLikeKinds.includes(form.voucher_kind) && <SelectField label="Reason Code" value={form.reason_code || "Rate Difference"} onChange={(value) => setValue("reason_code", value)} options={form.voucher_kind === "credit_note" ? ["Rate Difference", "Quantity Difference", "Return", "Billing Error", "Discount", "Other"] : ["Rate Difference", "Quantity Difference", "Supplier Return", "Purchase Error", "Other"]} />}
          {noteLikeKinds.includes(form.voucher_kind) && <Field name="reference_number" label="Note Reference" type="text" value={form.reference_number} onChange={(value) => setValue("reference_number", value)} />}
          {needsReference && <Field name="reference_number" label={form.payment_mode === "Cash" ? "Cash Receipt / Payment Reference" : "Reference / UTR"} type="text" value={form.reference_number} onChange={(value) => setValue("reference_number", value)} />}
          <Field name="narration" label="Narration" type="textarea" value={form.narration} onChange={(value) => setValue("narration", value)} />
        </div>
        {validationMessages.length > 0 && (
          <div className="voucher-validation-list">
            {validationMessages.map((message) => <span key={message.message} className={message.severity === "error" ? "warning-line" : "ok-line"}>{message.message}</span>)}
          </div>
        )}
        {validationMessages.some((message) => message.severity === "error" && /exceed|excess/i.test(message.message)) && (
          <label className="billing-excess-check">
            <input type="checkbox" checked={Boolean(form.authorize_excess)} onChange={(event) => setValue("authorize_excess", event.target.checked)} />
            Authorize controlled excess for this voucher
          </label>
        )}
        <div className="button-row guided-save-actions">
          <button className="ghost-btn" name="guided_action" value="draft">Save Draft</button>
          <button className="ghost-btn" name="guided_action" value="submit">Save & Submit</button>
          <button className="primary-btn" name="guided_action" value="post">Save, Approve & Post</button>
        </div>
      </form>
      {quickCreate && (
        <QuickCreateMasterDialog
          request={quickCreate}
          records={quickCreateRecords(quickCreate.type, { references: data?.references || {}, accounts: data?.accounts || [], departments: data?.departments || [], suppliers: supplierOptions, employees: data?.employees || [], banks: data?.banks || [] })}
          context={{ company_id: form.company_id, source_module: "voucher_dashboard" }}
          role={role}
          notify={notify}
          api={api}
          onClose={() => setQuickCreate(null)}
          onCreated={handleQuickCreated}
        />
      )}
      {learnVoucherOpen && <VoucherLearnDialog kind={form.voucher_kind} onClose={() => setLearnVoucherOpen(false)} />}
      <aside className="panel entry-form">
        <div className="panel-head">
          <div>
            <h2>Voucher Preview</h2>
            <p>System-generated debit and credit effect before posting.</p>
          </div>
        </div>
        {previewLines.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ledger</th><th>Debit</th><th>Credit</th></tr></thead>
              <tbody>
                {previewLines.map((line, index) => (
                  <tr key={`${line.account}-${index}`}>
                    <td>{line.account}</td>
                    <td>{formatCurrency(line.debit)}</td>
                    <td>{formatCurrency(line.credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="Enter voucher details" note="Preview appears when the current workflow has a calculable amount." />}
      </aside>
      <section className="panel billing-list">
        <div className="panel-head">
          <div>
            <h2>Guided Voucher Approval Queue</h2>
            <p>{data?.guidedVouchers?.length || 0} voucher(s)</p>
          </div>
          <button type="button" className="ghost-btn" onClick={() => onNavigate?.("voucher_register")}>Open Posted Vouchers</button>
        </div>
        {lastPostedVoucher && (
          <div className="workflow-note posted-note">
            <strong>Posted Successfully</strong>
            <span>{lastPostedVoucher.voucher_number || `Voucher #${lastPostedVoucher.id}`} has been posted to books. Check Vouchers, General Ledger and Trial Balance.</span>
            <button type="button" className="ghost-btn" onClick={() => onNavigate?.("voucher_register")}>View Posted Voucher</button>
          </div>
        )}
        <div className="workflow-note">
          <strong>Posting flow</strong>
          <span>Draft to Submit to Review to Approve to Post. Only posted vouchers appear in Vouchers, General Ledger and Trial Balance.</span>
        </div>
        {data?.guidedVouchers?.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Workflow</th><th>Narration</th><th>Status</th><th>Posted Voucher</th><th>Actions</th></tr></thead>
              <tbody>
                {data.guidedVouchers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.voucher_date}</td>
                    <td>{row.voucher_kind}</td>
                    <td>{row.narration}</td>
                    <td><span className={`status ${normalizeStatusClass(row.status)}`}>{row.status}</span></td>
                    <td>{row.posted_voucher_number || row.posted_voucher_id || "-"}</td>
                    <td className="button-row">
                      {row.status === "Draft" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "submit")}>Submit</button>}
                      {row.status === "Pending Review" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "review")}>Review</button>}
                      {row.status === "Pending Approval" && <button type="button" className="ghost-btn" onClick={() => guidedAction(row.id, "approve")}>Approve</button>}
                      {row.status === "Approved" && <button type="button" className="primary-btn" onClick={() => guidedAction(row.id, "post")}>Post</button>}
                      {!["Posted", "Reversed"].includes(row.status) && <button type="button" className="primary-btn" onClick={() => guidedPostNow(row.id)}>Approve & Post</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No guided vouchers" note="Save a draft voucher to start the approval workflow." />}
      </section>
    </section>
  );
}
