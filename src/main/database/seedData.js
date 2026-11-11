export function createSeedData({
  hashPassword,
  markDefaultAdminPasswordForChange,
  createRecord,
  seedAccounts,
  postStockInward,
  postStockOutward,
  postPurchaseVoucher,
  postSalesVoucher,
  postReceiptVoucher,
  postExpenseAccrualsForOrder,
  createSupplierPayment,
  allocateSupplierPayment
}) {
  function seedFinancialYears(db) {
    const companies = db.prepare("SELECT id FROM companies").all();
    companies.forEach((company) => {
      const years = [
        ["FY 2025-26", "2025-04-01", "2026-03-31"],
        ["FY 2026-27", "2026-04-01", "2027-03-31"]
      ];
      years.forEach(([financial_year_name, start_date, end_date]) => {
        db.prepare(`
          INSERT OR IGNORE INTO financial_years (company_id, financial_year_name, start_date, end_date, status)
          VALUES (?, ?, ?, ?, 'Open')
        `).run(company.id, financial_year_name, start_date, end_date);
      });
    });
  }

  function repairSeedCompanyContext(db, companyId) {
    if (!companyId) return;
    db.prepare(`
      UPDATE warehouses
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '') AND warehouse_name = 'Main Store'
    `).run(companyId);
    db.prepare(`
      UPDATE banks
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '')
        AND bank_account_name = 'SBI Current Account'
        AND account_number = '000000000001'
    `).run(companyId);
    db.prepare(`
      UPDATE supply_orders
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '') AND order_number = 'GEM-2026-001'
    `).run(companyId);
    db.prepare(`
      UPDATE procurements
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '') AND purchase_invoice_number = 'PIS-1001'
    `).run(companyId);
    db.prepare(`
      UPDATE invoices
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '') AND invoice_number = 'GII-INV-001'
    `).run(companyId);
    db.prepare(`
      UPDATE payments
      SET company_id = ?
      WHERE (company_id IS NULL OR company_id = '') AND utr_number = 'UTR10001'
    `).run(companyId);
  }

  function seedPhaseTwo(db, companyId = null) {
    const orderCount = db.prepare("SELECT COUNT(*) AS count FROM supply_orders").get().count;
    if (orderCount) return;

    const effectiveCompanyId = companyId || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null;
    if (!effectiveCompanyId) return;
    const department = db.prepare("SELECT id FROM government_departments LIMIT 1").get();
    const employee = db.prepare("SELECT id FROM employees LIMIT 1").get();
    const supplier = db.prepare("SELECT id FROM suppliers LIMIT 1").get();
    const bank = db.prepare("SELECT id FROM banks WHERE company_id = ? LIMIT 1").get(effectiveCompanyId);
    const seedItem = db.prepare("SELECT id, item_name, brand, model, hsn_code, unit, gst_rate FROM items ORDER BY id LIMIT 1").get();
    if (!department || !employee || !supplier || !seedItem) return;

    const order = createRecord(db, "supply_orders", {
      company_id: effectiveCompanyId,
      order_number: "GEM-2026-001",
      gem_order_number: "GEM-2026-001",
      gem_contract_number: "GEM-CONTRACT-001",
      supply_type: "GeM",
      order_date: "2026-06-09",
      department_id: department.id,
      institution_name: "PWD Central Store",
      buyer_name: "PWD Procurement Officer",
      buyer_designation: "Buyer",
      buyer_mobile: "",
      buyer_email: "",
      consignee: "PWD Central Store",
      consignee_address: "PWD Central Store, Mumbai",
      delivery_location: "Mumbai",
      place_of_supply: "Maharashtra",
      location: "Mumbai",
      delivery_period: "15 days",
      warranty_period: "12 months",
      payment_terms: "As per GeM order",
      emd_amount: 0,
      security_deposit_amount: 0,
      employee_id: employee.id,
      supply_due_date: "2026-06-25",
      order_status: "Payment Pending",
      order_items: [{
        item_id: seedItem.id,
        item_description: seedItem.item_name,
        brand: seedItem.brand || "",
        model: seedItem.model || "",
        hsn_sac: seedItem.hsn_code || "",
        quantity: 1,
        unit: seedItem.unit || "Nos",
        quoted_rate: 1000000,
        gst_rate: Number(seedItem.gst_rate || 18),
        required_delivery_date: "2026-06-25",
        remarks: "Seed order item for Phase 2 sample order."
      }],
      remarks: "Phase 2 sample order for profitability testing."
    });

    createRecord(db, "procurements", {
      company_id: effectiveCompanyId,
      order_id: order.id,
      purchase_date: "2026-06-10",
      supplier_id: supplier.id,
      purchase_invoice_number: "PIS-1001",
      purchase_value: 700000,
      purchase_gst: 126000,
      freight: 12000,
      loading_charges: 3000,
      amount_paid: 400000,
      remarks: "Partial procurement payment made."
    });

    const heads = db.prepare("SELECT id, expense_head_name, default_calculation_method, default_percentage, category FROM expense_heads").all();
    heads.filter((head) => ["Authorization", "L1 Expense", "Work Incentive", "Commission"].includes(head.expense_head_name)).forEach((head) => {
      createRecord(db, "expense_entries", {
        company_id: effectiveCompanyId,
        order_id: order.id,
        expense_head_id: head.id,
        expense_category: head.category,
        calculation_method: head.default_calculation_method,
        percentage: head.default_percentage,
        fixed_amount: 0,
        remarks: "Seeded default expense."
      });
    });

    createRecord(db, "invoices", {
      company_id: effectiveCompanyId,
      order_id: order.id,
      invoice_number: "GII-INV-001",
      invoice_date: "2026-06-15",
      billing_value: 1000000,
      gst_rate: 18,
      invoice_type: "Tax Invoice",
      remarks: "Main supply bill."
    });

    if (bank) {
      createRecord(db, "payments", {
        company_id: effectiveCompanyId,
        order_id: order.id,
        payment_date: "2026-06-20",
        payment_amount: 350000,
        payment_mode: "NEFT",
        utr_number: "UTR10001",
        bank_id: bank.id,
        remarks: "First partial receipt."
      });
    }
  }

  function seedPhaseThreeAccountingFlow(db) {
    const order = db.prepare("SELECT * FROM supply_orders ORDER BY id LIMIT 1").get();
    if (!order) return;
    const existing = db.prepare("SELECT id FROM vouchers WHERE source_module IN ('billing', 'procurement', 'payment', 'supplier_payment', 'expense') LIMIT 1").get();
    if (existing) return;
    const companyId = order.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id;
    if (!companyId) return;

    const invoice = db.prepare("SELECT * FROM invoices WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
    const procurement = db.prepare("SELECT * FROM procurements WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
    const payment = db.prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY id LIMIT 1").get(order.id);
    const bank = db.prepare("SELECT id FROM banks ORDER BY id LIMIT 1").get();
    if (!invoice || !procurement || !payment) return;

    ensureNormalizedSeedLines(db, companyId, order, procurement, invoice);
    postPurchaseVoucher(db, procurement.id);
    postSalesVoucher(db, invoice.id);
    postReceiptVoucher(db, payment.id, invoice.id);
    postExpenseAccrualsForOrder(db, order.id);
    const supplierPayment = createSupplierPayment(db, {
      company_id: companyId,
      supplier_id: procurement.supplier_id,
      payment_date: "2026-06-21",
      bank_account_id: bank?.id || null,
      payment_mode: "NEFT",
      utr_number: "SUPP-UTR-1001",
      amount_paid: Number(procurement.amount_paid || 0),
      remarks: "Seed supplier payment"
    });
    allocateSupplierPayment(db, supplierPayment.id, procurement.id, Number(procurement.amount_paid || 0));
  }

  function ensureNormalizedSeedLines(db, companyId, order, procurement, invoice) {
    const item = db.prepare("SELECT id, item_name, unit, gst_rate FROM items ORDER BY id LIMIT 1").get();
    if (!item) return;
    const orderItem = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.id);
    if (!orderItem) {
      const taxable = Number(invoice.billing_value || 0);
      const gstRate = Number(invoice.gst_rate || 0);
      db.prepare(`
        INSERT INTO order_items (company_id, order_id, item_id, item_description, quantity, unit, quoted_rate, gst_rate, taxable_value, gst_amount, gross_value, remarks)
        VALUES (@company_id, @order_id, @item_id, @item_description, @quantity, @unit, @quoted_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @remarks)
      `).run({
        company_id: companyId,
        order_id: order.id,
        item_id: item.id,
        item_description: item.item_name,
        quantity: 1,
        unit: item.unit,
        quoted_rate: taxable,
        gst_rate: gstRate,
        taxable_value: taxable,
        gst_amount: taxable * gstRate / 100,
        gross_value: taxable + taxable * gstRate / 100,
        remarks: "Seed normalized order item"
      });
    }
    const orderItemId = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(order.id).id;
    if (!db.prepare("SELECT id FROM procurement_items WHERE procurement_id = ? LIMIT 1").get(procurement.id)) {
      const taxable = Number(procurement.purchase_value || 0);
      const gstAmount = Number(procurement.purchase_gst || 0);
      const gstRate = taxable ? (gstAmount / taxable) * 100 : 0;
      db.prepare(`
        INSERT INTO procurement_items (company_id, procurement_id, order_id, order_item_id, item_id, quantity, purchase_rate, gst_rate, taxable_value, gst_amount, gross_value, freight, loading_charges, other_cost, landed_cost)
        VALUES (@company_id, @procurement_id, @order_id, @order_item_id, @item_id, @quantity, @purchase_rate, @gst_rate, @taxable_value, @gst_amount, @gross_value, @freight, @loading_charges, @other_cost, @landed_cost)
      `).run({
        company_id: companyId,
        procurement_id: procurement.id,
        order_id: order.id,
        order_item_id: orderItemId,
        item_id: item.id,
        quantity: 1,
        purchase_rate: taxable,
        gst_rate: gstRate,
        taxable_value: taxable,
        gst_amount: gstAmount,
        gross_value: taxable + gstAmount,
        freight: Number(procurement.freight || 0),
        loading_charges: Number(procurement.loading_charges || 0),
        other_cost: 0,
        landed_cost: taxable + Number(procurement.freight || 0) + Number(procurement.loading_charges || 0)
      });
    }
    if (!db.prepare("SELECT id FROM invoice_items WHERE billing_id = ? LIMIT 1").get(invoice.id)) {
      const taxable = Number(invoice.billing_value || 0);
      const gstRate = Number(invoice.gst_rate || 0);
      const gstAmount = taxable * gstRate / 100;
      db.prepare(`
        INSERT INTO invoice_items (company_id, billing_id, order_id, order_item_id, item_id, quantity, billing_rate, gst_rate, taxable_value, cgst, sgst, igst, gst_amount, gross_value)
        VALUES (@company_id, @billing_id, @order_id, @order_item_id, @item_id, @quantity, @billing_rate, @gst_rate, @taxable_value, @cgst, @sgst, @igst, @gst_amount, @gross_value)
      `).run({
        company_id: companyId,
        billing_id: invoice.id,
        order_id: order.id,
        order_item_id: orderItemId,
        item_id: item.id,
        quantity: 1,
        billing_rate: taxable,
        gst_rate: gstRate,
        taxable_value: taxable,
        cgst: gstAmount / 2,
        sgst: gstAmount / 2,
        igst: 0,
        gst_amount: gstAmount,
        gross_value: taxable + gstAmount
      });
    }
  }

  function seedPhase7Inventory(db) {
    const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
    const supplier = db.prepare("SELECT id FROM suppliers ORDER BY id LIMIT 1").get();
    const order = db.prepare("SELECT id, department_id FROM supply_orders ORDER BY id LIMIT 1").get();
    const warehouse = db.prepare("SELECT id FROM warehouses WHERE warehouse_name = 'Main Store' ORDER BY id LIMIT 1").get();
    if (!company || !supplier || !warehouse) return;
    const stockCount = db.prepare("SELECT COUNT(*) AS count FROM stock_ledger").get().count;
    if (stockCount) return;

    const items = [
      { item_name: "Printer", brand: "HP", model: "LaserJet Pro", hsn_code: "8443", gst_rate: 18, unit: "Nos", category: "IT Hardware", reorder_level: 3, minimum_stock_level: 2, maximum_stock_level: 20, track_serial_number: 1, warranty_period: 12 },
      { item_name: "Laptop", brand: "Dell", model: "Latitude", hsn_code: "8471", gst_rate: 18, unit: "Nos", category: "IT Hardware", reorder_level: 2, minimum_stock_level: 1, maximum_stock_level: 15, track_serial_number: 1, warranty_period: 36 },
      { item_name: "UPS", brand: "APC", model: "Back-UPS", hsn_code: "8504", gst_rate: 18, unit: "Nos", category: "Power Backup", reorder_level: 5, minimum_stock_level: 3, maximum_stock_level: 30, track_batch_number: 1, warranty_period: 24 }
    ].map((payload) => {
      const existing = db.prepare("SELECT id FROM items WHERE item_name = ?").get(payload.item_name);
      if (existing) return existing;
      const result = createRecord(db, "items", { ...payload, opening_stock: 0, opening_rate: 0, opening_value: 0, status: "active" });
      return { id: result.id };
    });

    const inward = createRecord(db, "stock_inwards", {
      company_id: company.id,
      order_id: order?.id || null,
      supplier_id: supplier.id,
      item_id: items[0].id,
      warehouse_id: warehouse.id,
      inward_date: "2026-06-10",
      purchase_invoice_number: "INV-STOCK-001",
      quantity: 5,
      rate: 18000,
      gst_rate: 18,
      landed_cost: 90000,
      serial_number: "PRN-DEMO-001",
      remarks: "Seed stock inward"
    });
    postStockInward(db, inward.id);

    const upsInward = createRecord(db, "stock_inwards", {
      company_id: company.id,
      order_id: order?.id || null,
      supplier_id: supplier.id,
      item_id: items[2].id,
      warehouse_id: warehouse.id,
      inward_date: "2026-06-10",
      purchase_invoice_number: "INV-STOCK-002",
      quantity: 3,
      rate: 4500,
      gst_rate: 18,
      landed_cost: 13500,
      batch_number: "UPS-BATCH-0626",
      remarks: "Seed low-stock batch inward"
    });
    postStockInward(db, upsInward.id);

    if (order) {
      const outward = createRecord(db, "stock_outwards", {
        company_id: company.id,
        order_id: order.id,
        department_id: order.department_id,
        item_id: items[0].id,
        warehouse_id: warehouse.id,
        issue_date: "2026-06-11",
        delivery_challan_number: "DC-DEMO-001",
        quantity_issued: 1,
        serial_number: "PRN-DEMO-001",
        remarks: "Seed stock issue"
      });
      postStockOutward(db, outward.id);
    }
  }

  function insertIfEmpty(db, table, payload) {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    if (!count) createRecord(db, table, payload);
  }

  function seed(db) {
    const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
    if (!userCount) {
      db.prepare(`
        INSERT INTO users (username, password_hash, display_name, role, status)
        VALUES (@username, @password_hash, @display_name, @role, @status)
      `).run({
        username: "admin",
        password_hash: hashPassword("admin123"),
        display_name: "System Administrator",
        role: "admin",
        status: "active"
      });
    }
    markDefaultAdminPasswordForChange(db);

    insertIfEmpty(db, "companies", {
      company_name: "Gesture India Infrastructure",
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      address: "Mumbai, Maharashtra",
      bank_name: "SBI",
      account_number: "000000000001",
      ifsc: "SBIN0000001",
      status: "active"
    });
    const defaultCompanyId = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || null;

    insertIfEmpty(db, "employees", {
      employee_name: "Mira Sharma",
      mobile_number: "9876543210",
      designation: "Sales Coordinator",
      incentive_percentage: 15,
      status: "active"
    });

    insertIfEmpty(db, "government_departments", {
      department_name: "Public Works Department",
      contact_person: "Procurement Officer",
      contact_number: "02240000000",
      address: "Mumbai",
      status: "active"
    });

    insertIfEmpty(db, "suppliers", {
      supplier_name: "Prime Industrial Suppliers",
      supplier_type: "Vendor",
      supplier_code: "SUP-001",
      date_of_activation: "2026-06-09",
      supplier_account_name: "Prime Industrial Suppliers",
      supplier_account_number: "000000000002",
      supplier_bank_name: "HDFC",
      supplier_bank_ifsc_code: "HDFC0000001",
      supplier_branch: "Mumbai",
      supplier_contact: "purchase@primeindustrial.example",
      remarks: "Seed supplier",
      gstin: "27SUPPL1234F1Z8",
      contact_details: "purchase@primeindustrial.example",
      bank_details: "HDFC - 000000000002",
      status: "active"
    });

    insertIfEmpty(db, "items", {
      item_name: "Office Workstation",
      brand: "Generic",
      model: "GEM-WS-01",
      hsn_code: "9403",
      gst_rate: 18,
      unit: "Nos",
      category: "Furniture",
      opening_stock: 0,
      opening_rate: 0,
      opening_value: 0,
      reorder_level: 2,
      minimum_stock_level: 1,
      maximum_stock_level: 25,
      track_serial_number: 0,
      track_batch_number: 0,
      warranty_period: 12,
      status: "active"
    });

    insertIfEmpty(db, "warehouses", {
      company_id: defaultCompanyId,
      warehouse_name: "Main Store",
      location: "Head Office",
      responsible_person: "Store Keeper",
      status: "active"
    });

    const expenseCount = db.prepare("SELECT COUNT(*) AS count FROM expense_heads").get().count;
    if (!expenseCount) {
      [
        ["Authorization", "percentage_gross", 5, "Authorization"],
        ["L1 Expense", "percentage_gross", 2, "Tender"],
        ["Work Incentive", "percentage_gross", 10, "Work Incentive"],
        ["Transport", "fixed", 0, "Logistics"],
        ["Installation", "fixed", 0, "Execution"],
        ["Miscellaneous", "fixed", 0, "Other"]
      ].forEach(([expense_head_name, default_calculation_method, default_percentage, category]) => {
        createRecord(db, "expense_heads", {
          expense_head_name,
          default_calculation_method,
          default_percentage,
          category,
          status: "active"
        });
      });
    }

    insertIfEmpty(db, "banks", {
      company_id: defaultCompanyId,
      bank_account_name: "SBI Current Account",
      bank_name: "SBI",
      account_number: "000000000001",
      ifsc: "SBIN0000001",
      opening_balance: 0,
      status: "active"
    });

    repairSeedCompanyContext(db, defaultCompanyId);
    seedAccounts(db);
    // Demo transactions are added once, to a brand-new database only. A database
    // that was reset, or one created with GII_GEM_ERP_NO_DEMO=1, never gets them
    // back, so real books are never mixed with sample entries.
    const demoMarker = "demo_transactions_seeded_v1";
    const demoDone = db.prepare("SELECT 1 FROM schema_migrations WHERE migration_name = ?").get(demoMarker);
    if (!demoDone) {
      if (process.env.GII_GEM_ERP_NO_DEMO !== "1") {
        seedPhaseTwo(db, defaultCompanyId);
        seedPhaseThreeAccountingFlow(db);
        seedPhase7Inventory(db);
      }
      db.prepare("INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)").run(demoMarker);
    }
  }

  return { seed };
}
