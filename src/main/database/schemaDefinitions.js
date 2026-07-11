export function createSchemaFunctions({ addColumnIfMissing, seedFinancialYears, backfillPostingStatuses, tableExists, ACCOUNTING_TABLES }) {
  function addAccountingColumns(db) {
    ["supply_orders", "procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
      addColumnIfMissing(db, table, "company_id", "INTEGER REFERENCES companies(id)");
      addColumnIfMissing(db, table, "deleted_at", "TEXT");
      addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
      addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
    });

    [
      ["expense_entries", "expense_amount", "REAL NOT NULL DEFAULT 0"],
      ["expense_entries", "payable_to", "TEXT"],
      ["expense_entries", "payment_status", "TEXT NOT NULL DEFAULT 'Unpaid'"],
      ["expense_entries", "paid_amount", "REAL NOT NULL DEFAULT 0"],
      ["expense_entries", "balance_amount", "REAL NOT NULL DEFAULT 0"],
      ["expense_entries", "payment_date", "TEXT"],
      ["expense_entries", "bank_account_id", "INTEGER REFERENCES banks(id)"],
      ["expense_entries", "payment_mode", "TEXT"],
      ["expense_entries", "utr_number", "TEXT"],
      ["expense_entries", "voucher_id", "INTEGER"]
    ].forEach(([table, column, definition]) => addColumnIfMissing(db, table, column, definition));

    const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
    if (company) {
      ["supply_orders", "procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
        db.prepare(`UPDATE ${table} SET company_id = ? WHERE company_id IS NULL`).run(company.id);
      });
    }
  }

  function addBillingVoucherEnhancementFields(db) {
    [
      ["gem_order_number", "TEXT"],
      ["gem_contract_number", "TEXT"],
      ["consignee", "TEXT"],
      ["place_of_supply", "TEXT"],
      ["gst_type", "TEXT NOT NULL DEFAULT 'CGST/SGST'"],
      ["invoice_status", "TEXT NOT NULL DEFAULT 'Draft'"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "invoices", column, definition));

    [
      ["description", "TEXT"],
      ["hsn", "TEXT"],
      ["unit", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "invoice_items", column, definition));
  }

  function addPhase6DAdvanceAdjustmentTables(db) {
    addColumnIfMissing(db, "invoices", "gem_order_number", "TEXT");

    db.exec(`
      CREATE TABLE IF NOT EXISTS advance_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('receipt','supplier')),
        advance_id INTEGER NOT NULL,
        billing_id INTEGER,
        procurement_id INTEGER,
        order_id INTEGER,
        adjusted_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Active',
        reason TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reversed_by INTEGER,
        reversed_at TEXT,
        reversal_reason TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id)
      );
    `);
  }

  function addAllocationWorkflowTables(db) {
    [
      ["allocation_status", "TEXT NOT NULL DEFAULT 'Partially Allocated'"],
      ["is_deleted", "INTEGER NOT NULL DEFAULT 0"],
      ["deleted_at", "TEXT"],
      ["reallocated_from_id", "INTEGER"],
      ["change_reason", "TEXT"],
      ["allow_excess", "INTEGER NOT NULL DEFAULT 0"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "payment_allocations", column, definition));

    [
      ["allocation_status", "TEXT NOT NULL DEFAULT 'Partially Allocated'"],
      ["is_deleted", "INTEGER NOT NULL DEFAULT 0"],
      ["deleted_at", "TEXT"],
      ["reallocated_from_id", "INTEGER"],
      ["change_reason", "TEXT"],
      ["allow_excess", "INTEGER NOT NULL DEFAULT 0"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "supplier_payment_allocations", column, definition));

    addColumnIfMissing(db, "procurements", "due_date", "TEXT");
    addColumnIfMissing(db, "receivables", "allocation_status", "TEXT NOT NULL DEFAULT 'Unallocated'");

    db.exec(`
      CREATE TABLE IF NOT EXISTS credit_terms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        party_type TEXT NOT NULL CHECK(party_type IN ('department','supplier')),
        party_id INTEGER NOT NULL,
        default_credit_days INTEGER NOT NULL DEFAULT 30,
        grace_period INTEGER NOT NULL DEFAULT 0,
        due_date_rule TEXT NOT NULL DEFAULT 'invoice_date',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, party_type, party_id),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE TABLE IF NOT EXISTS advance_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        department_id INTEGER NOT NULL,
        payment_id INTEGER,
        order_id INTEGER,
        advance_received REAL NOT NULL DEFAULT 0,
        advance_adjusted REAL NOT NULL DEFAULT 0,
        balance_advance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open',
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (department_id) REFERENCES government_departments(id),
        FOREIGN KEY (payment_id) REFERENCES payments(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id)
      );

      CREATE TABLE IF NOT EXISTS supplier_advances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        supplier_payment_id INTEGER,
        advance_paid REAL NOT NULL DEFAULT 0,
        advance_adjusted REAL NOT NULL DEFAULT 0,
        balance_advance REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open',
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id)
      );

      CREATE TABLE IF NOT EXISTS allocation_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        allocation_type TEXT NOT NULL,
        allocation_id INTEGER,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);
  }

  function addPhase5AccountingControls(db) {
    ["procurements", "expense_entries", "invoices", "payments"].forEach((table) => {
      addColumnIfMissing(db, table, "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");
      addColumnIfMissing(db, table, "approval_status", "TEXT NOT NULL DEFAULT 'Draft'");
      addColumnIfMissing(db, table, "posting_error", "TEXT");
      addColumnIfMissing(db, table, "approved_by", "INTEGER REFERENCES users(id)");
      addColumnIfMissing(db, table, "approved_at", "TEXT");
      addColumnIfMissing(db, table, "posted_by", "INTEGER REFERENCES users(id)");
      addColumnIfMissing(db, table, "posted_at", "TEXT");
      addColumnIfMissing(db, table, "financial_year_id", "INTEGER");
      addColumnIfMissing(db, table, "locked_at", "TEXT");
    });
    addColumnIfMissing(db, "supplier_payments", "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");

    addColumnIfMissing(db, "vouchers", "financial_year_id", "INTEGER");
    addColumnIfMissing(db, "vouchers", "reversal_reason", "TEXT");
    addColumnIfMissing(db, "vouchers", "reversal_date", "TEXT");
    addColumnIfMissing(db, "vouchers", "reversed_by", "INTEGER REFERENCES users(id)");
    addColumnIfMissing(db, "vouchers", "approval_status", "TEXT NOT NULL DEFAULT 'Approved'");

    db.exec(`
      CREATE TABLE IF NOT EXISTS financial_years (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        financial_year_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        closed_at TEXT,
        closed_by INTEGER,
        reopened_at TEXT,
        reopened_by INTEGER,
        locked_at TEXT,
        locked_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, financial_year_name),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (closed_by) REFERENCES users(id),
        FOREIGN KEY (reopened_by) REFERENCES users(id),
        FOREIGN KEY (locked_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS opening_balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        financial_year_id INTEGER NOT NULL,
        balance_type TEXT NOT NULL,
        linked_id INTEGER,
        account_id INTEGER,
        opening_debit REAL NOT NULL DEFAULT 0,
        opening_credit REAL NOT NULL DEFAULT 0,
        voucher_id INTEGER,
        remarks TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (financial_year_id) REFERENCES financial_years(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (created_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS approval_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        module_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        approval_status TEXT NOT NULL DEFAULT 'Draft',
        maker_id INTEGER,
        checker_id INTEGER,
        submitted_at TEXT,
        approved_at TEXT,
        rejected_at TEXT,
        remarks TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(module_name, record_id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (maker_id) REFERENCES users(id),
        FOREIGN KEY (checker_id) REFERENCES users(id)
      );
    `);

    seedFinancialYears(db);
    backfillPostingStatuses(db);
  }

  function addPhase6YearEndControls(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS year_end_closings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        from_financial_year_id INTEGER NOT NULL,
        to_financial_year_id INTEGER NOT NULL,
        closing_date TEXT NOT NULL,
        trial_balance_difference REAL NOT NULL DEFAULT 0,
        balance_sheet_difference REAL NOT NULL DEFAULT 0,
        net_profit REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Draft',
        approved_by INTEGER,
        approved_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, from_financial_year_id, to_financial_year_id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_financial_year_id) REFERENCES financial_years(id),
        FOREIGN KEY (to_financial_year_id) REFERENCES financial_years(id),
        FOREIGN KEY (approved_by) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS carry_forward_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        from_financial_year_id INTEGER NOT NULL,
        to_financial_year_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        party_type TEXT,
        party_id INTEGER,
        closing_balance REAL NOT NULL DEFAULT 0,
        opening_balance_created INTEGER NOT NULL DEFAULT 0,
        opening_voucher_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        approved_by INTEGER,
        status TEXT NOT NULL DEFAULT 'Draft',
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_financial_year_id) REFERENCES financial_years(id),
        FOREIGN KEY (to_financial_year_id) REFERENCES financial_years(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (opening_voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (approved_by) REFERENCES users(id)
      );
    `);
  }

  function createAccountingTables(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        account_name TEXT NOT NULL,
        account_code TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK(account_type IN ('Asset','Liability','Equity','Income','Expense')),
        parent_account_id INTEGER,
        opening_balance REAL NOT NULL DEFAULT 0,
        normal_balance TEXT NOT NULL CHECK(normal_balance IN ('Debit','Credit')),
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, account_code),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (parent_account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        voucher_number TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        voucher_type TEXT NOT NULL CHECK(voucher_type IN ('Sales','Purchase','Receipt','Payment','Journal','Credit Note','Debit Note','Contra')),
        narration TEXT,
        source_module TEXT,
        source_id INTEGER,
        status TEXT NOT NULL DEFAULT 'Posted',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, voucher_number),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );

      CREATE TABLE IF NOT EXISTS voucher_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voucher_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        narration TEXT,
        linked_party_type TEXT,
        linked_party_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS ledger_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        voucher_id INTEGER NOT NULL,
        voucher_line_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        entry_date TEXT NOT NULL,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        running_balance REAL NOT NULL DEFAULT 0,
        source_module TEXT,
        source_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (voucher_line_id) REFERENCES voucher_lines(id),
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS cash_bank_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        bank_account_id INTEGER,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        source_module TEXT,
        source_id INTEGER,
        voucher_id INTEGER,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        payment_mode TEXT,
        utr_number TEXT,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (bank_account_id) REFERENCES banks(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        item_id INTEGER,
        item_description TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        unit TEXT,
        quoted_rate REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        taxable_value REAL NOT NULL DEFAULT 0,
        gst_amount REAL NOT NULL DEFAULT 0,
        gross_value REAL NOT NULL DEFAULT 0,
        required_delivery_date TEXT,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS procurement_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        procurement_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        order_item_id INTEGER,
        item_id INTEGER,
        description TEXT,
        hsn TEXT,
        unit TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        purchase_rate REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        taxable_value REAL NOT NULL DEFAULT 0,
        gst_amount REAL NOT NULL DEFAULT 0,
        gross_value REAL NOT NULL DEFAULT 0,
        freight REAL NOT NULL DEFAULT 0,
        loading_charges REAL NOT NULL DEFAULT 0,
        other_cost REAL NOT NULL DEFAULT 0,
        landed_cost REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (procurement_id) REFERENCES procurements(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (order_item_id) REFERENCES order_items(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        billing_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        order_item_id INTEGER,
        item_id INTEGER,
        quantity REAL NOT NULL DEFAULT 0,
        billing_rate REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        taxable_value REAL NOT NULL DEFAULT 0,
        cgst REAL NOT NULL DEFAULT 0,
        sgst REAL NOT NULL DEFAULT 0,
        igst REAL NOT NULL DEFAULT 0,
        gst_amount REAL NOT NULL DEFAULT 0,
        gross_value REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (billing_id) REFERENCES invoices(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (order_item_id) REFERENCES order_items(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS receivables (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        billing_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        department_id INTEGER,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        invoice_amount REAL NOT NULL DEFAULT 0,
        amount_received REAL NOT NULL DEFAULT 0,
        tds_deducted REAL NOT NULL DEFAULT 0,
        gst_tds_deducted REAL NOT NULL DEFAULT 0,
        other_deductions REAL NOT NULL DEFAULT 0,
        balance_outstanding REAL NOT NULL DEFAULT 0,
        due_date TEXT,
        days_outstanding INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, billing_id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (billing_id) REFERENCES invoices(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (department_id) REFERENCES government_departments(id)
      );

      CREATE TABLE IF NOT EXISTS payment_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        payment_id INTEGER NOT NULL,
        billing_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        allocated_amount REAL NOT NULL DEFAULT 0,
        tds_deducted REAL NOT NULL DEFAULT 0,
        gst_tds_deducted REAL NOT NULL DEFAULT 0,
        other_deductions REAL NOT NULL DEFAULT 0,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (payment_id) REFERENCES payments(id),
        FOREIGN KEY (billing_id) REFERENCES invoices(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id)
      );

      CREATE TABLE IF NOT EXISTS supplier_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        bank_account_id INTEGER,
        payment_mode TEXT,
        utr_number TEXT UNIQUE,
        amount_paid REAL NOT NULL DEFAULT 0,
        remarks TEXT,
        voucher_id INTEGER,
        posting_status TEXT NOT NULL DEFAULT 'Draft',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (bank_account_id) REFERENCES banks(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      );

      CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        supplier_payment_id INTEGER NOT NULL,
        procurement_id INTEGER NOT NULL,
        allocated_amount REAL NOT NULL DEFAULT 0,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (supplier_payment_id) REFERENCES supplier_payments(id),
        FOREIGN KEY (procurement_id) REFERENCES procurements(id)
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        user_id INTEGER,
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS feedback_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER,
        user_id INTEGER,
        user_name TEXT,
        category TEXT NOT NULL DEFAULT 'suggestion' CHECK(category IN ('suggestion','bug','question','improvement','other')),
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','closed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved_at TEXT,
        resolution_notes TEXT,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  }

  function addPhase7InventoryTables(db) {
    [
      ["opening_stock", "REAL NOT NULL DEFAULT 0"],
      ["opening_rate", "REAL NOT NULL DEFAULT 0"],
      ["opening_value", "REAL NOT NULL DEFAULT 0"],
      ["reorder_level", "REAL NOT NULL DEFAULT 0"],
      ["minimum_stock_level", "REAL NOT NULL DEFAULT 0"],
      ["maximum_stock_level", "REAL NOT NULL DEFAULT 0"],
      ["track_serial_number", "INTEGER NOT NULL DEFAULT 0"],
      ["track_batch_number", "INTEGER NOT NULL DEFAULT 0"],
      ["warranty_period", "INTEGER NOT NULL DEFAULT 0"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "items", column, definition));

    db.exec(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warehouse_name TEXT NOT NULL UNIQUE,
        location TEXT,
        responsible_person TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stock_inwards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        procurement_id INTEGER,
        order_id INTEGER,
        supplier_id INTEGER,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        inward_date TEXT NOT NULL,
        purchase_invoice_number TEXT,
        quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        landed_cost REAL NOT NULL DEFAULT 0,
        serial_number TEXT,
        batch_number TEXT,
        remarks TEXT,
        posting_status TEXT NOT NULL DEFAULT 'Draft',
        approval_status TEXT NOT NULL DEFAULT 'Draft',
        posting_error TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (procurement_id) REFERENCES procurements(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      CREATE TABLE IF NOT EXISTS stock_outwards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        department_id INTEGER,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        issue_date TEXT NOT NULL,
        delivery_challan_number TEXT,
        quantity_issued REAL NOT NULL DEFAULT 0,
        serial_number TEXT,
        batch_number TEXT,
        remarks TEXT,
        posting_status TEXT NOT NULL DEFAULT 'Draft',
        approval_status TEXT NOT NULL DEFAULT 'Draft',
        posting_error TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (department_id) REFERENCES government_departments(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      CREATE TABLE IF NOT EXISTS stock_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        transaction_date TEXT NOT NULL,
        document_number TEXT,
        transaction_type TEXT NOT NULL,
        inward_quantity REAL NOT NULL DEFAULT 0,
        outward_quantity REAL NOT NULL DEFAULT 0,
        balance_quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        value REAL NOT NULL DEFAULT 0,
        order_id INTEGER,
        supplier_id INTEGER,
        department_id INTEGER,
        source_module TEXT NOT NULL,
        source_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      CREATE TABLE IF NOT EXISTS serial_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        supplier_id INTEGER,
        procurement_id INTEGER,
        purchase_invoice_number TEXT,
        serial_number TEXT NOT NULL,
        warehouse_id INTEGER,
        order_id INTEGER,
        department_id INTEGER,
        delivery_date TEXT,
        warranty_expiry TEXT,
        status TEXT NOT NULL DEFAULT 'In Stock',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, item_id, serial_number),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        supplier_id INTEGER,
        procurement_id INTEGER,
        batch_number TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        balance_quantity REAL NOT NULL DEFAULT 0,
        purchase_date TEXT,
        expiry_date TEXT,
        warehouse_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, item_id, warehouse_id, batch_number),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );

      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        adjustment_date TEXT NOT NULL,
        adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('Increase','Decrease')),
        quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        reason TEXT,
        remarks TEXT,
        posting_status TEXT NOT NULL DEFAULT 'Draft',
        approval_status TEXT NOT NULL DEFAULT 'Pending Approval',
        posting_error TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      CREATE TABLE IF NOT EXISTS stock_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        return_type TEXT NOT NULL CHECK(return_type IN ('Department','Supplier')),
        order_id INTEGER,
        supplier_id INTEGER,
        department_id INTEGER,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        return_date TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        condition_status TEXT NOT NULL DEFAULT 'Good',
        reason TEXT,
        remarks TEXT,
        posting_status TEXT NOT NULL DEFAULT 'Draft',
        approval_status TEXT NOT NULL DEFAULT 'Draft',
        posting_error TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        deleted_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );
    `);
  }

  function addPhase8BankStatementTables(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bank_statement_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        bank_id INTEGER,
        bank_name TEXT NOT NULL DEFAULT 'Generic Format',
        source_file_name TEXT,
        file_hash TEXT,
        total_rows INTEGER NOT NULL DEFAULT 0,
        valid_rows INTEGER NOT NULL DEFAULT 0,
        duplicate_rows INTEGER NOT NULL DEFAULT 0,
        error_rows INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Draft',
        column_mapping TEXT,
        imported_by INTEGER,
        imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_by INTEGER,
        reviewed_at TEXT,
        approved_by INTEGER,
        approved_at TEXT,
        rejected_by INTEGER,
        rejected_at TEXT,
        rejection_reason TEXT,
        posting_status TEXT NOT NULL DEFAULT 'Not Posted',
        posted_at TEXT,
        remarks TEXT,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (bank_id) REFERENCES banks(id)
      );

      CREATE TABLE IF NOT EXISTS bank_statement_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        import_id INTEGER NOT NULL,
        bank_id INTEGER,
        transaction_date TEXT,
        narration TEXT,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        utr TEXT,
        reference_number TEXT,
        cheque_number TEXT,
        amount REAL NOT NULL DEFAULT 0,
        entry_type TEXT NOT NULL DEFAULT 'Unknown',
        duplicate_key TEXT,
        validation_status TEXT NOT NULL DEFAULT 'Draft',
        validation_errors TEXT,
        review_status TEXT NOT NULL DEFAULT 'Draft',
        match_status TEXT NOT NULL DEFAULT 'Unmatched',
        matched_module TEXT,
        matched_record_id INTEGER,
        matched_reference TEXT,
        matched_score INTEGER NOT NULL DEFAULT 0,
        voucher_id INTEGER,
        billing_id INTEGER,
        payment_id INTEGER,
        supplier_payment_id INTEGER,
        order_id INTEGER,
        department_id INTEGER,
        supplier_id INTEGER,
        posted_bank_book_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id),
        FOREIGN KEY (bank_id) REFERENCES banks(id)
      );

      CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        bank_entry_id INTEGER NOT NULL,
        matched_module TEXT NOT NULL,
        matched_record_id INTEGER NOT NULL,
        matched_reference TEXT,
        confidence_score INTEGER NOT NULL DEFAULT 0,
        match_method TEXT NOT NULL DEFAULT 'Auto',
        status TEXT NOT NULL DEFAULT 'Suggested',
        matched_by INTEGER,
        matched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        remarks TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (bank_entry_id) REFERENCES bank_statement_entries(id)
      );
    `);
  }

  function addPhase8BVoucherProposalTables(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS voucher_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        bank_entry_id INTEGER NOT NULL,
        import_id INTEGER,
        bank_id INTEGER,
        bank_name TEXT,
        transaction_date TEXT NOT NULL,
        narration TEXT,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        utr TEXT,
        reference_number TEXT,
        suggested_voucher_type TEXT NOT NULL,
        suggested_party_type TEXT,
        suggested_party_id INTEGER,
        suggested_party_name TEXT,
        suggested_ledger_id INTEGER,
        suggested_ledger_name TEXT,
        linked_invoice_id INTEGER,
        linked_procurement_id INTEGER,
        linked_order_id INTEGER,
        linked_voucher_id INTEGER,
        confidence_score INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Suggested',
        draft_voucher_id INTEGER,
        posted_voucher_id INTEGER,
        reviewed_by INTEGER,
        reviewed_at TEXT,
        approved_by INTEGER,
        approved_at TEXT,
        rejected_by INTEGER,
        rejected_at TEXT,
        rejection_reason TEXT,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(bank_entry_id),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (bank_entry_id) REFERENCES bank_statement_entries(id),
        FOREIGN KEY (import_id) REFERENCES bank_statement_imports(id),
        FOREIGN KEY (bank_id) REFERENCES banks(id),
        FOREIGN KEY (draft_voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (posted_voucher_id) REFERENCES vouchers(id)
      );

      CREATE TABLE IF NOT EXISTS voucher_proposal_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        proposal_id INTEGER NOT NULL,
        bank_entry_id INTEGER,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        remarks TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (proposal_id) REFERENCES voucher_proposals(id)
      );
    `);
  }

  function addBusinessVoucherInventoryTables(db) {
    [
      ["item_code", "TEXT"],
      ["inventory_enabled", "INTEGER NOT NULL DEFAULT 1"],
      ["default_warehouse_id", "INTEGER"],
      ["valuation_method", "TEXT NOT NULL DEFAULT 'Weighted Average'"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "items", column, definition));

    [
      ["company_id", "INTEGER"],
      ["warehouse_type", "TEXT NOT NULL DEFAULT 'Main Warehouse'"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "warehouses", column, definition));

    [
      ["procurement_id", "INTEGER"],
      ["billing_id", "INTEGER"],
      ["quantity_in", "REAL NOT NULL DEFAULT 0"],
      ["quantity_out", "REAL NOT NULL DEFAULT 0"],
      ["running_quantity", "REAL NOT NULL DEFAULT 0"],
      ["running_value", "REAL NOT NULL DEFAULT 0"],
      ["valuation_method", "TEXT NOT NULL DEFAULT 'Weighted Average'"],
      ["remarks", "TEXT"],
      ["voucher_id", "INTEGER"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "stock_ledger", column, definition));
    addColumnIfMissing(db, "stock_ledger", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

    ["stock_inwards", "stock_outwards", "stock_adjustments", "stock_returns"].forEach((table) => {
      addColumnIfMissing(db, table, "voucher_id", "INTEGER");
    });

    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        movement_date TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        from_warehouse_id INTEGER,
        to_warehouse_id INTEGER,
        item_id INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        value REAL NOT NULL DEFAULT 0,
        source_module TEXT,
        source_id INTEGER,
        order_id INTEGER,
        remarks TEXT,
        voucher_id INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (voucher_id) REFERENCES vouchers(id)
      );

      CREATE TABLE IF NOT EXISTS stock_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        order_item_id INTEGER,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER,
        reserved_quantity REAL NOT NULL DEFAULT 0,
        issued_quantity REAL NOT NULL DEFAULT 0,
        balance_reserved REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Reserved',
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TEXT,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (order_item_id) REFERENCES order_items(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );
    `);

    db.prepare("UPDATE warehouses SET company_id = COALESCE(company_id, (SELECT id FROM companies ORDER BY id LIMIT 1)) WHERE company_id IS NULL").run();
  }

  function addPhase10InventoryAutomationTables(db) {
    addColumnIfMissing(db, "supply_orders", "reservation_status", "TEXT NOT NULL DEFAULT 'Procurement Required'");
    addColumnIfMissing(db, "supply_orders", "procurement_required", "INTEGER NOT NULL DEFAULT 0");

    [
      ["available_quantity", "REAL NOT NULL DEFAULT 0"],
      ["short_quantity", "REAL NOT NULL DEFAULT 0"],
      ["procurement_required", "INTEGER NOT NULL DEFAULT 0"],
      ["procurement_required_quantity", "REAL NOT NULL DEFAULT 0"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "stock_reservations", column, definition));

    db.exec(`
      CREATE TABLE IF NOT EXISTS guided_vouchers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        voucher_kind TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        narration TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        posted_voucher_id INTEGER,
        created_by INTEGER,
        submitted_by INTEGER,
        reviewed_by INTEGER,
        approved_by INTEGER,
        posted_by INTEGER,
        submitted_at TEXT,
        reviewed_at TEXT,
        approved_at TEXT,
        posted_at TEXT,
        reversed_at TEXT,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (posted_voucher_id) REFERENCES vouchers(id)
      );

      CREATE TABLE IF NOT EXISTS goods_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        grn_number TEXT NOT NULL,
        purchase_voucher_id INTEGER,
        guided_voucher_id INTEGER,
        procurement_id INTEGER,
        supplier_id INTEGER,
        warehouse_id INTEGER NOT NULL,
        grn_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Draft',
        remarks TEXT,
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, grn_number),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (purchase_voucher_id) REFERENCES vouchers(id),
        FOREIGN KEY (guided_voucher_id) REFERENCES guided_vouchers(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
      );

      CREATE TABLE IF NOT EXISTS goods_receipt_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        grn_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        order_id INTEGER,
        purchase_invoice_number TEXT,
        quantity_received REAL NOT NULL DEFAULT 0,
        damaged_quantity REAL NOT NULL DEFAULT 0,
        accepted_quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        gst_rate REAL NOT NULL DEFAULT 0,
        landed_cost REAL NOT NULL DEFAULT 0,
        stock_inward_id INTEGER,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (grn_id) REFERENCES goods_receipts(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (stock_inward_id) REFERENCES stock_inwards(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_challans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        challan_number TEXT NOT NULL,
        order_id INTEGER NOT NULL,
        department_id INTEGER,
        dispatch_date TEXT NOT NULL,
        vehicle_details TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        remarks TEXT,
        confirmed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, challan_number),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (department_id) REFERENCES government_departments(id)
      );

      CREATE TABLE IF NOT EXISTS delivery_challan_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        delivery_challan_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        stock_outward_id INTEGER,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (delivery_challan_id) REFERENCES delivery_challans(id),
        FOREIGN KEY (item_id) REFERENCES items(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (stock_outward_id) REFERENCES stock_outwards(id)
      );

      CREATE TABLE IF NOT EXISTS warehouse_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        transfer_number TEXT NOT NULL,
        from_warehouse_id INTEGER NOT NULL,
        to_warehouse_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        transfer_date TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        rate REAL NOT NULL DEFAULT 0,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        posted_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        UNIQUE(company_id, transfer_number),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
    `);

    [
      ["submitted_by", "INTEGER"],
      ["submitted_at", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "guided_vouchers", column, definition));
  }

  function addAuditAndPostingFixes(db) {
    ["employees", "government_departments", "suppliers", "expense_heads", "banks"].forEach((table) => {
      if (!tableExists(db, table)) return;
      addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing(db, table, "deleted_at", "TEXT");
      addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
    });
    addColumnIfMissing(db, "supply_orders", "posting_status", "TEXT NOT NULL DEFAULT 'Draft'");
    const linked = db.prepare(`
      SELECT DISTINCT so.id FROM supply_orders so
      WHERE COALESCE(so.is_deleted, 0) = 0 AND COALESCE(so.posting_status, 'Draft') = 'Draft'
      AND (
        EXISTS (SELECT 1 FROM procurements p WHERE p.order_id = so.id AND COALESCE(p.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM invoices i WHERE i.order_id = so.id AND COALESCE(i.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM payments pm WHERE pm.order_id = so.id AND COALESCE(pm.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM expense_entries ee WHERE ee.order_id = so.id AND COALESCE(ee.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM stock_inwards si WHERE si.order_id = so.id AND COALESCE(si.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM stock_outwards so2 WHERE so2.order_id = so.id AND COALESCE(so2.is_deleted, 0) = 0)
        OR EXISTS (SELECT 1 FROM stock_returns sr WHERE sr.order_id = so.id AND COALESCE(sr.is_deleted, 0) = 0)
      )
    `).all();
    for (const row of linked) {
      db.prepare("UPDATE supply_orders SET posting_status = 'Locked' WHERE id = ?").run(row.id);
    }
  }

  function applyWorkIncentiveTerminology(db) {
    if (tableExists(db, "accounts")) {
      db.prepare(`
        UPDATE accounts
        SET account_name = 'Work Incentive Expense', updated_at = CURRENT_TIMESTAMP
        WHERE account_name = 'Commission Expense'
      `).run();
    }
    if (tableExists(db, "expense_heads")) {
      db.prepare(`
        UPDATE expense_heads
        SET expense_head_name = 'Work Incentive', category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
        WHERE expense_head_name = 'Commission'
      `).run();
      db.prepare(`
        UPDATE expense_heads
        SET category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
        WHERE category = 'Commission'
      `).run();
    }
    if (tableExists(db, "expense_entries")) {
      db.prepare(`
        UPDATE expense_entries
        SET expense_category = 'Work Incentive', updated_at = CURRENT_TIMESTAMP
        WHERE expense_category = 'Commission'
      `).run();
    }
  }

  function addPhase15HMasterDataToolsColumns(db) {
    [
      ["companies", "company_code", "TEXT"],
      ["employees", "employee_code", "TEXT"],
      ["employees", "email", "TEXT"],
      ["employees", "pan", "TEXT"],
      ["employees", "aadhaar_last4", "TEXT"],
      ["employees", "bank_name", "TEXT"],
      ["employees", "account_number", "TEXT"],
      ["employees", "ifsc", "TEXT"],
      ["employees", "branch", "TEXT"],
      ["employees", "joining_date", "TEXT"],
      ["employees", "remarks", "TEXT"],
      ["government_departments", "department_code", "TEXT"],
      ["government_departments", "gstin", "TEXT"],
      ["government_departments", "billing_address", "TEXT"],
      ["government_departments", "consignee_address", "TEXT"],
      ["government_departments", "district", "TEXT"],
      ["government_departments", "state", "TEXT"],
      ["government_departments", "pincode", "TEXT"],
      ["government_departments", "mobile", "TEXT"],
      ["government_departments", "email", "TEXT"],
      ["government_departments", "payment_authority", "TEXT"],
      ["government_departments", "remarks", "TEXT"],
      ["suppliers", "pan", "TEXT"],
      ["suppliers", "address", "TEXT"],
      ["suppliers", "city", "TEXT"],
      ["suppliers", "state", "TEXT"],
      ["suppliers", "pincode", "TEXT"],
      ["suppliers", "contact_person", "TEXT"],
      ["suppliers", "mobile", "TEXT"],
      ["suppliers", "email", "TEXT"],
      ["suppliers", "upi_id", "TEXT"],
      ["suppliers", "msme_number", "TEXT"],
      ["suppliers", "payment_terms", "TEXT"],
      ["items", "oem_name", "TEXT"],
      ["items", "make_in_india_class", "TEXT"],
      ["items", "country_of_origin", "TEXT"],
      ["items", "remarks", "TEXT"],
      ["warehouses", "warehouse_code", "TEXT"],
      ["warehouses", "address", "TEXT"],
      ["warehouses", "incharge_name", "TEXT"],
      ["warehouses", "mobile", "TEXT"],
      ["warehouses", "remarks", "TEXT"],
      ["expense_heads", "expense_head_code", "TEXT"],
      ["expense_heads", "default_gst_rate", "REAL"],
      ["expense_heads", "remarks", "TEXT"],
      ["banks", "bank_code", "TEXT"],
      ["banks", "branch", "TEXT"],
      ["banks", "remarks", "TEXT"]
    ].forEach(([table, column, definition]) => addColumnIfMissing(db, table, column, definition));
  }

  function addSupplyOrderItemEntryEnhancement(db) {
    [
      ["supply_type", "TEXT NOT NULL DEFAULT 'GeM'"],
      ["buyer_name", "TEXT"],
      ["buyer_designation", "TEXT"],
      ["buyer_mobile", "TEXT"],
      ["buyer_email", "TEXT"],
      ["consignee_address", "TEXT"],
      ["delivery_location", "TEXT"],
      ["delivery_period", "TEXT"],
      ["warranty_period", "TEXT"],
      ["payment_terms", "TEXT"],
      ["emd_amount", "REAL NOT NULL DEFAULT 0"],
      ["security_deposit_amount", "REAL NOT NULL DEFAULT 0"],
      ["total_quantity", "REAL NOT NULL DEFAULT 0"],
      ["order_taxable_value", "REAL NOT NULL DEFAULT 0"],
      ["order_gst_amount", "REAL NOT NULL DEFAULT 0"],
      ["order_gross_value", "REAL NOT NULL DEFAULT 0"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));

    [
      ["brand", "TEXT"],
      ["model", "TEXT"],
      ["hsn_sac", "TEXT"],
      ["required_delivery_date", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "order_items", column, definition));
  }

  function addCoreControlHardening(db) {
    addColumnIfMissing(db, "users", "failed_login_count", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "users", "locked_until", "TEXT");
    addColumnIfMissing(db, "users", "force_password_change", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "users", "last_login_at", "TEXT");
    addColumnIfMissing(db, "users", "password_changed_at", "TEXT");

    addColumnIfMissing(db, "audit_log", "user_role", "TEXT");
    addColumnIfMissing(db, "audit_log", "module", "TEXT");
    addColumnIfMissing(db, "audit_log", "event_hash", "TEXT");

    addColumnIfMissing(db, "import_batches", "module", "TEXT");
    addColumnIfMissing(db, "import_batches", "rows_imported", "INTEGER NOT NULL DEFAULT 0");
    addColumnIfMissing(db, "import_batches", "imported_by", "INTEGER");
    addColumnIfMissing(db, "import_batches", "imported_at", "TEXT");

    db.exec(`
      CREATE TABLE IF NOT EXISTS import_batch_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        rolled_back_at TEXT,
        FOREIGN KEY (batch_id) REFERENCES import_batches(id)
      );
    `);

    db.prepare("UPDATE users SET role = 'admin' WHERE LOWER(role) = 'administrator'").run();
    db.prepare("UPDATE users SET password_changed_at = COALESCE(password_changed_at, created_at)").run();
  }

  function addPhase13OperationsHardening(db) {
    [
      ["gem_order_number", "TEXT"],
      ["gem_contract_number", "TEXT"],
      ["consignee", "TEXT"],
      ["place_of_supply", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));

    addColumnIfMissing(db, "procurements", "procurement_status", "TEXT NOT NULL DEFAULT 'Draft'");

    [
      ["billing_id", "INTEGER REFERENCES invoices(id)"],
      ["invoice_outstanding", "REAL NOT NULL DEFAULT 0"],
      ["tds_deducted", "REAL NOT NULL DEFAULT 0"],
      ["gst_tds_deducted", "REAL NOT NULL DEFAULT 0"],
      ["other_deductions", "REAL NOT NULL DEFAULT 0"],
      ["net_receipt", "REAL NOT NULL DEFAULT 0"],
      ["allocation_status", "TEXT NOT NULL DEFAULT 'Unallocated'"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "payments", column, definition));
  }

  function addCompanyContextLayer(db) {
    addColumnIfMissing(db, "banks", "company_id", "INTEGER REFERENCES companies(id)");
    const company = db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get();
    if (company) {
      db.prepare("UPDATE banks SET company_id = ? WHERE company_id IS NULL").run(company.id);
    }
  }

  function addRuntimeSoftDeleteColumns(db) {
    [
      ...ACCOUNTING_TABLES,
      "companies",
      "items",
      "warehouses",
      "documents",
      "goods_receipts",
      "delivery_challans",
      "warehouse_transfers",
      "guided_vouchers",
      "advance_receipts",
      "supplier_advances",
      "advance_adjustments",
      "credit_terms",
      "bank_statement_imports",
      "bank_statement_entries",
      "voucher_proposals",
      "bank_reconciliation_matches",
      "voucher_proposal_audit",
      "inventory_movements",
      "stock_reservations",
      "allocation_audit",
      "approval_queue"
    ].forEach((table) => {
      if (!tableExists(db, table)) return;
      addColumnIfMissing(db, table, "is_deleted", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing(db, table, "deleted_at", "TEXT");
      addColumnIfMissing(db, table, "deleted_by", "INTEGER REFERENCES users(id)");
    });
  }

  function addSupplierExtendedFields(db) {
    [
      ["supplier_type", "TEXT"],
      ["supplier_code", "TEXT"],
      ["date_of_activation", "TEXT"],
      ["supplier_account_name", "TEXT"],
      ["supplier_account_number", "TEXT"],
      ["supplier_bank_name", "TEXT"],
      ["supplier_bank_ifsc_code", "TEXT"],
      ["supplier_branch", "TEXT"],
      ["supplier_contact", "TEXT"],
      ["remarks", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "suppliers", column, definition));
  }

  function addPhase15iCracTables(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS crac_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        supply_order_id INTEGER NOT NULL,
        department_id INTEGER,
        invoice_id INTEGER,
        crac_number TEXT,
        crac_date TEXT,
        crac_amount REAL NOT NULL DEFAULT 0,
        crac_status TEXT NOT NULL DEFAULT 'Pending',
        issued_by TEXT,
        issuing_designation TEXT,
        department TEXT,
        remarks TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (supply_order_id) REFERENCES supply_orders(id),
        FOREIGN KEY (department_id) REFERENCES government_departments(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
    `);

    [
      ["crac_status", "TEXT NOT NULL DEFAULT 'Not Required'"],
      ["crac_number", "TEXT"],
      ["crac_date", "TEXT"],
      ["crac_amount", "REAL NOT NULL DEFAULT 0"],
      ["crac_issued_by", "TEXT"],
      ["crac_issuing_designation", "TEXT"],
      ["crac_department", "TEXT"],
      ["crac_remarks", "TEXT"],
      ["supply_completed_at", "TEXT"],
      ["installation_completed_at", "TEXT"],
      ["is_supply_completed", "INTEGER NOT NULL DEFAULT 0"],
      ["is_installation_completed", "INTEGER NOT NULL DEFAULT 0"],
      ["closure_checklist", "TEXT"],
      ["closure_percentage", "REAL NOT NULL DEFAULT 0"],
      ["operationally_closed", "INTEGER NOT NULL DEFAULT 0"],
      ["operationally_closed_at", "TEXT"]
    ].forEach(([column, definition]) => addColumnIfMissing(db, "supply_orders", column, definition));
  }

  return {
    addAccountingColumns,
    addBillingVoucherEnhancementFields,
    addPhase6DAdvanceAdjustmentTables,
    addAllocationWorkflowTables,
    addPhase5AccountingControls,
    addPhase6YearEndControls,
    createAccountingTables,
    addPhase7InventoryTables,
    addPhase8BankStatementTables,
    addPhase8BVoucherProposalTables,
    addBusinessVoucherInventoryTables,
    addPhase10InventoryAutomationTables,
    addAuditAndPostingFixes,
    applyWorkIncentiveTerminology,
    addPhase15HMasterDataToolsColumns,
    addSupplyOrderItemEntryEnhancement,
    addCoreControlHardening,
    addPhase13OperationsHardening,
    addCompanyContextLayer,
    addRuntimeSoftDeleteColumns,
    addSupplierExtendedFields,
    addPhase15iCracTables
  };
}
