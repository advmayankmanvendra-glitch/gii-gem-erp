export function createDashboardService(deps) {
  const {
    activeRowClause,
    orderProfitability,
    inventoryStockSummary,
    inventoryLowStockReport,
    inventoryDashboard,
    procurementRequirementReport,
    financialControlReport,
    supplierPayableReport,
    billWiseReceivableReport
  } = deps;

  function sumRows(rows, key) {
    return rows.reduce((sum, row) => sum + Number(row?.[key] || 0), 0);
  }

  function controlValue(rows, id) {
    return Number(rows.find((row) => row.id === id)?.value || 0);
  }

  function dashboardInventorySummary(db, companyId = 0) {
    const companies = companyId
      ? [{ id: companyId }]
      : db.prepare("SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0 AND status = 'active' ORDER BY id").all();
    const rows = companies.flatMap((company) => inventoryStockSummary(db, company.id));
    return {
      totalStockValue: rows.reduce((sum, row) => sum + Number(row.stock_value || 0), 0),
      lowStockItems: companies.reduce((sum, company) => sum + inventoryLowStockReport(db, company.id, "stocked").length, 0),
      itemsInStock: new Set(rows.filter((row) => Number(row.closing_quantity || 0) > 0).map((row) => row.id)).size
    };
  }

  function dashboardCounts(db, filters = {}) {
    const companyId = Number(filters.company_id || 0);
    const dateFrom = filters.date_from || "1900-01-01";
    const dateTo = filters.date_to || "2999-12-31";
    const activeCompanySubquery = "(SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0 AND status = 'active')";
    const companyWhere = companyId ? "company_id = @company_id" : `company_id IN ${activeCompanySubquery}`;
    const qualifiedCompanyWhere = companyId ? "so.company_id = @company_id" : `so.company_id IN ${activeCompanySubquery}`;
    const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
    const params = { ...(companyId ? { company_id: companyId } : {}), date_from: dateFrom, date_to: dateTo };
    const companyParams = companyId ? { company_id: companyId } : {};
    const count = (table, where = "", extraParams = {}) => {
      const queryParams = { ...extraParams };
      if (where.includes("@company_id")) queryParams.company_id = companyId;
      if (where.includes("@date_from")) queryParams.date_from = dateFrom;
      if (where.includes("@date_to")) queryParams.date_to = dateTo;
      const statement = db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`);
      return (Object.keys(queryParams).length ? statement.get(queryParams) : statement.get()).count;
    };
    const totalOrderValue = db.prepare(`SELECT COALESCE(SUM(billing_value), 0) AS value FROM invoices WHERE ${companyWhere} AND invoice_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0`).get(params).value;
    const amountReceived = db.prepare(`SELECT COALESCE(SUM(payment_amount), 0) AS value FROM payments WHERE ${companyWhere} AND payment_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0`).get(params).value;
    const totalProfit = orderProfitability(db, { ...(companyId ? { company_id: companyId } : {}), date_from: dateFrom, date_to: dateTo }).reduce((sum, order) => sum + order.netCompanyProfit, 0);
    const inventorySummary = dashboardInventorySummary(db, companyId);
    const companyIds = companyId
      ? [companyId]
      : db.prepare("SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0 AND status = 'active' ORDER BY id").all().map((row) => Number(row.id));
    const financialControls = companyIds.map((id) => financialControlReport(db, id, dateFrom, dateTo));
    const supplierPayables = companyIds.flatMap((id) => supplierPayableReport(db, id));
    const receivables = companyIds.flatMap((id) => billWiseReceivableReport(db, id));
    const inventoryMetrics = companyIds.flatMap((id) => inventoryDashboard(db, id));
    const pendingProcurement = companyIds.reduce((sum, id) => sum + procurementRequirementReport(db, id).length, 0);
    const pendingDeliveries = inventoryMetrics
      .filter((row) => row.id === "pending_deliveries")
      .reduce((sum, row) => sum + Number(row.value || 0), 0);
    const cracWhere = companyId ? "WHERE cr.company_id = @company_id AND cr.is_deleted = 0" : `WHERE cr.company_id IN ${activeCompanySubquery} AND cr.is_deleted = 0`;
    const cracParams = companyId ? { company_id: companyId } : {};
    const cracPending = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Pending'`).get(cracParams).count;
    const cracGenerated = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Generated'`).get(cracParams).count;
    const operational = db.prepare(`
      WITH order_totals AS (
        SELECT so.id,
          so.order_status,
          COALESCE(so.operationally_closed, 0) operationally_closed,
          COALESCE(SUM(CASE WHEN COALESCE(oi.is_deleted, 0) = 0 THEN oi.quantity ELSE 0 END), 0) ordered_quantity,
          COALESCE((SELECT SUM(sow.quantity_issued) FROM stock_outwards sow WHERE sow.order_id = so.id AND COALESCE(sow.is_deleted, 0) = 0), 0) issued_quantity,
          COALESCE((SELECT SUM(ii.quantity) FROM invoice_items ii WHERE ii.order_id = so.id AND COALESCE(ii.is_deleted, 0) = 0), 0) billed_quantity
        FROM supply_orders so
        LEFT JOIN order_items oi ON oi.order_id = so.id
        WHERE ${qualifiedCompanyWhere} AND COALESCE(so.is_deleted, 0) = 0
        GROUP BY so.id
      )
      SELECT
        COALESCE(SUM(CASE WHEN operationally_closed = 0 AND ordered_quantity > issued_quantity AND order_status NOT IN ('Closed', 'Fully Received') THEN 1 ELSE 0 END), 0) pending_supply,
        COALESCE(SUM(CASE WHEN operationally_closed = 0 AND MAX(ordered_quantity, issued_quantity) > billed_quantity AND order_status != 'Closed' THEN 1 ELSE 0 END), 0) pending_billing
      FROM order_totals
    `).get(companyParams);
    const closureReadiness = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN COALESCE(so.operationally_closed, 0) = 0
          AND (so.is_supply_completed = 1 OR so.supply_completed_at IS NOT NULL)
          AND so.crac_status = 'Generated'
          AND EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND COALESCE(i.is_deleted, 0) = 0)
          AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = so.id AND COALESCE(p.is_deleted, 0) = 0)
          AND EXISTS (SELECT 1 FROM documents d WHERE d.linked_module = 'supply_orders' AND d.linked_record_id = so.id AND d.status = 'active' AND d.deleted_at IS NULL)
          THEN 1 ELSE 0 END), 0) ready_for_closure,
        COALESCE(SUM(CASE WHEN COALESCE(so.operationally_closed, 0) = 0
          AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.linked_module = 'supply_orders' AND d.linked_record_id = so.id AND d.status = 'active' AND d.deleted_at IS NULL)
          THEN 1 ELSE 0 END), 0) pending_documents,
        COALESCE(SUM(CASE WHEN COALESCE(so.operationally_closed, 0) = 0
          AND so.crac_status = 'Generated'
          AND EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND COALESCE(i.is_deleted, 0) = 0)
          THEN 1 ELSE 0 END), 0) payment_ready
      FROM supply_orders so
      WHERE ${qualifiedCompanyWhere} AND COALESCE(so.is_deleted, 0) = 0
    `).get(companyParams);
    const totalControl = (id) => financialControls.reduce((sum, rows) => sum + controlValue(rows, id), 0);
    const unpostedVouchers = totalControl("unposted");
    const draftVouchers = totalControl("drafts");
    const pendingApprovals = totalControl("approval");
    const gstPayable = totalControl("gst");
    const tdsReceivable = totalControl("tds");
    const profitLoss = totalControl("profit");
    const trialBalanceStatus = financialControls.some((rows) => Math.abs(controlValue(rows, "trial")) > 0.005) ? "Mismatch" : "Balanced";
    const balanceSheetStatus = financialControls.some((rows) => Math.abs(controlValue(rows, "bs_diff")) > 1) ? "Mismatch" : "Balanced";
    return {
      totalOrders: count("supply_orders", `WHERE ${companyWhere} AND order_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0`),
      activeOrders: count("supply_orders", `WHERE ${companyWhere} AND order_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0 AND order_status NOT IN ('Closed', 'Fully Received')`),
      totalOrderValue,
      amountReceived,
      outstanding: sumRows(receivables, "balance_outstanding"),
      totalProfit,
      supplierPayables: sumRows(supplierPayables, "balance_due"),
      payables: sumRows(supplierPayables, "balance_due"),
      suppliers: count("suppliers"),
      companies: count("companies"),
      employees: count("employees", "WHERE status = 'active'"),
      departments: count("government_departments"),
      items: count("items"),
      expenseHeads: count("expense_heads"),
      banks: count("banks", `WHERE ${companyWhere}`),
      totalStockValue: inventorySummary.totalStockValue,
      lowStockItems: inventorySummary.lowStockItems,
      itemsInStock: inventorySummary.itemsInStock,
      itemsIssued: db.prepare(`SELECT COALESCE(SUM(outward_quantity), 0) AS value FROM stock_ledger WHERE ${companyWhere} AND transaction_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0 AND transaction_type IN ('Outward','Supplier Return','Adjustment Decrease')`).get(params).value,
      returnedItems: db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS value FROM stock_returns WHERE ${companyWhere} AND return_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0`).get(params).value,
      pendingProcurement,
      pendingSupply: Number(operational.pending_supply || 0),
      pendingBilling: Number(operational.pending_billing || 0),
      pendingDocuments: Number(closureReadiness.pending_documents || 0),
      pendingDeliveries,
      cracPending,
      cracGenerated,
      paymentReadyOrders: Number(closureReadiness.payment_ready || 0),
      readyForClosure: Number(closureReadiness.ready_for_closure || 0),
      unpostedVouchers,
      draftVouchers,
      postedVouchers: count("vouchers", `WHERE ${companyWhere} AND voucher_date BETWEEN @date_from AND @date_to AND COALESCE(is_deleted, 0) = 0 AND status = 'Posted'`),
      pendingApprovals,
      gstPayable,
      tdsReceivable,
      profitLoss,
      trialBalanceStatus,
      balanceSheetStatus,
      cashBankBalance: db.prepare(`SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS balance FROM cash_bank_ledger WHERE ${companyWhere}${cashBankActiveWhere}`).get(companyParams).balance
    };
  }

  return { dashboardCounts };
}
