import { useEffect, useState } from "react";
import { formatCurrency } from "../../utils/formatters.js";
import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { SummaryTable } from "../../components/common.jsx";
import { Field, SelectBox } from "../../components/forms/index.jsx";

export function AllocationWorkflowScreen({ view, notify, role, companyContext, api }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    payment_id: "",
    billing_id: "",
    advance_id: "",
    supplier_payment_id: "",
    procurement_id: "",
    allocated_amount: 0,
    adjusted_amount: 0,
    tds_deducted: 0,
    gst_tds_deducted: 0,
    other_deductions: 0,
    party_type: "department",
    party_id: "",
    financial_year_id: "",
    opening_date: today,
    opening_debit: 0,
    opening_credit: 0,
    default_credit_days: 30,
    grace_period: 0,
    due_date_rule: "invoice_date",
    status: "active",
    allow_excess: false,
    remarks: ""
  });
  const canPostOpening = roleAllowsAction(role, "voucher");
  const canMaintainCreditTerms = roleAllowsAction(role, "approve") || roleAllowsAction(role, "voucher");

  async function load() {
    try {
      const selectedCompanyId = companyContext?.company_id || form.company_id;
      const result = await api.getAccountingData(selectedCompanyId ? { company_id: selectedCompanyId } : {});
      setData(result);
      if (selectedCompanyId && String(form.company_id || "") !== String(selectedCompanyId)) setForm((current) => ({ ...current, company_id: selectedCompanyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load();
  }, [form.company_id, companyContext?.company_id, companyContext?.company_scope]);

  const companyOptions = (data?.companies || []).map((row) => [row.id, row.company_name]);
  const invoiceOptions = (data?.billWiseReceivables || []).filter((row) => Number(row.balance_outstanding || 0) > 0).map((row) => [row.billing_id, `${row.invoice_number} - ${row.department_name} - ${formatCurrency(row.balance_outstanding)}`]);
  const paymentOptions = (data?.unallocatedReceipts || []).filter((row) => Number(row.unallocated_amount || 0) > 0).map((row) => [row.payment_id, `${row.receipt_reference} - ${formatCurrency(row.unallocated_amount)}`]);
  const procurementOptions = (data?.billWisePayables || []).filter((row) => Number(row.balance_due || 0) > 0).map((row) => [row.procurement_id, `${row.purchase_invoice_number} - ${row.supplier_name} - ${formatCurrency(row.balance_due)}`]);
  const supplierPaymentOptions = (data?.unallocatedSupplierPayments || []).filter((row) => Number(row.unallocated_amount || 0) > 0).map((row) => [row.supplier_payment_id, `${row.payment_reference} - ${formatCurrency(row.unallocated_amount)}`]);
  const receiptAdvanceOptions = (data?.advanceReceipts || []).filter((row) => Number(row.balance_advance || 0) > 0).map((row) => [row.id, `${row.receipt_reference || row.id} - ${row.department_name || "Department"} - ${formatCurrency(row.balance_advance)}`]);
  const supplierAdvanceOptions = (data?.supplierAdvances || []).filter((row) => Number(row.balance_advance || 0) > 0).map((row) => [row.id, `${row.payment_reference || row.id} - ${row.supplier_name || "Supplier"} - ${formatCurrency(row.balance_advance)}`]);
  const selectedReceiptAdvance = (data?.advanceReceipts || []).find((row) => String(row.id) === String(form.advance_id));
  const selectedSupplierAdvance = (data?.supplierAdvances || []).find((row) => String(row.id) === String(form.advance_id));
  const selectedInvoiceForAdjustment = (data?.billWiseReceivables || []).find((row) => String(row.billing_id) === String(form.billing_id));
  const selectedPurchaseForAdjustment = (data?.billWisePayables || []).find((row) => String(row.procurement_id) === String(form.procurement_id));
  const partyOptions = form.party_type === "supplier"
    ? (data?.suppliers || data?.references?.suppliers || []).map((row) => [row.id, row.supplier_name])
    : form.party_type === "department"
      ? (data?.departments || data?.references?.departments || []).map((row) => [row.id, row.department_name])
      : form.party_type === "employee"
        ? (data?.employees || []).map((row) => [row.id, row.employee_name])
        : [];

  async function submitReceipt(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving receipt allocation.");
      await api.createReceiptAllocation({
        company_id: companyContext.company_id,
        payment_id: form.payment_id,
        billing_id: form.billing_id,
        allocated_amount: Number(form.allocated_amount || 0),
        tds_deducted: Number(form.tds_deducted || 0),
        gst_tds_deducted: Number(form.gst_tds_deducted || 0),
        other_deductions: Number(form.other_deductions || 0),
        allow_excess: form.allow_excess,
        remarks: form.remarks
      });
      notify("Receipt allocation saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitSupplier(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving supplier allocation.");
      await api.createSupplierPaymentAllocation({
        company_id: companyContext.company_id,
        supplier_payment_id: form.supplier_payment_id,
        procurement_id: form.procurement_id,
        allocated_amount: Number(form.allocated_amount || 0),
        allow_excess: form.allow_excess,
        remarks: form.remarks
      });
      notify("Supplier payment allocation saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function createReceiptAdvance() {
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before creating an advance receipt.");
      const payment = (data?.unallocatedReceipts || []).find((row) => String(row.payment_id) === String(form.payment_id));
      if (!payment) throw new Error("Select an unallocated receipt first");
      await api.createAdvanceReceipt({
        company_id: companyContext.company_id,
        payment_id: form.payment_id,
        department_id: form.party_id || payment.department_id,
        advance_received: Number(form.allocated_amount || payment.unallocated_amount || 0),
        remarks: form.remarks
      });
      notify("Advance receipt created");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function createSupplierAdvance() {
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before creating a supplier advance.");
      await api.createSupplierAdvance({
        company_id: companyContext.company_id,
        supplier_payment_id: form.supplier_payment_id,
        advance_paid: Number(form.allocated_amount || 0),
        remarks: form.remarks
      });
      notify("Supplier advance created");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitAdvanceAdjustment(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before adjusting an advance receipt.");
      await api.adjustAdvanceReceipt({
        company_id: companyContext.company_id,
        advance_id: form.advance_id,
        billing_id: form.billing_id,
        adjusted_amount: Number(form.adjusted_amount || 0),
        reason: form.remarks || "Advance adjusted against invoice"
      });
      notify("Advance adjusted against invoice");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitSupplierAdvanceAdjustment(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before adjusting a supplier advance.");
      await api.adjustSupplierAdvance({
        company_id: companyContext.company_id,
        advance_id: form.advance_id,
        procurement_id: form.procurement_id,
        adjusted_amount: Number(form.adjusted_amount || 0),
        reason: form.remarks || "Supplier advance adjusted against purchase bill"
      });
      notify("Supplier advance adjusted against purchase bill");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitOpening(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before posting party opening balance.");
      await api.createPartyOpeningBalance({
        company_id: companyContext.company_id,
        party_type: form.party_type,
        party_id: form.party_id,
        financial_year_id: form.financial_year_id,
        opening_date: form.opening_date,
        opening_debit: Number(form.opening_debit || 0),
        opening_credit: Number(form.opening_credit || 0),
        narration: form.remarks || "Party opening balance"
      });
      notify("Party opening balance voucher posted");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function submitCreditTerms(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before saving credit terms.");
      await api.saveCreditTerm({
        company_id: companyContext.company_id,
        party_type: form.party_type === "supplier" ? "supplier" : "department",
        party_id: form.party_id,
        default_credit_days: Number(form.default_credit_days || 30),
        grace_period: Number(form.grace_period || 0),
        due_date_rule: form.due_date_rule,
        status: form.status
      });
      notify("Credit terms saved");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  if (view === "receipt_allocation_workflow") {
    return (
      <section className="workflow-layout">
        <div className="workflow-note" style={{ marginBottom: 8 }}>
          <strong>Receipt Allocation Lifecycle</strong>
          <span>Bank Receipt {">"} Allocate to Invoice {">"} Adjust Receivable Balance {">"} Update Ledger</span>
          <small>After allocation the invoice receivable is partially or fully settled. Use the Unallocate / Reallocate panel under reports to correct misallocations without editing posted entries.</small>
        </div>
        <form className="panel entry-form workflow-form" onSubmit={submitReceipt}>
          <div className="panel-head"><div><h2>Receipt Allocation</h2><p>Allocate receipt amount, TDS and GST TDS against open invoices.</p></div></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Payment Receipt" value={form.payment_id} onChange={(value) => setForm({ ...form, payment_id: value })} options={paymentOptions} />
            <SelectBox label="Open Invoice" value={form.billing_id} onChange={(value) => setForm({ ...form, billing_id: value })} options={invoiceOptions} />
            <Field name="allocated_amount" label="Allocate Amount" type="number" value={form.allocated_amount} onChange={(value) => setForm({ ...form, allocated_amount: value })} />
            <Field name="tds_deducted" label="TDS Deducted" type="number" value={form.tds_deducted} onChange={(value) => setForm({ ...form, tds_deducted: value })} />
            <Field name="gst_tds_deducted" label="GST TDS Deducted" type="number" value={form.gst_tds_deducted} onChange={(value) => setForm({ ...form, gst_tds_deducted: value })} />
            <Field name="other_deductions" label="Other Deduction" type="number" value={form.other_deductions} onChange={(value) => setForm({ ...form, other_deductions: value })} />
            <label className="field">Allow Excess<input type="checkbox" checked={form.allow_excess} onChange={(event) => setForm({ ...form, allow_excess: event.target.checked })} /></label>
            <Field name="remarks" label="Remarks" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn">Save Allocation</button>
          <button type="button" className="ghost-btn" onClick={createReceiptAdvance}>Create Advance From Receipt</button>
        </form>
        <SummaryTable title="Unallocated Receipts" rows={data?.unallocatedReceipts || []} columns={["receipt_amount", "allocated_amount", "advance_balance", "unallocated_amount", "allocation_status"]} />
      </section>
    );
  }

  if (view === "supplier_allocation_workflow") {
    return (
      <section className="workflow-layout">
        <div className="workflow-note" style={{ marginBottom: 8 }}>
          <strong>Supplier Payment Allocation Lifecycle</strong>
          <span>Supplier Payment {">"} Allocate to Purchase Bill {">"} Adjust Payable Balance {">"} Update Ledger</span>
          <small>After allocation the purchase bill payable is partially or fully settled. Use the Unallocate / Reallocate panel under reports to correct misallocations without editing posted entries.</small>
        </div>
        <form className="panel entry-form workflow-form" onSubmit={submitSupplier}>
          <div className="panel-head"><div><h2>Supplier Payment Allocation</h2><p>Allocate supplier payments against open purchase bills.</p></div></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Supplier Payment" value={form.supplier_payment_id} onChange={(value) => setForm({ ...form, supplier_payment_id: value })} options={supplierPaymentOptions} />
            <SelectBox label="Purchase Bill" value={form.procurement_id} onChange={(value) => setForm({ ...form, procurement_id: value })} options={procurementOptions} />
            <Field name="allocated_amount" label="Allocate Amount" type="number" value={form.allocated_amount} onChange={(value) => setForm({ ...form, allocated_amount: value })} />
            <label className="field">Allow Advance/Excess<input type="checkbox" checked={form.allow_excess} onChange={(event) => setForm({ ...form, allow_excess: event.target.checked })} /></label>
            <Field name="remarks" label="Remarks" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn">Save Supplier Allocation</button>
          <button type="button" className="ghost-btn" onClick={createSupplierAdvance}>Create Supplier Advance</button>
        </form>
        <SummaryTable title="Unallocated Supplier Payments" rows={data?.unallocatedSupplierPayments || []} columns={["payment_amount", "allocated_amount", "advance_balance", "unallocated_amount", "allocation_status"]} />
      </section>
    );
  }

  if (view === "advance_adjustment_wizard") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitAdvanceAdjustment}>
          <div className="panel-head"><div><h2>Advance Receipt Adjustment Wizard</h2><p>Adjust department advance receipts against open invoices.</p></div></div>
          <div className="wizard-flow"><span>Advance Receipt</span><span>Select Open Invoice</span><span>Adjust Amount</span><span>Update Receivable</span></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Advance Receipt" value={form.advance_id} onChange={(value) => setForm({ ...form, advance_id: value })} options={receiptAdvanceOptions} />
            <SelectBox label="Open Invoice" value={form.billing_id} onChange={(value) => setForm({ ...form, billing_id: value })} options={invoiceOptions} />
            <Field name="adjusted_amount" label="Adjust Amount" type="number" value={form.adjusted_amount} onChange={(value) => setForm({ ...form, adjusted_amount: value })} />
            <Field name="remarks" label="Adjustment Reason" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <div className="invoice-total-strip">
            <span>Advance Received <strong>{formatCurrency(selectedReceiptAdvance?.advance_received || 0)}</strong></span>
            <span>Already Adjusted <strong>{formatCurrency(selectedReceiptAdvance?.advance_adjusted || 0)}</strong></span>
            <span>Remaining Advance <strong>{formatCurrency(selectedReceiptAdvance?.balance_advance || 0)}</strong></span>
            <span>Invoice Outstanding <strong>{formatCurrency(selectedInvoiceForAdjustment?.balance_outstanding || 0)}</strong></span>
          </div>
          <button className="primary-btn">Adjust Advance</button>
        </form>
        <SummaryTable title="Advance Adjustment History" rows={(data?.advanceAdjustments || []).filter((row) => row.adjustment_type === "receipt")} columns={["reference", "adjusted_amount", "status", "reason", "created_at"]} />
      </section>
    );
  }

  if (view === "supplier_advance_adjustment_wizard") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitSupplierAdvanceAdjustment}>
          <div className="panel-head"><div><h2>Supplier Advance Adjustment Wizard</h2><p>Adjust supplier advances paid against open purchase bills.</p></div></div>
          <div className="wizard-flow"><span>Supplier Advance</span><span>Select Purchase Bill</span><span>Adjust Amount</span><span>Update Payable</span></div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Supplier Advance" value={form.advance_id} onChange={(value) => setForm({ ...form, advance_id: value })} options={supplierAdvanceOptions} />
            <SelectBox label="Purchase Bill" value={form.procurement_id} onChange={(value) => setForm({ ...form, procurement_id: value })} options={procurementOptions} />
            <Field name="adjusted_amount" label="Adjust Amount" type="number" value={form.adjusted_amount} onChange={(value) => setForm({ ...form, adjusted_amount: value })} />
            <Field name="remarks" label="Adjustment Reason" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <div className="invoice-total-strip">
            <span>Advance Paid <strong>{formatCurrency(selectedSupplierAdvance?.advance_paid || 0)}</strong></span>
            <span>Already Adjusted <strong>{formatCurrency(selectedSupplierAdvance?.advance_adjusted || 0)}</strong></span>
            <span>Remaining Advance <strong>{formatCurrency(selectedSupplierAdvance?.balance_advance || 0)}</strong></span>
            <span>Bill Outstanding <strong>{formatCurrency(selectedPurchaseForAdjustment?.balance_due || 0)}</strong></span>
          </div>
          <button className="primary-btn">Adjust Supplier Advance</button>
        </form>
        <SummaryTable title="Supplier Advance Adjustment History" rows={(data?.advanceAdjustments || []).filter((row) => row.adjustment_type === "supplier")} columns={["reference", "adjusted_amount", "status", "reason", "created_at"]} />
      </section>
    );
  }

  if (view === "party_opening_balances") {
    return (
      <section className="workflow-layout">
        <form className="panel entry-form workflow-form" onSubmit={submitOpening}>
          <div className="panel-head"><div><h2>Party Opening Balance</h2><p>Create balanced opening voucher with linked party ledger.</p></div></div>
          <div className="mini-panel">
            <h3>Financial Control Check</h3>
            <p>Party opening balances create an opening voucher and affect party ledgers. Use this only for migration or year-opening differences, then verify through Opening Balances, Party Ledger and Audit Log.</p>
          </div>
          <div className="form-grid">
            <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
            <SelectBox label="Party Type" value={form.party_type} onChange={(value) => setForm({ ...form, party_type: value, party_id: "" })} options={[["department", "Department"], ["supplier", "Supplier"], ["employee", "Employee"], ["expense_party", "Expense Payable Party"]]} />
            <SelectBox label="Party Name" value={form.party_id} onChange={(value) => setForm({ ...form, party_id: value })} options={partyOptions} />
            <SelectBox label="Financial Year" value={form.financial_year_id} onChange={(value) => setForm({ ...form, financial_year_id: value })} options={(data?.financialYears || []).map((row) => [row.id, row.financial_year_name])} />
            <Field name="opening_date" label="Opening Date" type="date" value={form.opening_date} onChange={(value) => setForm({ ...form, opening_date: value })} />
            <Field name="opening_debit" label="Opening Debit" type="number" value={form.opening_debit} onChange={(value) => setForm({ ...form, opening_debit: value })} />
            <Field name="opening_credit" label="Opening Credit" type="number" value={form.opening_credit} onChange={(value) => setForm({ ...form, opening_credit: value })} />
            <Field name="remarks" label="Narration" type="textarea" value={form.remarks} onChange={(value) => setForm({ ...form, remarks: value })} />
          </div>
          <button className="primary-btn" disabled={!canPostOpening}>Post Opening Voucher</button>
        </form>
        <SummaryTable title="Opening Balances" rows={data?.openingBalances || []} columns={["opening_debit", "opening_credit", "voucher_number"]} />
      </section>
    );
  }

  return (
    <section className="workflow-layout">
      <form className="panel entry-form workflow-form" onSubmit={submitCreditTerms}>
        <div className="panel-head"><div><h2>Credit Terms</h2><p>Define due-date rules for departments and suppliers.</p></div></div>
        <div className="mini-panel">
          <h3>Control Scope</h3>
          <p>Credit terms drive due dates, ageing buckets and collection/payable review. They do not post accounting entries and should be reviewed whenever ageing reports look unexpected.</p>
        </div>
        <div className="form-grid">
          <SelectBox label="Company" value={form.company_id} onChange={(value) => setForm({ ...form, company_id: value })} options={companyOptions} />
          <SelectBox label="Party Type" value={form.party_type} onChange={(value) => setForm({ ...form, party_type: value, party_id: "" })} options={[["department", "Department"], ["supplier", "Supplier"]]} />
          <SelectBox label="Party Name" value={form.party_id} onChange={(value) => setForm({ ...form, party_id: value })} options={partyOptions} />
          <Field name="default_credit_days" label="Default Credit Days" type="number" value={form.default_credit_days} onChange={(value) => setForm({ ...form, default_credit_days: value })} />
          <Field name="grace_period" label="Grace Period" type="number" value={form.grace_period} onChange={(value) => setForm({ ...form, grace_period: value })} />
          <SelectBox label="Due Date Rule" value={form.due_date_rule} onChange={(value) => setForm({ ...form, due_date_rule: value })} options={[["invoice_date", "Invoice/Purchase Date"], ["posting_date", "Posting Date"]]} />
          <SelectBox label="Status" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={[["active", "Active"], ["inactive", "Inactive"]]} />
        </div>
        <button className="primary-btn" disabled={!canMaintainCreditTerms}>Save Credit Terms</button>
      </form>
      <SummaryTable title="Credit Terms Report" rows={data?.creditTerms || []} columns={["default_credit_days", "grace_period", "due_date_rule", "status"]} />
    </section>
  );
}
