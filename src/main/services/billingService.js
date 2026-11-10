import { roundMoney, sumRupees, subtractRupees } from "../domain/money.js";
import { invoiceLineAmounts } from "../domain/invoiceMath.js";

export function createBillingService(deps) {
  const {
    referenceData, suggestedInvoiceSequences, assertRecordEditable,
    getRecord, auditLog, financialYearForDate, nextInvoiceNumber
  } = deps;

  // GST is always computed here from taxable value and rate; tax figures sent by the screen are ignored.
  function normalizeInvoiceItem(item, companyId, orderId) {
    const quantity = Number(item.quantity || 0);
    const billingRate = Number(item.billing_rate || 0);
    const amounts = invoiceLineAmounts({ quantity, billingRate, taxableValue: item.taxable_value, gstRate: item.gst_rate, gstType: item.gst_type || "CGST/SGST" });
    return {
      company_id: companyId,
      order_id: orderId,
      order_item_id: item.order_item_id || null,
      item_id: item.item_id || null,
      description: item.description || "",
      hsn: item.hsn || "",
      unit: item.unit || "",
      quantity,
      billing_rate: billingRate,
      ...amounts
    };
  }

  function billingVoucherData(db, filters = {}) {
    const references = referenceData(db, filters);
    const companyId = Number(filters.company_id || references.companies[0]?.id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
    const financialYears = db.prepare("SELECT * FROM financial_years WHERE company_id = ? ORDER BY start_date DESC").all(companyId);
    const institutionOptions = db.prepare(`
      SELECT DISTINCT so.department_id, so.institution_name
      FROM supply_orders so
      WHERE so.company_id = ? AND COALESCE(so.institution_name, '') <> '' AND COALESCE(so.is_deleted, 0) = 0
      ORDER BY so.institution_name
    `).all(companyId);
    const invoices = db.prepare(`
      SELECT i.*, c.company_name, fy.financial_year_name, so.order_number, so.department_id,
        so.institution_name, so.location, so.order_status, gd.department_name,
        COALESCE(MAX(v.id), 0) voucher_id,
        COALESCE(MAX(v.voucher_number), '') voucher_number,
        COALESCE(MAX(v.status), '') voucher_status,
        COALESCE(MAX(v.voucher_date), '') voucher_date,
        COALESCE(r.invoice_amount, i.billing_value + (i.billing_value * i.gst_rate / 100)) invoice_value,
        COALESCE(r.amount_received, 0) amount_received,
        COALESCE(r.tds_deducted, 0) tds_deducted,
        COALESCE(r.gst_tds_deducted, 0) gst_tds_deducted,
        COALESCE((SELECT SUM(aa.adjusted_amount) FROM advance_adjustments aa WHERE aa.adjustment_type = 'receipt' AND aa.billing_id = i.id AND COALESCE(aa.is_deleted, 0) = 0 AND aa.status = 'Active'), 0) advance_adjusted,
        COALESCE(r.balance_outstanding, i.billing_value + (i.billing_value * i.gst_rate / 100)) balance_outstanding
      FROM invoices i
      LEFT JOIN companies c ON c.id = i.company_id
      LEFT JOIN financial_years fy ON fy.id = i.financial_year_id
      LEFT JOIN supply_orders so ON so.id = i.order_id
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      LEFT JOIN vouchers v ON v.source_module = 'billing' AND v.source_id = i.id AND v.is_deleted = 0
      LEFT JOIN receivables r ON r.billing_id = i.id AND r.is_deleted = 0
      WHERE i.company_id = ? AND COALESCE(i.is_deleted, 0) = 0
      GROUP BY i.id
      ORDER BY i.invoice_date DESC, i.id DESC
    `).all(companyId);
    const invoiceItems = db.prepare(`
      SELECT ii.*, it.item_name, COALESCE(ii.hsn, it.hsn_code) hsn_code, COALESCE(ii.unit, it.unit) item_unit
      FROM invoice_items ii
      LEFT JOIN items it ON it.id = ii.item_id
      WHERE ii.company_id = ? AND COALESCE(ii.is_deleted, 0) = 0
      ORDER BY ii.id
    `).all(companyId);
    const orderItems = db.prepare(`
      SELECT oi.*, it.item_name, it.hsn_code, it.unit, it.gst_rate
      FROM order_items oi
      LEFT JOIN items it ON it.id = oi.item_id
      WHERE oi.company_id = ? AND COALESCE(oi.is_deleted, 0) = 0
      ORDER BY oi.id
    `).all(companyId);
    const billingQuantities = db.prepare(`
      SELECT order_id, COALESCE(order_item_id, 0) order_item_id, COALESCE(item_id, 0) item_id, SUM(quantity) billed_quantity
      FROM invoice_items
      WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0
      GROUP BY order_id, COALESCE(order_item_id, 0), COALESCE(item_id, 0)
    `).all(companyId);
    const documents = db.prepare(`
      SELECT d.*, dc.order_id document_order_id
      FROM documents d
      LEFT JOIN delivery_challans dc ON d.linked_module = 'delivery_challans' AND dc.id = d.linked_record_id
      WHERE d.company_id = ? AND d.status = 'active' AND d.deleted_at IS NULL
        AND d.linked_module IN ('invoices', 'supply_orders', 'delivery_challans', 'stock_outwards')
      ORDER BY d.uploaded_at DESC, d.id DESC
    `).all(companyId);
    const receiptAdvances = db.prepare(`
      SELECT ar.*, gd.department_name, so.order_number, COALESCE(p.utr_number, 'Receipt ' || p.id) receipt_reference
      FROM advance_receipts ar
      LEFT JOIN government_departments gd ON gd.id = ar.department_id
      LEFT JOIN supply_orders so ON so.id = ar.order_id
      LEFT JOIN payments p ON p.id = ar.payment_id
      WHERE ar.company_id = ? AND COALESCE(ar.is_deleted, 0) = 0
      ORDER BY ar.created_at DESC
    `).all(companyId);
    const supplierAdvances = db.prepare(`
      SELECT sa.*, s.supplier_name, COALESCE(sp.utr_number, 'Supplier Payment ' || sp.id) payment_reference
      FROM supplier_advances sa
      LEFT JOIN suppliers s ON s.id = sa.supplier_id
      LEFT JOIN supplier_payments sp ON sp.id = sa.supplier_payment_id
      WHERE sa.company_id = ? AND COALESCE(sa.is_deleted, 0) = 0
      ORDER BY sa.created_at DESC
    `).all(companyId);
    const advanceAdjustments = db.prepare(`
      SELECT aa.*, i.invoice_number, p.purchase_invoice_number, ar.advance_received, ar.balance_advance receipt_balance,
        sa.advance_paid, sa.balance_advance supplier_balance
      FROM advance_adjustments aa
      LEFT JOIN invoices i ON i.id = aa.billing_id
      LEFT JOIN procurements p ON p.id = aa.procurement_id
      LEFT JOIN advance_receipts ar ON ar.id = aa.advance_id AND aa.adjustment_type = 'receipt'
      LEFT JOIN supplier_advances sa ON sa.id = aa.advance_id AND aa.adjustment_type = 'supplier'
      WHERE aa.company_id = ?
      ORDER BY aa.created_at DESC
    `).all(companyId);
    const procuredQuantities = db.prepare(`
      SELECT pi.order_id, pi.item_id, SUM(pi.quantity) procured_quantity
      FROM procurement_items pi
      JOIN procurements p ON p.id = pi.procurement_id
      WHERE pi.company_id = ? AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pi.is_deleted, 0) = 0
      GROUP BY pi.order_id, pi.item_id
    `).all(companyId);
    const issuedQuantities = db.prepare(`
      SELECT dc.order_id, dci.item_id, SUM(dci.quantity) issued_quantity
      FROM delivery_challan_items dci
      JOIN delivery_challans dc ON dc.id = dci.delivery_challan_id
      WHERE dci.company_id = ? AND COALESCE(dc.is_deleted, 0) = 0 AND dc.status = 'Confirmed'
      GROUP BY dc.order_id, dci.item_id
    `).all(companyId);
    const paymentAllocations = db.prepare(`
      SELECT pa.*, p.utr_number, p.payment_date, p.payment_mode
      FROM payment_allocations pa
      LEFT JOIN payments p ON p.id = pa.payment_id
      WHERE pa.company_id = ? AND COALESCE(pa.is_deleted, 0) = 0
      ORDER BY pa.created_at DESC
    `).all(companyId);
    return {
      references,
      financialYears,
      institutionOptions,
      invoiceSequence: suggestedInvoiceSequences(db, references.companies, financialYears),
      invoices,
      invoiceItems,
      orderItems,
      billingQuantities,
      documents,
      receiptAdvances,
      supplierAdvances,
      advanceAdjustments,
      profitability: orderProfitability(db, { company_id: companyId }),
      procuredQuantities,
      issuedQuantities,
      paymentAllocations
    };
  }

  function calculateProfitability(db, order) {
    const invoices = db.prepare("SELECT * FROM invoices WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
    const procurements = db.prepare("SELECT * FROM procurements WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
    const payments = db.prepare("SELECT * FROM payments WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND posting_status = 'Posted'").all(order.id);
    const expenses = db.prepare(`
      SELECT ee.*, eh.expense_head_name
      FROM expense_entries ee
      LEFT JOIN expense_heads eh ON eh.id = ee.expense_head_id
      WHERE ee.order_id = ? AND COALESCE(ee.is_deleted, 0) = 0 AND ee.posting_status = 'Posted'
    `).all(order.id);

    // Totals are added in whole paise so they never drift; the formulas are unchanged.
    const billingValue = sumRupees(invoices.map((row) => row.billing_value));
    const invoiceGrossValue = sumRupees(invoices.map((row) => {
      const lineGross = sumRupees(db.prepare(`
        SELECT gross_value FROM invoice_items
        WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0
      `).all(row.id).map((item) => item.gross_value));
      if (lineGross > 0) return lineGross;
      return roundMoney(Number(row.billing_value || 0) + (Number(row.billing_value || 0) * Number(row.gst_rate || 0) / 100));
    }));
    const gstRate = invoices.length ? Number(invoices[0].gst_rate || 0) / 100 : 0;
    const purchaseValue = sumRupees(procurements.map((row) => row.purchase_value));
    const purchaseCost = sumRupees(procurements.flatMap((row) => [row.purchase_value, row.freight, row.loading_charges]));
    const issuedStockCost = Number(db.prepare(`
      SELECT COALESCE(SUM(value_minor), 0) / 100.0 total
      FROM stock_ledger
      WHERE order_id = ? AND COALESCE(is_deleted, 0) = 0 AND transaction_type = 'Outward'
    `).get(order.id)?.total || 0);
    const inventoryCostBasis = issuedStockCost > 0 ? issuedStockCost : purchaseValue;
    const supplierPaid = sumRupees(procurements.map((row) => row.amount_paid));
    const amountReceived = sumRupees(payments.map((row) => row.payment_amount));
    const grossMargin = subtractRupees(billingValue, inventoryCostBasis);
    const gstInputLoss = roundMoney(grossMargin * gstRate);
    const taxableValue = gstRate ? billingValue / (1 + gstRate) : billingValue;
    const dynamicExpenses = expenses.map((expense) => {
      let amount = Number(expense.fixed_amount || 0);
      if (expense.calculation_method === "percentage_gross") {
        amount = billingValue * (Number(expense.percentage || 0) / 100);
      }
      if (expense.calculation_method === "percentage_taxable") {
        amount = taxableValue * (Number(expense.percentage || 0) / 100);
      }
      return { ...expense, amount: roundMoney(amount) };
    });
    const totalExpenses = sumRupees(dynamicExpenses.map((row) => row.amount));
    const initialProfit = sumRupees([grossMargin, -gstInputLoss, -totalExpenses]);
    const incentivePercentage = Number(order.incentive_percentage || 0) / 100;
    const employeeIncentive = roundMoney(initialProfit * incentivePercentage);
    const netCompanyProfit = subtractRupees(initialProfit, employeeIncentive);

    return {
      ...order,
      billingValue,
      invoiceGrossValue,
      gstRate: gstRate * 100,
      purchaseValue,
      purchaseCost,
      issuedStockCost,
      inventoryCostBasis,
      inventoryCostSource: issuedStockCost > 0 ? "Issued Stock Cost" : "Procurement Value",
      supplierPaid,
      supplierDue: subtractRupees(purchaseCost, supplierPaid),
      amountReceived,
      outstanding: subtractRupees(invoiceGrossValue, amountReceived),
      grossMargin,
      gstInputLoss,
      totalExpenses,
      initialProfit,
      employeeIncentive,
      netCompanyProfit,
      roiPercentage: inventoryCostBasis ? (netCompanyProfit / inventoryCostBasis) * 100 : 0,
      dynamicExpenses
    };
  }

  function orderProfitability(db, filters = {}) {
    const companyId = Number(filters.company_id || 0);
    const conditions = [
      companyId
        ? "so.company_id = @company_id"
        : "so.company_id IN (SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0)",
      "COALESCE(so.is_deleted, 0) = 0"
    ];
    const params = companyId ? { company_id: companyId } : {};
    if (filters.date_from) {
      conditions.push("so.order_date >= @date_from");
      params.date_from = filters.date_from;
    }
    if (filters.date_to) {
      conditions.push("so.order_date <= @date_to");
      params.date_to = filters.date_to;
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const orders = db.prepare(`
      SELECT so.*, gd.department_name, e.employee_name, e.incentive_percentage
      FROM supply_orders so
      LEFT JOIN government_departments gd ON gd.id = so.department_id
      LEFT JOIN employees e ON e.id = so.employee_id
      ${where}
      ORDER BY so.id DESC
    `).all(params);
    return orders.map((order) => calculateProfitability(db, order));
  }

  function saveBillingVoucher(db, payload) {
    const header = payload.header || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!header.order_id) throw new Error("Order is required");
    if (!header.invoice_date) throw new Error("Invoice date is required");
    const order = db.prepare("SELECT * FROM supply_orders WHERE id = ?").get(header.order_id);
    if (!order) throw new Error("Linked order not found");
    if (!order.department_id) throw new Error("Department is required before billing");

    const companyId = Number(order.company_id || header.company_id || 0);
    if (!companyId) throw new Error("Company is required: the linked supply order has no company. Open the supply order, set its company, then save the invoice again.");
    if (header.company_id && Number(header.company_id) !== companyId) {
      throw new Error("Invoice not saved: the supply order belongs to another company. Switch to that company, or pick a supply order of the current company.");
    }
    const financialYear = header.financial_year_id
      ? db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(header.financial_year_id, companyId)
      : financialYearForDate(db, companyId, header.invoice_date);
    if (!financialYear) throw new Error("Financial year is not configured for this invoice date in this company. Open Settings > Financial Years and add the year, or pick a year of this company.");
    const invoiceNumber = String(header.invoice_number || "").trim() || nextInvoiceNumber(db, companyId, financialYear.id);

    const duplicate = db.prepare(`
      SELECT id FROM invoices
      WHERE company_id = ? AND invoice_number = ? AND COALESCE(financial_year_id, 0) = COALESCE(?, 0)
        AND COALESCE(is_deleted, 0) = 0 AND id <> ?
    `).get(companyId, invoiceNumber, financialYear.id, Number(header.id || 0));
    if (duplicate) throw new Error("Invoice number must be unique per company and financial year");

    const normalizedItems = items
      .map((item) => normalizeInvoiceItem(item, companyId, Number(header.order_id)))
      .filter((item) => item.quantity || item.taxable_value || item.item_id || item.description);
    const taxableTotal = sumRupees(normalizedItems.map((item) => item.taxable_value));
    const gstTotal = sumRupees(normalizedItems.map((item) => item.gst_amount));
    const fallbackBilling = roundMoney(header.billing_value);
    const billingValue = taxableTotal || fallbackBilling;
    const gstRate = normalizedItems.length ? Math.max(...normalizedItems.map((item) => item.gst_rate)) : Number(header.gst_rate || 0);
    if (billingValue < 0 || gstTotal < 0) throw new Error("Invoice amount cannot be negative");

    // Saving may only keep an invoice as Draft or submit it for approval; approval goes
    // through the approval queue and posting through the posting service.
    const requestedStatus = ["Draft", "Pending Approval"].includes(header.invoice_status) ? header.invoice_status : null;
    const existingInvoice = header.id ? db.prepare("SELECT posting_status, approval_status, invoice_status FROM invoices WHERE id = ?").get(header.id) : null;
    const data = {
      company_id: companyId,
      financial_year_id: financialYear.id,
      order_id: Number(header.order_id),
      invoice_number: invoiceNumber,
      invoice_date: header.invoice_date,
      gem_order_number: header.gem_order_number || "",
      gem_contract_number: header.gem_contract_number || "",
      consignee: header.consignee || "",
      place_of_supply: header.place_of_supply || "",
      gst_type: header.gst_type || "CGST/SGST",
      billing_value: billingValue,
      gst_rate: gstRate,
      invoice_type: header.invoice_type || "Tax Invoice",
      invoice_status: requestedStatus || existingInvoice?.invoice_status || "Draft",
      remarks: header.remarks || "",
      // Posting has its own controlled path; saving never changes it.
      posting_status: existingInvoice?.posting_status || "Draft",
      approval_status: requestedStatus || existingInvoice?.approval_status || "Draft",
      posting_error: header.posting_error || null
    };

    const transaction = db.transaction(() => {
      let invoice;
      if (header.id) {
        assertRecordEditable("invoices", getRecord(db, "invoices", header.id));
        db.prepare(`
          UPDATE invoices SET company_id = @company_id, financial_year_id = @financial_year_id, order_id = @order_id,
            invoice_number = @invoice_number, invoice_date = @invoice_date, gem_order_number = @gem_order_number,
            gem_contract_number = @gem_contract_number,
            consignee = @consignee, place_of_supply = @place_of_supply, gst_type = @gst_type,
            billing_value = @billing_value, gst_rate = @gst_rate, invoice_type = @invoice_type,
            invoice_status = @invoice_status, remarks = @remarks, posting_status = @posting_status,
            approval_status = @approval_status, posting_error = @posting_error, updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `).run({ ...data, id: header.id });
        invoice = getRecord(db, "invoices", header.id);
        db.prepare("UPDATE invoice_items SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE billing_id = ?").run(header.id);
      } else {
        const result = db.prepare(`
          INSERT INTO invoices (company_id, financial_year_id, order_id, invoice_number, invoice_date, gem_order_number, gem_contract_number,
            consignee, place_of_supply, gst_type, billing_value, gst_rate, invoice_type, invoice_status, remarks,
            posting_status, approval_status, posting_error)
          VALUES (@company_id, @financial_year_id, @order_id, @invoice_number, @invoice_date, @gem_order_number, @gem_contract_number,
            @consignee, @place_of_supply, @gst_type, @billing_value, @gst_rate, @invoice_type, @invoice_status, @remarks,
            @posting_status, @approval_status, @posting_error)
        `).run(data);
        invoice = getRecord(db, "invoices", result.lastInsertRowid);
      }

      const insertLine = db.prepare(`
        INSERT INTO invoice_items (company_id, billing_id, order_id, order_item_id, item_id, description, hsn, unit,
          quantity, billing_rate, gst_rate, taxable_value, cgst, sgst, igst, gst_amount, gross_value)
        VALUES (@company_id, @billing_id, @order_id, @order_item_id, @item_id, @description, @hsn, @unit,
          @quantity, @billing_rate, @gst_rate, @taxable_value, @cgst, @sgst, @igst, @gst_amount, @gross_value)
      `);
      normalizedItems.forEach((item) => insertLine.run({ ...item, billing_id: invoice.id }));
      auditLog(db, { company_id: companyId, action: header.id ? "billing voucher update" : "billing voucher create", table_name: "invoices", record_id: invoice.id, new_value: JSON.stringify({ invoice: data, line_count: normalizedItems.length }) });
      return getRecord(db, "invoices", invoice.id);
    });
    return transaction();
  }

  return {
    billingVoucherData, saveBillingVoucher, orderProfitability, calculateProfitability
  };
}
