export function createDashboardService(deps) {
  const { activeRowClause, orderProfitability, inventoryStockSummary, inventoryLowStockReport } = deps;

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
    const activeCompanySubquery = "(SELECT id FROM companies WHERE COALESCE(is_deleted, 0) = 0)";
    const companyWhere = companyId ? "company_id = @company_id" : `company_id IN ${activeCompanySubquery}`;
    const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
    const params = companyId ? { company_id: companyId } : {};
    const count = (table, where = "", extraParams = {}) => db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(where.includes("@company_id") ? { ...params, ...extraParams } : extraParams).count;
    const totalOrderValue = db.prepare(`SELECT COALESCE(SUM(billing_value), 0) AS value FROM invoices WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value;
    const amountReceived = db.prepare(`SELECT COALESCE(SUM(payment_amount), 0) AS value FROM payments WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value;
    const totalProfit = orderProfitability(db, companyId ? { company_id: companyId } : {}).reduce((sum, order) => sum + order.netCompanyProfit, 0);
    const inventorySummary = dashboardInventorySummary(db, companyId);
    const cracWhere = companyId ? "WHERE cr.company_id = @company_id AND cr.is_deleted = 0" : `WHERE cr.company_id IN ${activeCompanySubquery} AND cr.is_deleted = 0`;
    const cracParams = companyId ? { company_id: companyId } : {};
    const cracPending = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Pending'`).get(cracParams).count;
    const cracGenerated = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Generated'`).get(cracParams).count;
    const ordersWithGeneratedCrac = db.prepare(`SELECT COUNT(*) AS count FROM crac_records cr ${cracWhere} AND cr.crac_status = 'Generated'`).get(cracParams).count;
    const ordersWithInvoiceAndCrac = db.prepare(`
      SELECT COUNT(*) AS count FROM supply_orders so
      WHERE so.company_id IN ${activeCompanySubquery} AND so.is_deleted = 0
        AND so.crac_status = 'Generated'
        AND EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND i.is_deleted = 0)
        AND EXISTS (SELECT 1 FROM payments p WHERE p.order_id = so.id AND p.is_deleted = 0)
    `).get({}).count;
    return {
      totalOrders: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`),
      activeOrders: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND order_status NOT IN ('Closed', 'Fully Received')`),
      totalOrderValue,
      amountReceived,
      outstanding: totalOrderValue - amountReceived,
      totalProfit,
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
      itemsIssued: db.prepare(`SELECT COALESCE(SUM(outward_quantity), 0) AS value FROM stock_ledger WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND transaction_type IN ('Outward','Supplier Return','Adjustment Decrease')`).get(params).value,
      returnedItems: db.prepare(`SELECT COALESCE(SUM(quantity), 0) AS value FROM stock_returns WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0`).get(params).value,
      cracPending,
      cracGenerated,
      paymentReadyOrders: ordersWithInvoiceAndCrac,
      readyForClosure: count("supply_orders", `WHERE ${companyWhere} AND COALESCE(is_deleted, 0) = 0 AND COALESCE(operationally_closed, 0) = 1`),
      cashBankBalance: db.prepare(`SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS balance FROM cash_bank_ledger WHERE ${companyWhere}${cashBankActiveWhere}`).get(params).balance
    };
  }

  return { dashboardCounts };
}
