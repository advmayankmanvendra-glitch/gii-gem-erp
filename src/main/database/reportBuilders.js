import { parseMoneyToMinor, minorToMajor } from "../domain/money.js";

export function createReportBuilders({ activeRowClause, creditDueDate, allocationStatus, daysBetween, financialYearForDate }) {
  function round2(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }

  function minorAgg(prefix, column) {
    return `COALESCE(SUM(${prefix}.${column}_minor), CAST(ROUND(COALESCE(SUM(${prefix}.${column}), 0) * 100) AS INTEGER))`;
  }

  function minorVal(table, column) {
    return `COALESCE(${table}.${column}_minor, CAST(ROUND(COALESCE(${table}.${column}, 0) * 100) AS INTEGER))`;
  }

  function ageBucket(days) {
    const value = Number(days || 0);
    if (value <= 30) return "0-30 Days";
    if (value <= 60) return "31-60 Days";
    if (value <= 90) return "61-90 Days";
    return "Above 90 Days";
  }

  function billStatus(balance, received, invoiceAmount, daysOutstanding) {
    if (Number(balance || 0) <= 0) return "Fully Paid";
    if (Number(daysOutstanding || 0) > 0) return "Overdue";
    if (Number(received || 0) > 0 && Number(received || 0) < Number(invoiceAmount || 0)) return "Partially Paid";
    return "Open";
  }

  function parseGuidedVoucherPayload(payloadJson) {
    try {
      return JSON.parse(payloadJson || "{}");
    } catch {
      return {};
    }
  }

  function postedGuidedNoteAdjustments(db, companyId, noteKind, linkField) {
    const rows = db.prepare(`
      SELECT gv.id guided_voucher_id, gv.payload_json, gv.voucher_kind, gv.voucher_date,
        v.id voucher_id, v.voucher_number, v.voucher_date posted_voucher_date
      FROM guided_vouchers gv
      JOIN vouchers v ON v.source_module = 'guided_vouchers' AND v.source_id = gv.id AND COALESCE(v.is_deleted, 0) = 0
      WHERE gv.company_id = ?
        AND gv.voucher_kind = ?
        AND gv.status = 'Posted'
        AND COALESCE(gv.is_deleted, 0) = 0
    `).all(companyId, noteKind);
    return rows.reduce((map, row) => {
      const payload = parseGuidedVoucherPayload(row.payload_json);
      const linkedId = Number(payload[linkField] || 0);
      if (!linkedId) return map;
      const taxable = Number(payload.taxable_value || 0);
      const gst = Number(payload.gst_amount || (taxable * Number(payload.gst_rate || 0) / 100));
      const amount = round2(taxable + gst);
      if (amount <= 0) return map;
      const existing = map.get(linkedId) || { amount: 0, vouchers: [] };
      existing.amount = round2(existing.amount + amount);
      existing.vouchers.push({
        guided_voucher_id: row.guided_voucher_id,
        voucher_id: row.voucher_id,
        voucher_number: row.voucher_number,
        voucher_date: row.posted_voucher_date || row.voucher_date,
        reason_code: payload.reason_code || "",
        reference_number: payload.reference_number || ""
      });
      map.set(linkedId, existing);
      return map;
    }, new Map());
  }

  function dayBook(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT v.id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration, v.source_module,
        v.status,
        ${minorAgg("vl", "debit")} debit_minor_total,
        ${minorAgg("vl", "credit")} credit_minor_total
      FROM vouchers v
      LEFT JOIN voucher_lines vl ON vl.voucher_id = v.id
      WHERE v.company_id = ? AND v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed') AND v.voucher_date BETWEEN ? AND ?
      GROUP BY v.id
      ORDER BY v.voucher_date DESC, v.id DESC
    `).all(companyId, dateFrom, dateTo).map((row) => ({
      ...row,
      debit: minorToMajor(Number(row.debit_minor_total || 0)),
      credit: minorToMajor(Number(row.credit_minor_total || 0))
    }));
  }

  function postingControlReport(db, companyId) {
    const rows = [];
    const invoiceRows = db.prepare(`
      SELECT 'Billing' module, 'billing' source_module, 'invoices' table_name, i.id record_id, i.invoice_number reference, i.invoice_date record_date,
        i.billing_value amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
        COALESCE(NULLIF(i.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
        i.approval_status, i.posting_error
      FROM invoices i
      LEFT JOIN vouchers v ON v.source_module = 'billing' AND v.source_id = i.id AND v.is_deleted = 0
      WHERE i.company_id = ? AND i.is_deleted = 0
      GROUP BY i.id
    `).all(companyId);
    const procurementRows = db.prepare(`
      SELECT 'Procurement' module, 'procurement' source_module, 'procurements' table_name, p.id record_id, p.purchase_invoice_number reference, p.purchase_date record_date,
        p.purchase_value + p.purchase_gst amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
        COALESCE(NULLIF(p.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
        p.approval_status, p.posting_error
      FROM procurements p
      LEFT JOIN vouchers v ON v.source_module = 'procurement' AND v.source_id = p.id AND v.is_deleted = 0
      WHERE p.company_id = ? AND p.is_deleted = 0
      GROUP BY p.id
    `).all(companyId);
    const paymentRows = db.prepare(`
      SELECT 'Receipt' module, 'payment' source_module, 'payments' table_name, p.id record_id, COALESCE(p.utr_number, 'Payment ' || p.id) reference, p.payment_date record_date,
        p.payment_amount amount, COALESCE(MAX(v.id), 0) voucher_id, COALESCE(MAX(v.voucher_number), '') voucher_number,
        COALESCE(NULLIF(p.posting_status, ''), CASE WHEN COUNT(v.id) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
        p.approval_status, p.posting_error
      FROM payments p
      LEFT JOIN vouchers v ON v.source_module = 'payment' AND v.source_id = p.id AND v.is_deleted = 0
      WHERE p.company_id = ? AND p.is_deleted = 0
      GROUP BY p.id
    `).all(companyId);
    const expenseRows = db.prepare(`
      SELECT 'Expense' module, 'expense' source_module, 'expense_entries' table_name, ee.id record_id, eh.expense_head_name reference, ee.created_at record_date,
        COALESCE(NULLIF(ee.expense_amount, 0), ee.fixed_amount) amount, COALESCE(v.id, 0) voucher_id, COALESCE(v.voucher_number, '') voucher_number,
        COALESCE(NULLIF(ee.posting_status, ''), CASE WHEN COALESCE(ee.voucher_id, 0) > 0 THEN 'Posted' ELSE 'Draft' END) posting_status,
        ee.approval_status, ee.posting_error
      FROM expense_entries ee
      JOIN expense_heads eh ON eh.id = ee.expense_head_id
      LEFT JOIN vouchers v ON v.id = ee.voucher_id AND v.is_deleted = 0
      WHERE ee.company_id = ? AND ee.is_deleted = 0
    `).all(companyId);
    rows.push(...invoiceRows, ...procurementRows, ...paymentRows, ...expenseRows);
    return rows.map((row, index) => {
      const posted = ["Posted", "Reversed"].includes(row.posting_status);
      const hasError = row.posting_status === "Error" || Boolean(row.posting_error);
      const approvalPending = row.approval_status === "Pending Approval";
      const statusReason = posted
        ? "Accounting voucher already linked"
        : hasError
          ? "Previous posting attempt failed"
          : approvalPending
            ? "Checker approval is pending"
            : "Saved but not posted to books";
      const blockingReason = hasError
        ? row.posting_error
        : approvalPending
          ? "Approve the record before posting"
          : posted
            ? ""
            : "Review source record and post when ready";
      return {
        id: `${row.module}-${row.record_id}-${index}`,
        ...row,
        status_reason: statusReason,
        blocking_reason: blockingReason || "None",
        recommended_action: hasError ? "Open error, review source, then retry posting if safe" : posted ? "Audit through voucher and ledger drilldown" : approvalPending ? "Approve from Approval Queue" : "Post from Posting Queue after review",
        retry_available: hasError && !posted ? "Yes" : "No"
      };
    }).sort((a, b) => a.posting_status.localeCompare(b.posting_status) || a.module.localeCompare(b.module));
  }

  function partyLedgerReport(db, companyId, dateFrom, dateTo) {
    const rows = db.prepare(`
      SELECT vl.id, vl.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.source_module, v.source_id, a.account_name,
        vl.linked_party_type party_type,
        CASE
          WHEN vl.linked_party_type = 'department' THEN gd.department_name
          WHEN vl.linked_party_type = 'supplier' THEN s.supplier_name
          ELSE 'Unlinked'
        END party_name,
        0 opening_balance,
        CASE WHEN v.source_module = 'billing' THEN i.invoice_number ELSE NULL END invoice_number,
        CASE WHEN v.source_module = 'payment' THEN p.utr_number ELSE NULL END payment_reference,
        CASE WHEN v.source_module = 'procurement' THEN pr.purchase_invoice_number ELSE NULL END purchase_invoice,
        CASE WHEN v.source_module = 'supplier_payment' THEN sp.utr_number ELSE NULL END supplier_payment_reference,
        COALESCE(
          so.order_number,
          (SELECT GROUP_CONCAT(DISTINCT sop.order_number)
           FROM payment_allocations pa
           JOIN supply_orders sop ON sop.id = pa.order_id
           WHERE pa.payment_id = p.id),
          soi.order_number,
          (SELECT GROUP_CONCAT(DISTINCT soip.order_number)
           FROM supplier_payment_allocations spa
           JOIN procurements prp ON prp.id = spa.procurement_id
           JOIN supply_orders soip ON soip.id = prp.order_id
           WHERE spa.supplier_payment_id = sp.id)
        ) order_number,
        vl.debit, vl.credit, vl.narration
      FROM voucher_lines vl
      JOIN vouchers v ON v.id = vl.voucher_id
      JOIN accounts a ON a.id = vl.account_id
      LEFT JOIN government_departments gd ON gd.id = vl.linked_party_id AND vl.linked_party_type = 'department'
      LEFT JOIN suppliers s ON s.id = vl.linked_party_id AND vl.linked_party_type = 'supplier'
      LEFT JOIN invoices i ON i.id = v.source_id AND v.source_module = 'billing'
      LEFT JOIN payments p ON p.id = v.source_id AND v.source_module = 'payment'
      LEFT JOIN procurements pr ON pr.id = v.source_id AND v.source_module = 'procurement'
      LEFT JOIN supplier_payments sp ON sp.id = v.source_id AND v.source_module = 'supplier_payment'
      LEFT JOIN supply_orders so ON so.id = i.order_id
      LEFT JOIN supply_orders soi ON soi.id = pr.order_id
      WHERE v.company_id = ? AND v.is_deleted = 0 AND v.status IN ('Posted', 'Reversed') AND vl.linked_party_type IN ('department', 'supplier')
        AND v.voucher_date BETWEEN ? AND ?
      ORDER BY party_type, party_name, v.voucher_date, vl.id
    `).all(companyId, dateFrom, dateTo);

    const balances = new Map();
    return rows.map((row) => {
      const key = `${row.party_type}-${row.party_name}`;
      const opening = Number(row.opening_balance || 0);
      const prior = balances.has(key) ? Number(balances.get(key) || 0) : opening;
      const movement = row.party_type === "supplier" ? Number(row.credit || 0) - Number(row.debit || 0) : Number(row.debit || 0) - Number(row.credit || 0);
      const running = prior + movement;
      balances.set(key, running);
      return { ...row, running_balance: running, party_balance: running };
    });
  }

  function departmentLedgerReport(db, companyId, dateFrom, dateTo) {
    return partyLedgerReport(db, companyId, dateFrom, dateTo)
      .filter((row) => row.party_type === "department")
      .map((row) => ({ ...row, department_name: row.party_name }));
  }

  function supplierLedgerReport(db, companyId, dateFrom, dateTo) {
    return partyLedgerReport(db, companyId, dateFrom, dateTo)
      .filter((row) => row.party_type === "supplier")
      .map((row) => ({ ...row, supplier_name: row.party_name }));
  }

  function billWiseReceivableReport(db, companyId) {
    const today = new Date().toISOString().slice(0, 10);
    const creditNotesByInvoice = postedGuidedNoteAdjustments(db, companyId, "credit_note", "linked_invoice_id");
    return db.prepare(`
      SELECT r.id, r.department_id, gd.department_name, so.order_number, r.billing_id, r.invoice_number, r.invoice_date,
        r.invoice_amount, r.amount_received, r.tds_deducted, r.gst_tds_deducted, r.other_deductions,
        COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'receipt' AND aa.billing_id = r.billing_id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
        r.balance_outstanding, r.due_date explicit_due_date, r.allocation_status,
        CAST(julianday(?) - julianday(r.invoice_date) AS INTEGER) days_outstanding
      FROM receivables r
      LEFT JOIN government_departments gd ON gd.id = r.department_id
      LEFT JOIN supply_orders so ON so.id = r.order_id
      WHERE r.company_id = ? AND r.is_deleted = 0 AND COALESCE(r.status, '') != 'Reversed'
      ORDER BY r.invoice_date DESC, r.id DESC
    `).all(today, companyId).map((row) => {
      const settled = Number(row.amount_received || 0) + Number(row.tds_deducted || 0) + Number(row.gst_tds_deducted || 0) + Number(row.other_deductions || 0);
      const noteAdjustment = creditNotesByInvoice.get(Number(row.billing_id || 0)) || { amount: 0, vouchers: [] };
      const correctedBalance = round2(Number(row.balance_outstanding || 0) - Number(noteAdjustment.amount || 0));
      const correctedSettled = round2(settled + Number(noteAdjustment.amount || 0));
      const dueDate = creditDueDate(db, companyId, "department", row.department_id, row.invoice_date, row.explicit_due_date);
      const days = Math.max(0, daysBetween(dueDate, today));
      return {
        ...row,
        due_date: dueDate,
        net_payment_received: row.amount_received,
        settled_amount: correctedSettled,
        credit_note_adjusted: noteAdjustment.amount,
        credit_note_vouchers: noteAdjustment.vouchers,
        balance_outstanding: correctedBalance,
        days_outstanding: days,
        age_bucket: ageBucket(days),
        status: billStatus(correctedBalance, correctedSettled, row.invoice_amount, days),
        allocation_status: row.allocation_status || allocationStatus(correctedSettled, row.invoice_amount)
      };
    });
  }

  function billWisePayableReport(db, companyId) {
    const today = new Date().toISOString().slice(0, 10);
    const debitNotesByPurchase = postedGuidedNoteAdjustments(db, companyId, "debit_note", "linked_purchase_id");
    return db.prepare(`
      SELECT s.supplier_name, s.id supplier_id, p.id procurement_id, p.purchase_invoice_number, p.purchase_date invoice_date,
        so.order_number,
        COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) invoice_amount,
        COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0) amount_paid,
        COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
        p.due_date explicit_due_date,
        CAST(julianday(?) - julianday(p.purchase_date) AS INTEGER) days_outstanding
      FROM procurements p
      JOIN suppliers s ON s.id = p.supplier_id
      JOIN supply_orders so ON so.id = p.order_id
      LEFT JOIN procurement_items pi ON pi.procurement_id = p.id AND pi.is_deleted = 0
      WHERE p.company_id = ? AND p.is_deleted = 0 AND p.posting_status = 'Posted'
      GROUP BY p.id
      ORDER BY p.purchase_date DESC, p.id DESC
    `).all(today, companyId).map((row) => {
      const paid = Number(row.amount_paid || 0) + Number(row.advance_adjusted || 0);
      const noteAdjustment = debitNotesByPurchase.get(Number(row.procurement_id || 0)) || { amount: 0, vouchers: [] };
      const adjustedPaid = round2(paid + Number(noteAdjustment.amount || 0));
      const balance = round2(Number(row.invoice_amount || 0) - adjustedPaid);
      const dueDate = creditDueDate(db, companyId, "supplier", row.supplier_id, row.invoice_date, row.explicit_due_date);
      const days = Math.max(0, daysBetween(dueDate, today));
      return {
        ...row,
        due_date: dueDate,
        debit_note_adjusted: noteAdjustment.amount,
        debit_note_vouchers: noteAdjustment.vouchers,
        settled_amount: adjustedPaid,
        balance_due: balance,
        days_outstanding: days,
        age_bucket: ageBucket(days),
        status: billStatus(balance, adjustedPaid, row.invoice_amount, days),
        allocation_status: allocationStatus(adjustedPaid, row.invoice_amount)
      };
    });
  }

  function paymentAllocationReport(db, companyId) {
    return db.prepare(`
      SELECT pa.id, p.id payment_id, pa.billing_id, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_voucher,
        p.payment_date, p.payment_amount, i.invoice_number, r.invoice_amount,
        pa.allocated_amount, pa.tds_deducted, pa.gst_tds_deducted, pa.other_deductions,
        r.balance_outstanding balance_remaining, gd.department_name, so.order_number, pa.remarks,
        pa.allocation_status, pa.allow_excess, pa.reallocated_from_id, pa.change_reason
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      JOIN invoices i ON i.id = pa.billing_id
      LEFT JOIN receivables r ON r.billing_id = i.id
      LEFT JOIN supply_orders so ON so.id = pa.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      WHERE pa.company_id = ? AND COALESCE(pa.is_deleted, 0) = 0
      ORDER BY p.payment_date DESC, pa.id DESC
    `).all(companyId);
  }

  function supplierPaymentAllocationReport(db, companyId) {
    return db.prepare(`
      SELECT spa.id, sp.id supplier_payment_id, spa.procurement_id, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_voucher,
        sp.payment_date, sp.amount_paid payment_amount, s.supplier_name, p.purchase_invoice_number,
        COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) purchase_amount,
        spa.allocated_amount,
        COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst)
          - COALESCE((SELECT SUM(spa2.allocated_amount) FROM supplier_payment_allocations spa2 WHERE spa2.procurement_id = p.id AND COALESCE(spa2.is_deleted, 0) = 0), 0)
          - COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) balance_remaining,
        so.order_number, spa.remarks, spa.allocation_status, spa.allow_excess, spa.reallocated_from_id, spa.change_reason
      FROM supplier_payment_allocations spa
      JOIN supplier_payments sp ON sp.id = spa.supplier_payment_id
      JOIN procurements p ON p.id = spa.procurement_id
      JOIN suppliers s ON s.id = p.supplier_id
      JOIN supply_orders so ON so.id = p.order_id
      LEFT JOIN procurement_items pi ON pi.procurement_id = p.id AND pi.is_deleted = 0
      WHERE spa.company_id = ? AND COALESCE(spa.is_deleted, 0) = 0
      GROUP BY spa.id
      ORDER BY sp.payment_date DESC, spa.id DESC
    `).all(companyId);
  }

  function receivableAgeingReport(db, companyId) {
    return billWiseReceivableReport(db, companyId)
      .filter((row) => Number(row.balance_outstanding || 0) > 0)
      .map((row) => ({
        id: row.id,
        department_name: row.department_name,
        invoice_number: row.invoice_number,
        outstanding: row.balance_outstanding,
        days_outstanding: row.days_outstanding,
        age_bucket: row.age_bucket
      }));
  }

  function payableAgeingReport(db, companyId) {
    return billWisePayableReport(db, companyId)
      .filter((row) => Number(row.balance_due || 0) > 0)
      .map((row) => ({
        id: row.procurement_id,
        supplier_name: row.supplier_name,
        purchase_invoice_number: row.purchase_invoice_number,
        outstanding: row.balance_due,
        days_outstanding: row.days_outstanding,
        age_bucket: row.age_bucket
      }));
  }

  function tdsReconciliationReport(db, companyId) {
    return billWiseReceivableReport(db, companyId).map((row) => ({
      id: row.id,
      department_name: row.department_name,
      invoice_number: row.invoice_number,
      invoice_value: row.invoice_amount,
      tds_deducted: row.tds_deducted,
      gst_tds_deducted: row.gst_tds_deducted,
      net_payment_received: row.amount_received,
      outstanding: row.balance_outstanding
    }));
  }

  function gstTdsReconciliationReport(db, companyId) {
    return tdsReconciliationReport(db, companyId).filter((row) => Number(row.gst_tds_deducted || 0) > 0 || Number(row.outstanding || 0) > 0);
  }

  function partyLedgerSummaryReport(db, companyId) {
    const receivables = billWiseReceivableReport(db, companyId);
    const payables = billWisePayableReport(db, companyId);
    const totalReceivable = receivables.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0);
    const totalPayable = payables.reduce((sum, row) => sum + Number(row.balance_due || 0), 0);
    const topOutstandingDepartments = Object.values(receivables.reduce((groups, row) => {
      const key = row.department_name || "Unassigned";
      groups[key] = groups[key] || { id: key, party_name: key, outstanding: 0 };
      groups[key].outstanding += Number(row.balance_outstanding || 0);
      return groups;
    }, {})).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
    const topOutstandingSuppliers = Object.values(payables.reduce((groups, row) => {
      const key = row.supplier_name || "Unassigned";
      groups[key] = groups[key] || { id: key, party_name: key, outstanding: 0 };
      groups[key].outstanding += Number(row.balance_due || 0);
      return groups;
    }, {})).sort((a, b) => b.outstanding - a.outstanding).slice(0, 5);
    const oldestInvoice = receivables.filter((row) => Number(row.balance_outstanding || 0) > 0).sort((a, b) => Number(b.days_outstanding || 0) - Number(a.days_outstanding || 0))[0] || null;
    const oldestPurchaseBill = payables.filter((row) => Number(row.balance_due || 0) > 0).sort((a, b) => Number(b.days_outstanding || 0) - Number(a.days_outstanding || 0))[0] || null;
    return { totalReceivable, totalPayable, topOutstandingDepartments, topOutstandingSuppliers, oldestInvoice, oldestPurchaseBill };
  }

  function partyReconciliationReport(db, companyId, dateFrom, dateTo) {
    const partyLedger = partyLedgerReport(db, companyId, dateFrom, dateTo);
    const receivableLedger = partyLedger.filter((row) => row.party_type === "department").reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
    const payableLedger = partyLedger.filter((row) => row.party_type === "supplier").reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0);
    const receivables = billWiseReceivableReport(db, companyId).reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0);
    const payables = billWisePayableReport(db, companyId).reduce((sum, row) => sum + Number(row.balance_due || 0), 0);
    const receiptAllocations = paymentAllocationReport(db, companyId).reduce((sum, row) => sum + Number(row.allocated_amount || 0) + Number(row.tds_deducted || 0) + Number(row.gst_tds_deducted || 0) + Number(row.other_deductions || 0), 0);
    const supplierAllocations = supplierPaymentAllocationReport(db, companyId).reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);
    return [
      { id: "receivable", party_type: "Department", validation: "Department ledger agrees with receivables", check_scope: "Trade Receivables ledger vs bill-wise receivable balance", ledger_balance: receivableLedger, subledger_balance: receivables, difference: Math.round((receivableLedger - receivables) * 100) / 100, possible_issue: "Unposted invoice, unallocated receipt, wrong department link or manual journal posted to Trade Receivables", recommended_action: "Drill into Department Ledger and Bill-wise Receivable", status: Math.abs(receivableLedger - receivables) <= 1 ? "Matched" : "Mismatch" },
      { id: "payable", party_type: "Supplier", validation: "Supplier ledger agrees with payables", check_scope: "Trade Payables ledger vs bill-wise payable balance", ledger_balance: payableLedger, subledger_balance: payables, difference: Math.round((payableLedger - payables) * 100) / 100, possible_issue: "Unposted purchase, unallocated supplier payment, wrong supplier link or manual journal posted to Trade Payables", recommended_action: "Drill into Supplier Ledger and Bill-wise Payable", status: Math.abs(payableLedger - payables) <= 1 ? "Matched" : "Mismatch" },
      { id: "receipt_allocations", party_type: "Department", validation: "Receipt allocations captured", check_scope: "Receipt allocations, TDS, GST TDS and other deductions", ledger_balance: receiptAllocations, subledger_balance: receiptAllocations, difference: 0, possible_issue: "Receipt saved without allocation or statutory deductions entered on wrong invoice", recommended_action: "Drill into Receipt Allocation and Unallocated Receipts", status: "Captured" },
      { id: "supplier_allocations", party_type: "Supplier", validation: "Supplier payment allocations captured", check_scope: "Supplier payment allocation against purchase bills", ledger_balance: supplierAllocations, subledger_balance: supplierAllocations, difference: 0, possible_issue: "Supplier payment saved without bill allocation or advance incorrectly adjusted", recommended_action: "Drill into Supplier Allocation and Unallocated Supplier Payments", status: "Captured" }
    ];
  }

  function allocationReconciliationReport(db, companyId) {
    return [
      ...unallocatedReceiptsReport(db, companyId).map((row) => ({
        id: `receipt-${row.payment_id}`,
        type: "Receipt",
        reference: row.receipt_reference,
        party: row.department_name,
        amount: row.receipt_amount,
        allocated: row.allocated_amount,
        unallocated: row.unallocated_amount,
        outstanding: row.invoice_outstanding,
        status: Number(row.unallocated_amount || 0) >= 0 ? "OK" : "Over Allocated"
      })),
      ...unallocatedSupplierPaymentsReport(db, companyId).map((row) => ({
        id: `supplier-${row.supplier_payment_id}`,
        type: "Supplier Payment",
        reference: row.payment_reference,
        party: row.supplier_name,
        amount: row.payment_amount,
        allocated: row.allocated_amount,
        unallocated: row.unallocated_amount,
        outstanding: row.purchase_outstanding,
        status: Number(row.unallocated_amount || 0) >= 0 ? "OK" : "Over Allocated"
      })),
      ...advanceReceiptReport(db, companyId).map((row) => ({
        id: `advance-receipt-${row.id}`,
        type: "Advance Receipt",
        reference: row.receipt_reference,
        party: row.department_name,
        amount: row.advance_received,
        allocated: row.advance_adjusted,
        unallocated: row.balance_advance,
        outstanding: row.balance_advance,
        status: row.status
      })),
      ...supplierAdvanceReport(db, companyId).map((row) => ({
        id: `supplier-advance-${row.id}`,
        type: "Supplier Advance",
        reference: row.payment_reference,
        party: row.supplier_name,
        amount: row.advance_paid,
        allocated: row.advance_adjusted,
        unallocated: row.balance_advance,
        outstanding: row.balance_advance,
        status: row.status
      }))
    ];
  }

  function unallocatedReceiptsReport(db, companyId) {
    return db.prepare(`
      SELECT p.id payment_id, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference,
        p.payment_date, p.payment_amount receipt_amount, gd.id department_id, gd.department_name,
        COALESCE((SELECT SUM(pa.allocated_amount) FROM payment_allocations pa WHERE pa.payment_id = p.id AND COALESCE(pa.is_deleted, 0) = 0), 0) allocated_amount,
        COALESCE((SELECT SUM(ar.balance_advance) FROM advance_receipts ar WHERE ar.payment_id = p.id AND COALESCE(ar.is_deleted, 0) = 0), 0) advance_balance,
        COALESCE((SELECT SUM(r.balance_outstanding) FROM receivables r WHERE r.order_id = p.order_id AND COALESCE(r.is_deleted, 0) = 0), 0) invoice_outstanding
      FROM payments p
      LEFT JOIN supply_orders so ON so.id = p.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      WHERE p.company_id = ? AND COALESCE(p.is_deleted, 0) = 0
      ORDER BY p.payment_date DESC, p.id DESC
    `).all(companyId).map((row) => ({
      ...row,
      unallocated_amount: Number(row.receipt_amount || 0) - Number(row.allocated_amount || 0) - Number(row.advance_balance || 0),
      allocation_status: allocationStatus(Number(row.allocated_amount || 0) + Number(row.advance_balance || 0), row.receipt_amount)
    }));
  }

  function unallocatedSupplierPaymentsReport(db, companyId) {
    return db.prepare(`
      SELECT sp.id supplier_payment_id, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference,
        sp.payment_date, sp.amount_paid payment_amount, s.supplier_name,
        COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.supplier_payment_id = sp.id AND COALESCE(spa.is_deleted, 0) = 0), 0) allocated_amount,
        COALESCE((SELECT SUM(sa.balance_advance) FROM supplier_advances sa WHERE sa.supplier_payment_id = sp.id AND COALESCE(sa.is_deleted, 0) = 0), 0) advance_balance,
        COALESCE((SELECT SUM(p.purchase_value + p.purchase_gst) FROM procurements p WHERE p.supplier_id = sp.supplier_id AND COALESCE(p.is_deleted, 0) = 0), 0) purchase_outstanding
      FROM supplier_payments sp
      LEFT JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.company_id = ? AND COALESCE(sp.is_deleted, 0) = 0
      ORDER BY sp.payment_date DESC, sp.id DESC
    `).all(companyId).map((row) => ({
      ...row,
      unallocated_amount: Number(row.payment_amount || 0) - Number(row.allocated_amount || 0) - Number(row.advance_balance || 0),
      allocation_status: allocationStatus(Number(row.allocated_amount || 0) + Number(row.advance_balance || 0), row.payment_amount)
    }));
  }

  function advanceReceiptReport(db, companyId) {
    return db.prepare(`
      SELECT ar.*, gd.department_name, so.order_number, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference
      FROM advance_receipts ar
      LEFT JOIN government_departments gd ON gd.id = ar.department_id
      LEFT JOIN supply_orders so ON so.id = ar.order_id
      LEFT JOIN payments p ON p.id = ar.payment_id
      WHERE ar.company_id = ? AND COALESCE(ar.is_deleted, 0) = 0
      ORDER BY ar.created_at DESC
    `).all(companyId);
  }

  function supplierAdvanceReport(db, companyId) {
    return db.prepare(`
      SELECT sa.*, s.supplier_name, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference
      FROM supplier_advances sa
      LEFT JOIN suppliers s ON s.id = sa.supplier_id
      LEFT JOIN supplier_payments sp ON sp.id = sa.supplier_payment_id
      WHERE sa.company_id = ? AND COALESCE(sa.is_deleted, 0) = 0
      ORDER BY sa.created_at DESC
    `).all(companyId);
  }

  function advanceAdjustmentReport(db, companyId, dateFrom = "1900-01-01", dateTo = "2999-12-31") {
    return db.prepare(`
      SELECT aa.*, i.invoice_number, p.purchase_invoice_number, so.order_number,
        gd.department_name, s.supplier_name,
        CASE WHEN aa.adjustment_type = 'receipt' THEN gd.department_name ELSE s.supplier_name END party_name,
        CASE WHEN aa.adjustment_type = 'receipt' THEN i.invoice_number ELSE p.purchase_invoice_number END reference
      FROM advance_adjustments aa
      LEFT JOIN invoices i ON i.id = aa.billing_id
      LEFT JOIN procurements p ON p.id = aa.procurement_id
      LEFT JOIN supply_orders so ON so.id = aa.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE aa.company_id = ? AND date(aa.created_at) BETWEEN ? AND ?
      ORDER BY aa.created_at DESC, aa.id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function allocationAuditReport(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT * FROM allocation_audit
      WHERE company_id = ? AND date(created_at) BETWEEN ? AND ?
      ORDER BY created_at DESC, id DESC
    `).all(companyId, dateFrom, dateTo);
  }

  function creditTermsReport(db, companyId) {
    return db.prepare(`
      SELECT ct.*,
        CASE WHEN ct.party_type = 'department' THEN gd.department_name ELSE s.supplier_name END party_name
      FROM credit_terms ct
      LEFT JOIN government_departments gd ON gd.id = ct.party_id AND ct.party_type = 'department'
      LEFT JOIN suppliers s ON s.id = ct.party_id AND ct.party_type = 'supplier'
      WHERE ct.company_id = ? AND COALESCE(ct.is_deleted, 0) = 0
      ORDER BY ct.party_type, party_name
    `).all(companyId);
  }

  function financialControlReport(db, companyId, dateFrom, dateTo) {
    const tb = trialBalance(db, companyId, dateFrom, dateTo);
    const debit = tb.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const credit = tb.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const postingRows = postingControlReport(db, companyId);
    const unposted = postingRows.filter((row) => !["Posted", "Reversed"].includes(row.posting_status)).length;
    const drafts = postingRows.filter((row) => row.posting_status === "Draft").length;
    const pendingApprovals = postingRows.filter((row) => row.approval_status === "Pending Approval").length;
    const reversed = db.prepare("SELECT COUNT(*) count FROM vouchers WHERE company_id = ? AND status = 'Reversed' AND is_deleted = 0").get(companyId).count;
    const closedYears = db.prepare("SELECT COUNT(*) count FROM financial_years WHERE company_id = ? AND status IN ('Closed', 'Locked')").get(companyId).count;
    const lockedYears = db.prepare("SELECT COUNT(*) count FROM financial_years WHERE company_id = ? AND status = 'Locked'").get(companyId).count;
    const currentYear = financialYearForDate(db, companyId, new Date().toISOString().slice(0, 10));
    const statement = financialStatementSummary(db, companyId, dateFrom, dateTo);
    const gst = gstSummary(db, companyId, dateFrom, dateTo);
    const tds = db.prepare("SELECT COALESCE(SUM(tds_deducted + gst_tds_deducted), 0) value FROM payment_allocations WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0").get(companyId).value;
    const overdueReceivables = db.prepare("SELECT COUNT(*) count FROM receivables WHERE company_id = ? AND balance_outstanding > 0 AND days_outstanding > 90 AND is_deleted = 0").get(companyId).count;
    const overduePayables = supplierPayableReport(db, companyId).filter((row) => Number(row.balance_due || 0) > 0).length;
    const partyRecon = partyReconciliationReport(db, companyId, dateFrom, dateTo);
    const partyMismatches = partyRecon.filter((row) => row.status === "Mismatch").length;
    return [
      { id: "current_year", control_area: "Period", control: "Current Financial Year", value: currentYear?.financial_year_name || "Not configured", status: currentYear?.status || "Missing", status_reason: currentYear ? `Current date falls in ${currentYear.financial_year_name}` : "No financial year found for current date", blocking_reason: currentYear ? "None" : "Create an open financial year before posting", recommended_action: currentYear ? "Review financial year status before period close" : "Create financial year", drill_view: "financial_years" },
      { id: "period", control_area: "Period", control: "Report Period", value: `${dateFrom} to ${dateTo}`, status: "Open", status_reason: "Control checks calculated for selected period", blocking_reason: "None", recommended_action: "Change period filters for another review window", drill_view: "financial_control" },
      { id: "trial", control_area: "Accounting", control: "Trial Balance Difference", value: Math.round((debit - credit) * 100) / 100, status: Math.round(debit * 100) === Math.round(credit * 100) ? "Balanced" : "Mismatch", status_reason: "Debit and credit totals compared from ledger entries", blocking_reason: Math.round(debit * 100) === Math.round(credit * 100) ? "None" : "Trial balance mismatch blocks production confidence", recommended_action: "Drill into Trial Balance and General Ledger", drill_view: "trial_balance" },
      { id: "unposted", control_area: "Posting", control: "Unposted Business Records", value: unposted, status: unposted ? "Review Required" : "Clear", status_reason: "Operational records checked for accounting posting status", blocking_reason: unposted ? "Draft or error records exist in Posting Queue" : "None", recommended_action: "Open Posting Queue and post safe records", drill_view: "posting_control" },
      { id: "drafts", control_area: "Posting", control: "Draft Transactions", value: drafts, status: drafts ? "Review Required" : "Clear", status_reason: "Draft records do not affect final books", blocking_reason: drafts ? "Draft records need approval/posting or cancellation decision" : "None", recommended_action: "Review draft source records", drill_view: "posting_control" },
      { id: "approval", control_area: "Approval", control: "Pending Approvals", value: pendingApprovals, status: pendingApprovals ? "Checker Pending" : "Clear", status_reason: "Maker-checker queue reviewed", blocking_reason: pendingApprovals ? "Approval pending before posting" : "None", recommended_action: "Open Approval Queue", drill_view: "approval_queue" },
      { id: "reversed", control_area: "Audit", control: "Reversed Vouchers", value: reversed, status: reversed ? "Audit Review" : "Clear", status_reason: "Reversal count from posted voucher register", blocking_reason: "None", recommended_action: "Review Audit Log and reversal vouchers", drill_view: "audit_log" },
      { id: "closed", control_area: "Period", control: "Closed / Locked Financial Years", value: closedYears, status: closedYears ? "Controlled" : "None", status_reason: "Closed and locked periods restrict posting/editing", blocking_reason: "Posting inside closed/locked year should be blocked", recommended_action: "Review Financial Years before backdated entry", drill_view: "financial_years" },
      { id: "locked", control_area: "Period", control: "Locked Financial Years", value: lockedYears, status: lockedYears ? "Controlled" : "None", status_reason: "Locked periods need explicit reopen workflow", blocking_reason: lockedYears ? "Transactions dated inside locked years require reopening or correction workflow" : "None", recommended_action: "Open Financial Years", drill_view: "financial_years" },
      { id: "profit", control_area: "Statements", control: "Profit / Loss", value: statement.netProfit, status: statement.netProfit >= 0 ? "Profit" : "Loss", status_reason: "Derived from posted ledger entries", blocking_reason: "None", recommended_action: "Open Profit & Loss", drill_view: "profit_loss" },
      { id: "bs_diff", control_area: "Statements", control: "Balance Sheet Difference", value: statement.balanceSheetDifference, status: Math.abs(statement.balanceSheetDifference) <= 1 ? "Balanced" : "Mismatch", status_reason: "Assets compared against liabilities plus equity", blocking_reason: Math.abs(statement.balanceSheetDifference) <= 1 ? "None" : "Balance sheet mismatch needs ledger review", recommended_action: "Open Balance Sheet", drill_view: "balance_sheet" },
      { id: "gst", control_area: "Tax", control: "GST Payable / Receivable", value: gst.netGstPayable, status: gst.netGstPayable >= 0 ? "Payable" : "Receivable", status_reason: "Output GST less input GST from posted transactions", blocking_reason: "None", recommended_action: "Open GST Register and GST Summary", drill_view: "gst_register" },
      { id: "tds", control_area: "Tax", control: "TDS Receivable", value: tds, status: tds ? "Recoverable" : "Clear", status_reason: "TDS and GST TDS captured from receipt allocations", blocking_reason: "None", recommended_action: "Open TDS Register", drill_view: "tds_register" },
      { id: "party_recon", control_area: "Reconciliation", control: "Party Reconciliation Mismatches", value: partyMismatches, status: partyMismatches ? "Mismatch" : "Matched", status_reason: "Party ledger balances compared with bill-wise receivable/payable subledgers", blocking_reason: partyMismatches ? "Party ledger and subledger mismatch exists" : "None", recommended_action: "Open Party Reconciliation", drill_view: "party_reconciliation" },
      { id: "rec_overdue", control_area: "Collections", control: "Receivables 90+ Days", value: overdueReceivables, status: overdueReceivables ? "Follow Up" : "Clear", status_reason: "Open receivables older than 90 days", blocking_reason: "None", recommended_action: "Open Receivable Ageing", drill_view: "receivable_ageing" },
      { id: "pay_overdue", control_area: "Payments", control: "Open Payables", value: overduePayables, status: overduePayables ? "Review" : "Clear", status_reason: "Open supplier bills from payable report", blocking_reason: "None", recommended_action: "Open Payable Ageing", drill_view: "payable_ageing" }
    ];
  }

  function openingBalanceReport(db, companyId) {
    return db.prepare(`
      SELECT ob.*, fy.financial_year_name, a.account_name, v.voucher_number
      FROM opening_balances ob
      JOIN financial_years fy ON fy.id = ob.financial_year_id
      LEFT JOIN accounts a ON a.id = ob.account_id
      LEFT JOIN vouchers v ON v.id = ob.voucher_id
      WHERE ob.company_id = ?
      ORDER BY fy.start_date DESC, ob.id DESC
    `).all(companyId);
  }

  function approvalQueueReport(db, companyId) {
    return db.prepare(`
      SELECT aq.*, u.display_name maker_name, c.display_name checker_name
      FROM approval_queue aq
      LEFT JOIN users u ON u.id = aq.maker_id
      LEFT JOIN users c ON c.id = aq.checker_id
      WHERE aq.company_id = ? AND COALESCE(aq.is_deleted, 0) = 0
      ORDER BY aq.updated_at DESC, aq.id DESC
    `).all(companyId).map((row) => {
      const pending = row.approval_status === "Pending Approval";
      const approved = row.approval_status === "Approved";
      const rejected = row.approval_status === "Rejected";
      return {
        ...row,
        status_reason: approved ? "Checker approved this transaction" : rejected ? "Checker rejected this transaction" : pending ? "Maker submitted this transaction for approval" : "Draft or unsubmitted approval record",
        blocking_reason: pending ? "Posting remains blocked until checker approval" : rejected ? (row.remarks || "Rejected without recorded reason") : approved ? "None" : "Submit for approval before posting",
        recommended_action: pending ? "Review source record and approve/reject with reason" : rejected ? "Review rejection reason and correct the source record" : approved ? "Proceed to posting queue if not posted" : "Submit source record for approval"
      };
    });
  }

  function gstRegisters(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    const registerRows = (accountName, direction) => db.prepare(`
      SELECT le.entry_date date,
        COALESCE(i.invoice_number, p.purchase_invoice_number, v.voucher_number) reference,
        COALESCE(so_i.order_number, so_p.order_number, '') order_number,
        CASE
          WHEN i.id IS NOT NULL THEN i.billing_value
          WHEN p.id IS NOT NULL THEN p.purchase_value
          ELSE 0
        END taxable,
        CASE
          WHEN @direction = 'output' THEN le.credit - le.debit
          ELSE le.debit - le.credit
        END gst_amount,
        CASE
          WHEN i.id IS NOT NULL THEN i.gst_rate
          WHEN p.id IS NOT NULL AND p.purchase_value > 0 THEN ROUND(p.purchase_gst * 100 / p.purchase_value, 2)
          ELSE 0
        END gst_rate,
        'Posted' posting_status,
        v.id voucher_id,
        v.voucher_number,
        v.voucher_type,
        v.source_module,
        v.source_id
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      JOIN vouchers v ON v.id = le.voucher_id
      LEFT JOIN invoices i ON v.source_module = 'billing' AND i.id = v.source_id AND i.is_deleted = 0
      LEFT JOIN procurements p ON v.source_module = 'procurement' AND p.id = v.source_id AND p.is_deleted = 0
      LEFT JOIN supply_orders so_i ON so_i.id = i.order_id
      LEFT JOIN supply_orders so_p ON so_p.id = p.order_id
      WHERE le.company_id = @companyId
        AND a.account_name = @accountName
        AND v.is_deleted = 0
        AND le.entry_date BETWEEN @dateFrom AND @dateTo
        ${ledgerActiveWhere}
      ORDER BY le.entry_date DESC, le.id DESC
    `).all({ companyId, accountName, dateFrom, dateTo, direction });
    const output = registerRows("Output GST", "output");
    const input = registerRows("Input GST", "input");
    return { output, input, payable: output.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) - input.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) };
  }

  function tdsRegisters(db, companyId, dateFrom, dateTo) {
    return db.prepare(`
      SELECT gd.department_name, i.invoice_number, pa.created_at date,
        pa.tds_deducted, pa.gst_tds_deducted, pa.allocated_amount
      FROM payment_allocations pa
      JOIN invoices i ON i.id = pa.billing_id
      JOIN supply_orders so ON so.id = i.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      WHERE pa.company_id = ? AND pa.created_at BETWEEN ? AND ?
        AND COALESCE(pa.is_deleted, 0) = 0
        AND COALESCE(i.is_deleted, 0) = 0
        AND COALESCE(so.is_deleted, 0) = 0
      ORDER BY pa.created_at DESC
    `).all(companyId, `${dateFrom} 00:00:00`, `${dateTo} 23:59:59`);
  }

  function accountingRegisters(db, companyId, dateFrom, dateTo) {
    const vouchers = db.prepare("SELECT * FROM vouchers WHERE company_id = ? AND is_deleted = 0 AND voucher_date BETWEEN ? AND ? ORDER BY voucher_date DESC, id DESC").all(companyId, dateFrom, dateTo);
    return {
      journal: vouchers.filter((row) => row.voucher_type === "Journal"),
      sales: vouchers.filter((row) => row.voucher_type === "Sales" || row.voucher_type === "Credit Note"),
      purchase: vouchers.filter((row) => row.voucher_type === "Purchase" || row.voucher_type === "Debit Note")
    };
  }

  function billOutstandingReport(db, companyId) {
    const departments = billWiseReceivableReport(db, companyId).map((row) => ({
      party_name: row.department_name,
      reference: row.invoice_number,
      date: row.invoice_date,
      invoice_amount: row.invoice_amount,
      amount_received: row.amount_received,
      tds_deducted: row.tds_deducted,
      gst_tds_deducted: row.gst_tds_deducted,
      other_deductions: row.other_deductions,
      balance_outstanding: row.balance_outstanding,
      due_date: row.due_date,
      days_outstanding: row.days_outstanding,
      age_bucket: row.age_bucket,
      status: row.status,
      excess_payment: row.balance_outstanding < 0 ? Math.abs(row.balance_outstanding) : 0,
      short_payment: row.balance_outstanding > 0 ? row.balance_outstanding : 0
    }));
    const suppliers = billWisePayableReport(db, companyId).map((row) => ({
      party_name: row.supplier_name,
      reference: row.purchase_invoice_number,
      invoice_amount: row.invoice_amount,
      amount_paid: row.amount_paid,
      balance_outstanding: row.balance_due,
      due_date: row.due_date,
      days_outstanding: row.days_outstanding,
      age_bucket: row.age_bucket,
      status: row.status
    }));
    return { departments, suppliers };
  }

  function yearEndClosingReport(db, companyId) {
    return db.prepare(`
      SELECT yec.*, fy1.financial_year_name from_year, fy2.financial_year_name to_year
      FROM year_end_closings yec
      JOIN financial_years fy1 ON fy1.id = yec.from_financial_year_id
      JOIN financial_years fy2 ON fy2.id = yec.to_financial_year_id
      WHERE yec.company_id = ?
      ORDER BY yec.created_at DESC
    `).all(companyId);
  }

  function carryForwardReport(db, companyId) {
    return db.prepare(`
      SELECT cfe.*, a.account_code, a.account_name, fy1.financial_year_name from_year, fy2.financial_year_name to_year, v.voucher_number
      FROM carry_forward_entries cfe
      JOIN accounts a ON a.id = cfe.account_id
      JOIN financial_years fy1 ON fy1.id = cfe.from_financial_year_id
      JOIN financial_years fy2 ON fy2.id = cfe.to_financial_year_id
      LEFT JOIN vouchers v ON v.id = cfe.opening_voucher_id
      WHERE cfe.company_id = ?
      ORDER BY cfe.created_at DESC, a.account_code
    `).all(companyId);
  }

  // A reversed voucher stays in the books next to its reversal (Tally-style), so both
  // count; leaving the original out would double the effect of the reversal.
  function postedVoucherFilter() {
    return " AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id = le.voucher_id AND v.status IN ('Posted', 'Reversed') AND v.is_deleted = 0 AND v.company_id = a.company_id)";
  }

  function trialBalance(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    const voucherFilter = postedVoucherFilter();
    const fy = financialYearForDate(db, companyId, dateFrom);
    const fyId = fy ? fy.id : null;
    const rows = db.prepare(`
      SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
        ${minorAgg("le", "debit")} + COALESCE(
          (SELECT ${minorAgg("cfe", "opening_debit")} FROM carry_forward_entries cfe WHERE cfe.account_id = a.id AND cfe.company_id = a.company_id AND cfe.to_financial_year_id = ?),
          CASE WHEN a.normal_balance = 'Debit' THEN ${minorVal("a", "opening_balance")} ELSE 0 END
        ) debit_minor_total,
        ${minorAgg("le", "credit")} + COALESCE(
          (SELECT ${minorAgg("cfe", "opening_credit")} FROM carry_forward_entries cfe WHERE cfe.account_id = a.id AND cfe.company_id = a.company_id AND cfe.to_financial_year_id = ?),
          CASE WHEN a.normal_balance = 'Credit' THEN ${minorVal("a", "opening_balance")} ELSE 0 END
        ) credit_minor_total,
        COALESCE(SUM(le.debit), 0) debit,
        COALESCE(SUM(le.credit), 0) credit
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}${voucherFilter}
      WHERE a.company_id = ? AND a.is_deleted = 0
      GROUP BY a.id
      ORDER BY a.account_code
    `).all(fyId, fyId, dateFrom, dateTo, companyId).map((row) => {
      const debitMinor = Number(row.debit_minor_total || 0);
      const creditMinor = Number(row.credit_minor_total || 0);
      const balanceMinor = row.normal_balance === "Credit" ? creditMinor - debitMinor : debitMinor - creditMinor;
      return {
        ...row,
        debit: minorToMajor(debitMinor),
        credit: minorToMajor(creditMinor),
        balance: minorToMajor(balanceMinor)
      };
    });
    return rows;
  }

  function profitLossReport(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    const voucherFilter = postedVoucherFilter();
    const rows = db.prepare(`
      SELECT a.id, a.account_code, a.account_name, a.account_type,
        ${minorAgg("le", "debit")} debit_minor_total,
        ${minorAgg("le", "credit")} credit_minor_total
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}${voucherFilter}
      WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Income','Expense')
      GROUP BY a.id
      ORDER BY a.account_type, a.account_code
    `).all(dateFrom, dateTo, companyId).map((row) => {
      const debitMinor = Number(row.debit_minor_total || 0);
      const creditMinor = Number(row.credit_minor_total || 0);
      const amountMinor = row.account_type === "Income" ? creditMinor - debitMinor : debitMinor - creditMinor;
      return {
        id: row.id, account_code: row.account_code, account_name: row.account_name, account_type: row.account_type,
        debit: minorToMajor(debitMinor), credit: minorToMajor(creditMinor), amount: minorToMajor(amountMinor)
      };
    });
    const income = rows.filter((row) => row.account_type === "Income").reduce((sum, row) => sum + row.amount, 0);
    const expenses = rows.filter((row) => row.account_type === "Expense").reduce((sum, row) => sum + row.amount, 0);
    return { rows, income, expenses, netProfit: income - expenses };
  }

  function balanceSheetReport(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    const voucherFilter = postedVoucherFilter();
    const fy = financialYearForDate(db, companyId, dateTo);
    // Until the previous year is closed into this one there are no carry-forward
    // balances, so the sheet reads the whole ledger and shows earlier, unclosed profit.
    const carried = fy ? Boolean(db.prepare("SELECT 1 FROM carry_forward_entries WHERE company_id = ? AND to_financial_year_id = ? LIMIT 1").get(companyId, fy.id)) : false;
    const fyId = fy && carried ? fy.id : null;
    const ledgerStart = fy && carried ? fy.start_date : "1900-01-01";
    const rows = db.prepare(`
      SELECT a.id, a.account_code, a.account_name, a.account_type, a.normal_balance,
        ${minorAgg("le", "debit")} debit_minor_total,
        ${minorAgg("le", "credit")} credit_minor_total,
        COALESCE(
          CASE WHEN a.normal_balance = 'Debit'
            THEN (SELECT ${minorAgg("cfe", "opening_debit")} - ${minorAgg("cfe", "opening_credit")} FROM carry_forward_entries cfe WHERE cfe.account_id = a.id AND cfe.company_id = a.company_id AND cfe.to_financial_year_id = ?)
            ELSE (SELECT ${minorAgg("cfe", "opening_credit")} - ${minorAgg("cfe", "opening_debit")} FROM carry_forward_entries cfe WHERE cfe.account_id = a.id AND cfe.company_id = a.company_id AND cfe.to_financial_year_id = ?)
          END,
          ${minorVal("a", "opening_balance")}
        ) signed_opening_minor
      FROM accounts a
      LEFT JOIN ledger_entries le ON le.account_id = a.id AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}${voucherFilter}
      WHERE a.company_id = ? AND a.is_deleted = 0 AND a.account_type IN ('Asset','Liability','Equity')
      GROUP BY a.id
      ORDER BY a.account_type, a.account_code
    `).all(fyId, fyId, ledgerStart, dateTo, companyId).map((row) => {
      const debitMinor = Number(row.debit_minor_total || 0);
      const creditMinor = Number(row.credit_minor_total || 0);
      const openingMinor = Number(row.signed_opening_minor || 0);
      let amountMinor;
      if (row.account_type === "Asset") {
        const signedOpening = row.normal_balance === "Debit" ? openingMinor : -openingMinor;
        amountMinor = debitMinor - creditMinor + signedOpening;
      } else {
        const signedOpening = row.normal_balance === "Credit" ? openingMinor : -openingMinor;
        amountMinor = creditMinor - debitMinor + signedOpening;
      }
      return {
        ...row,
        debit: minorToMajor(debitMinor),
        credit: minorToMajor(creditMinor),
        signed_opening: minorToMajor(openingMinor),
        amount: minorToMajor(amountMinor)
      };
    });
    const assets = rows.filter((row) => row.account_type === "Asset").reduce((sum, row) => sum + row.amount, 0);
    const liabilities = rows.filter((row) => row.account_type === "Liability").reduce((sum, row) => sum + row.amount, 0);
    const equity = rows.filter((row) => row.account_type === "Equity").reduce((sum, row) => sum + row.amount, 0);
    const currentProfitDateFrom = fy ? fy.start_date : dateFrom;
    const pl = profitLossReport(db, companyId, currentProfitDateFrom, dateTo).netProfit;
    let unclosedPriorProfit = 0;
    if (fy && !carried) {
      const dayBefore = new Date(`${fy.start_date}T00:00:00Z`);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      unclosedPriorProfit = profitLossReport(db, companyId, "1900-01-01", dayBefore.toISOString().slice(0, 10)).netProfit;
    }
    return {
      rows, assets, liabilities, equity, currentProfit: pl, unclosedPriorProfit,
      liabilitiesAndEquity: liabilities + equity + pl + unclosedPriorProfit
    };
  }

  function financialStatementSummary(db, companyId, dateFrom, dateTo) {
    const pl = profitLossReport(db, companyId, dateFrom, dateTo);
    const bs = balanceSheetReport(db, companyId, dateFrom, dateTo);
    const sales = pl.rows.filter((row) => row.account_name === "Sales").reduce((sum, row) => sum + row.amount, 0);
    const purchase = pl.rows.filter((row) => row.account_name === "Purchase").reduce((sum, row) => sum + row.amount, 0);
    const expenses = pl.rows.filter((row) => row.account_type === "Expense" && row.account_name !== "Purchase").reduce((sum, row) => sum + row.amount, 0);
    return {
      grossRevenue: sales,
      purchaseCost: purchase,
      grossProfit: sales - purchase,
      totalExpenses: expenses,
      netProfit: pl.netProfit,
      assets: bs.assets,
      liabilitiesAndEquity: bs.liabilitiesAndEquity,
      balanceSheetDifference: Math.round((bs.assets - bs.liabilitiesAndEquity) * 100) / 100
    };
  }

  function gstSummary(db, companyId, dateFrom, dateTo) {
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    const input = db.prepare(`
      SELECT COALESCE(
        SUM(COALESCE(le.debit_minor, CAST(ROUND(le.debit * 100) AS INTEGER)) - COALESCE(le.credit_minor, CAST(ROUND(le.credit * 100) AS INTEGER))),
        0
      ) value_minor
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      JOIN vouchers v ON v.id = le.voucher_id
      WHERE le.company_id = ? AND a.account_name = 'Input GST' AND v.is_deleted = 0 AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}
    `).get(companyId, dateFrom, dateTo).value_minor;
    const output = db.prepare(`
      SELECT COALESCE(
        SUM(COALESCE(le.credit_minor, CAST(ROUND(le.credit * 100) AS INTEGER)) - COALESCE(le.debit_minor, CAST(ROUND(le.debit * 100) AS INTEGER))),
        0
      ) value_minor
      FROM ledger_entries le
      JOIN accounts a ON a.id = le.account_id
      JOIN vouchers v ON v.id = le.voucher_id
      WHERE le.company_id = ? AND a.account_name = 'Output GST' AND v.is_deleted = 0 AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}
    `).get(companyId, dateFrom, dateTo).value_minor;
    return {
      inputGst: minorToMajor(Number(input || 0)),
      outputGst: minorToMajor(Number(output || 0)),
      netGstPayable: minorToMajor(Number(output || 0) - Number(input || 0)),
      gstImpactOnProfitability: minorToMajor(Number(output || 0) - Number(input || 0))
    };
  }

  function supplierPayableReport(db, companyId) {
    return db.prepare(`
      SELECT s.supplier_name, p.id procurement_id, p.purchase_invoice_number,
        COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst) purchase_value,
        COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0)
          + COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) amount_paid,
        COALESCE(SUM(pi.gross_value), p.purchase_value + p.purchase_gst)
          - COALESCE((SELECT SUM(spa.allocated_amount) FROM supplier_payment_allocations spa WHERE spa.procurement_id = p.id AND COALESCE(spa.is_deleted, 0) = 0), 0)
          - COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'supplier' AND aa.procurement_id = p.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) balance_due
      FROM procurements p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN procurement_items pi ON pi.procurement_id = p.id
      WHERE p.company_id = ? AND p.is_deleted = 0 AND p.posting_status = 'Posted'
      GROUP BY p.id
      ORDER BY s.supplier_name
    `).all(companyId);
  }

  return {
    dayBook,
    postingControlReport,
    partyLedgerReport,
    departmentLedgerReport,
    supplierLedgerReport,
    billStatus,
    ageBucket,
    round2,
    parseGuidedVoucherPayload,
    postedGuidedNoteAdjustments,
    billWiseReceivableReport,
    billWisePayableReport,
    paymentAllocationReport,
    supplierPaymentAllocationReport,
    receivableAgeingReport,
    payableAgeingReport,
    tdsReconciliationReport,
    gstTdsReconciliationReport,
    partyLedgerSummaryReport,
    partyReconciliationReport,
    allocationReconciliationReport,
    unallocatedReceiptsReport,
    unallocatedSupplierPaymentsReport,
    advanceReceiptReport,
    supplierAdvanceReport,
    advanceAdjustmentReport,
    allocationAuditReport,
    creditTermsReport,
    financialControlReport,
    openingBalanceReport,
    approvalQueueReport,
    gstRegisters,
    tdsRegisters,
    accountingRegisters,
    billOutstandingReport,
    yearEndClosingReport,
    carryForwardReport,
    trialBalance,
    profitLossReport,
    balanceSheetReport,
    financialStatementSummary,
    gstSummary,
    supplierPayableReport,
  };
}
