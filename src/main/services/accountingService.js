export function createAccountingService(deps) {
  const {
    auditLog, cleanPayload, createRecord, updateRecord, deleteRecord,
    getRecord, listRecords, tableExists, assertTable, assertWriteAllowed,
    activeRowClause, accountId, nextVoucherNumber, postLedgerEntry,
    businessVoucherPayload, allocationAudit, markPosted, markPostingError,
    upsertReceivable, refreshReceivable, updateCashBankLedger,
    auditVoucherDependencySync, receiptUnallocatedAmount,
    supplierPaymentUnallocatedAmount, partyControlAccount,
    purchaseOutstandingAmount, receivableOutstandingBeforeAdjustment,
    referenceData, postingControlReport, assertOpenFinancialYear,
    seedFinancialYears, financialYearForDate,
    parseGuidedVoucherPayload, postedGuidedNoteAdjustments,
    creditDueDate, daysBetween, allocationStatus,
    receiptAdvanceAdjustedForBilling, supplierAdvanceAdjustedForProcurement,
    dayBook, trialBalance, balanceSheetReport, profitLossReport,
    gstSummary, supplierPayableReport, financialStatementSummary,
    partyLedgerReport, departmentLedgerReport, supplierLedgerReport,
    billWiseReceivableReport, billWisePayableReport,
    paymentAllocationReport, supplierPaymentAllocationReport,
    receivableAgeingReport, payableAgeingReport,
    tdsReconciliationReport, gstTdsReconciliationReport,
    partyLedgerSummaryReport, partyReconciliationReport,
    allocationReconciliationReport,
    unallocatedReceiptsReport, unallocatedSupplierPaymentsReport,
    advanceReceiptReport, supplierAdvanceReport, advanceAdjustmentReport,
    allocationAuditReport, creditTermsReport,
    financialControlReport, openingBalanceReport,
    approvalQueueReport,
    gstRegisters, tdsRegisters, accountingRegisters,
    billOutstandingReport, yearEndClosingReport, carryForwardReport,
    createAutomaticGrnFromPurchaseVoucher, createAutomaticStockIssueFromSalesVoucher
  } = deps;

  function nextQuickLedgerAccountCode(db, companyId, accountType) {
    const prefix = { Asset: "18", Liability: "28", Equity: "38", Income: "48", Expense: "58" }[accountType] || "58";
    const last = db.prepare(`
      SELECT account_code FROM accounts
      WHERE company_id = ? AND account_code LIKE ?
      ORDER BY CAST(account_code AS INTEGER) DESC
      LIMIT 1
    `).get(companyId, `${prefix}%`)?.account_code;
    const next = last ? Number(last) + 10 : Number(`${prefix}00`);
    return String(next);
  }

  function voucherTypeDependencyEffects(voucherType = "") {
    const effects = {
      Purchase: ["general_ledger", "trial_balance", "payables", "input_gst", "purchase_register", "profitability"],
      Sales: ["general_ledger", "trial_balance", "receivables", "output_gst", "sales_register", "profitability"],
      Receipt: ["general_ledger", "trial_balance", "cash_bank", "receivables", "outstanding", "ageing", "cash_flow"],
      Payment: ["general_ledger", "trial_balance", "cash_bank", "payables", "outstanding", "ageing", "cash_flow"],
      Journal: ["general_ledger", "trial_balance", "profit_loss"],
      Contra: ["general_ledger", "trial_balance", "cash_book", "bank_book", "cash_flow"],
      "Credit Note": ["general_ledger", "trial_balance", "sales", "receivables", "output_gst", "profitability"],
      "Debit Note": ["general_ledger", "trial_balance", "purchase", "payables", "input_gst", "profitability"]
    };
    return effects[voucherType] || ["general_ledger", "trial_balance"];
  }

  function assertPositive(value, label) {
    if (Number(value || 0) <= 0) throw new Error(`${label} must be positive`);
  }

  function accountById(db, companyId, id) {
    return db.prepare("SELECT * FROM accounts WHERE company_id = ? AND id = ? AND is_deleted = 0").get(companyId, id);
  }

  function createLedgerAccount(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    const accountName = String(payload.account_name || "").trim();
    const accountType = ["Asset", "Liability", "Equity", "Income", "Expense"].includes(payload.account_type) ? payload.account_type : "Expense";
    const normalBalance = ["Debit", "Credit"].includes(payload.normal_balance)
      ? payload.normal_balance
      : ["Liability", "Equity", "Income"].includes(accountType) ? "Credit" : "Debit";
    if (!companyId) throw new Error("Company is required for ledger account quick create");
    if (!accountName) throw new Error("Account name is required");
    const duplicate = db.prepare(`
      SELECT * FROM accounts
      WHERE company_id = ? AND is_deleted = 0
        AND (LOWER(account_name) = LOWER(?) OR (? <> '' AND account_code = ?))
      LIMIT 1
    `).get(companyId, accountName, String(payload.account_code || "").trim(), String(payload.account_code || "").trim());
    if (duplicate) throw new Error("Similar ledger account already exists");
    const accountCode = String(payload.account_code || "").trim() || nextQuickLedgerAccountCode(db, companyId, accountType);
    const result = db.prepare(`
      INSERT INTO accounts (company_id, account_code, account_name, account_type, normal_balance, opening_balance, status)
      VALUES (@company_id, @account_code, @account_name, @account_type, @normal_balance, @opening_balance, 'active')
    `).run({
      company_id: companyId,
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType,
      normal_balance: normalBalance,
      opening_balance: Number(payload.opening_balance || 0)
    });
    const record = db.prepare("SELECT * FROM accounts WHERE id = ?").get(result.lastInsertRowid);
    auditLog(db, {
      company_id: companyId,
      user_id: payload.user_id || null,
      action: "quick_create",
      module: payload.source_module || "ledger_account",
      table_name: "accounts",
      record_id: result.lastInsertRowid,
      new_value: JSON.stringify(record)
    });
    return record;
  }

  function createBalancedVoucher(db, payload) {
    const financialYear = assertOpenFinancialYear(db, payload.company_id, payload.voucher_date);
    const companyId = Number(payload.company_id || 0);
    const lines = (payload.lines || []).map((line) => ({
      account_id: Number(line.account_id || 0),
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      narration: line.narration || payload.narration || "",
      linked_party_type: line.linked_party_type || null,
      linked_party_id: line.linked_party_id || null
    }));
    if (lines.length < 2) throw new Error("At least two voucher lines are required");
    const hasDebit = lines.some((line) => line.debit > 0 && line.credit === 0);
    const hasCredit = lines.some((line) => line.credit > 0 && line.debit === 0);
    if (!hasDebit) throw new Error("Voucher must have at least one debit line");
    if (!hasCredit) throw new Error("Voucher must have at least one credit line");
    if (lines.some((line) => !Number.isFinite(line.debit) || !Number.isFinite(line.credit))) {
      throw new Error("Voucher amounts must be finite numbers");
    }
    if (lines.some((line) => line.debit < 0 || line.credit < 0)) throw new Error("Voucher amounts cannot be negative");
    if (lines.some((line) => line.debit && line.credit)) throw new Error("A voucher line cannot have both debit and credit");
    if (lines.some((line) => line.debit === 0 && line.credit === 0)) throw new Error("Voucher line with zero amount is not allowed");
    lines.forEach((line) => {
      const account = db.prepare("SELECT * FROM accounts WHERE id = ? AND is_deleted = 0").get(line.account_id);
      if (!account) throw new Error(`Account ${line.account_id} not found or is deleted`);
      if (Number(account.company_id) !== companyId) throw new Error(`Account ${line.account_id} belongs to a different company`);
      if (account.status !== "active") throw new Error(`Account ${line.account_id} is not active`);
    });
    const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
    if (totalDebit === 0) throw new Error("Total debit must be non-zero");
    if (totalCredit === 0) throw new Error("Total credit must be non-zero");
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      throw new Error(`Unbalanced voucher: debit ${totalDebit}, credit ${totalCredit}`);
    }

    const transaction = db.transaction(() => {
      const voucherNumber = payload.voucher_number || nextVoucherNumber(db, payload.company_id, payload.voucher_type.toUpperCase().replaceAll(" ", ""));
      const voucherResult = db.prepare(`
        INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
        VALUES (@company_id, @voucher_number, @voucher_date, @voucher_type, @narration, @source_module, @source_id, 'Posted', @financial_year_id, 'Approved')
      `).run({ ...payload, voucher_number: voucherNumber, financial_year_id: financialYear.id });
      const voucherId = voucherResult.lastInsertRowid;
      lines.forEach((line) => {
        const lineResult = db.prepare(`
          INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, linked_party_type, linked_party_id)
          VALUES (@voucher_id, @account_id, @debit, @credit, @narration, @linked_party_type, @linked_party_id)
        `).run({
          voucher_id: voucherId,
          account_id: line.account_id,
          debit: line.debit,
          credit: line.credit,
          narration: line.narration,
          linked_party_type: line.linked_party_type,
          linked_party_id: line.linked_party_id
        });
        postLedgerEntry(db, payload.company_id, voucherId, lineResult.lastInsertRowid, line.account_id, payload.voucher_date, line.debit, line.credit, payload.source_module, payload.source_id);
      });
      auditLog(db, { company_id: payload.company_id, action: "voucher posting", table_name: "vouchers", record_id: voucherId, new_value: JSON.stringify({ voucherNumber, totalDebit }) });
      const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucherId);
      auditVoucherDependencySync(db, voucher, voucherTypeDependencyEffects(voucher.voucher_type));
      return voucher;
    });
    return transaction();
  }

  function createManualVoucher(db, payload) {
    const companyId = Number(payload.company_id || 0);
    const voucherType = String(payload.voucher_type || "").trim();
    const voucherDate = String(payload.voucher_date || "").trim();
    const lines = (payload.lines || [])
      .map((line) => ({
        account_id: Number(line.account_id || 0),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        narration: line.narration || payload.narration || "",
        linked_party_type: line.linked_party_type || null,
        linked_party_id: line.linked_party_id || null
      }))
      .filter((line) => line.account_id && (line.debit || line.credit));

    if (!companyId) throw new Error("Company is required");
    if (!voucherDate) throw new Error("Voucher date is required");
    if (!["Sales", "Purchase", "Receipt", "Payment", "Journal", "Credit Note", "Debit Note", "Contra"].includes(voucherType)) {
      throw new Error("Valid voucher type is required");
    }
    if (lines.length < 2) throw new Error("At least two voucher lines are required");

    lines.forEach((line) => {
      if (!accountById(db, companyId, line.account_id)) throw new Error("Invalid account selected");
      if (line.debit && line.credit) throw new Error("A voucher line cannot have both debit and credit");
    });

    const voucher = createBalancedVoucher(db, {
      company_id: companyId,
      voucher_number: payload.voucher_number || null,
      voucher_date: voucherDate,
      voucher_type: voucherType,
      narration: payload.narration || `Manual ${voucherType} voucher`,
      source_module: "manual_voucher",
      source_id: null,
      lines
    });

    lines.forEach((line) => {
      const account = accountById(db, companyId, line.account_id);
      if (!["Cash", "Bank"].includes(account?.account_name)) return;
      updateCashBankLedger(db, {
        company_id: companyId,
        bank_account_id: payload.bank_account_id || null,
        transaction_date: voucherDate,
        transaction_type: voucherType,
        source_module: "manual_voucher",
        source_id: voucher.id,
        voucher_id: voucher.id,
        debit: line.debit,
        credit: line.credit,
        payment_mode: account.account_name,
        utr_number: payload.reference_number || voucher.voucher_number,
        remarks: payload.narration || ""
      });
    });

    return db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucher.id);
  }

  function createBusinessVoucher(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    const voucherKind = String(payload.voucher_kind || payload.voucher_type || "").trim();
    const voucherDate = String(payload.voucher_date || payload.receipt_date || payload.payment_date || payload.invoice_date || payload.purchase_date || new Date().toISOString().slice(0, 10));
    if (!companyId) throw new Error("Company is required");
    if (!voucherKind) throw new Error("Voucher workflow is required");

    const result = db.prepare(`
      INSERT INTO guided_vouchers (company_id, voucher_kind, voucher_date, payload_json, narration, status, created_by, remarks)
      VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?)
    `).run(
      companyId,
      voucherKind,
      voucherDate,
      JSON.stringify({ ...payload, company_id: companyId, voucher_kind: voucherKind, voucher_date: voucherDate }),
      payload.narration || `${voucherKind} ${payload.reference_number || ""}`.trim(),
      payload.created_by || null,
      payload.remarks || null
    );
    const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ?").get(result.lastInsertRowid);
    auditLog(db, { company_id: companyId, user_id: payload.created_by || null, action: "guided_voucher_draft_created", table_name: "guided_vouchers", record_id: row.id, new_value: JSON.stringify({ voucherKind, status: row.status }) });
    return row;
  }

  function updateGuidedVoucherStatus(db, guidedVoucherId, action, userId = null, remarks = "") {
    const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(guidedVoucherId);
    if (!row) throw new Error("Guided voucher not found");
    const normalized = String(action || "").toLowerCase();
    const transitions = {
      submit: ["Draft", "Pending Review", "submitted_by", "guided_voucher_submitted"],
      review: ["Pending Review", "Pending Approval", "reviewed_by", "guided_voucher_reviewed"],
      approve: ["Pending Approval", "Approved", "approved_by", "guided_voucher_approved"]
    };
    const transition = transitions[normalized];
    if (!transition) throw new Error("Unsupported guided voucher action");
    const [fromStatus, toStatus, userColumn, auditAction] = transition;
    if (row.status !== fromStatus) throw new Error(`Guided voucher must be ${fromStatus} before ${normalized}`);
    const timestampColumn = normalized === "submit" ? "submitted_at" : normalized === "review" ? "reviewed_at" : "approved_at";
    db.prepare(`
      UPDATE guided_vouchers
      SET status = ?, ${userColumn} = ?, ${timestampColumn} = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(toStatus, userId, remarks, guidedVoucherId);
    auditLog(db, { company_id: row.company_id, user_id: userId, action: auditAction, table_name: "guided_vouchers", record_id: guidedVoucherId, new_value: remarks || toStatus });
    return db.prepare("SELECT * FROM guided_vouchers WHERE id = ?").get(guidedVoucherId);
  }

  function postGuidedVoucher(db, guidedVoucherId, userId = null) {
    const row = db.prepare("SELECT * FROM guided_vouchers WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(guidedVoucherId);
    if (!row) throw new Error("Guided voucher not found");
    if (row.status !== "Approved") throw new Error("Guided voucher must be Approved before posting");
    if (row.posted_voucher_id) throw new Error("Guided voucher already posted");
    const payload = JSON.parse(row.payload_json || "{}");
    const voucherPayload = businessVoucherPayload(db, row.company_id, row.voucher_kind, { ...payload, voucher_date: row.voucher_date });
    const tx = db.transaction(() => {
      const voucher = createBalancedVoucher(db, { ...voucherPayload, source_module: "guided_vouchers", source_id: row.id });
      if (voucherPayload.cashBankLine) {
        updateCashBankLedger(db, {
          company_id: row.company_id,
          bank_account_id: payload.bank_account_id || payload.bank_id || null,
          transaction_date: row.voucher_date,
          transaction_type: voucherPayload.voucher_type,
          source_module: "guided_vouchers",
          source_id: row.id,
          voucher_id: voucher.id,
          debit: voucherPayload.cashBankLine.debit || 0,
          credit: voucherPayload.cashBankLine.credit || 0,
          payment_mode: payload.payment_mode || "Bank",
          utr_number: payload.reference_number || payload.utr_number || voucher.voucher_number,
          remarks: voucherPayload.narration
        });
      }
      if (String(row.voucher_kind).toLowerCase().includes("purchase")) {
        createAutomaticGrnFromPurchaseVoucher(db, row, payload, voucher);
      }
      if (String(row.voucher_kind).toLowerCase().includes("sales")) {
        createAutomaticStockIssueFromSalesVoucher(db, row, payload, voucher);
      }
      db.prepare(`
        UPDATE guided_vouchers
        SET status = 'Posted', posted_voucher_id = ?, posted_by = ?, posted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(voucher.id, userId, row.id);
      auditLog(db, { company_id: row.company_id, user_id: userId, action: "guided_voucher_posted", table_name: "guided_vouchers", record_id: row.id, new_value: JSON.stringify({ voucher_number: voucher.voucher_number }) });
      if (["credit_note", "debit_note"].includes(String(row.voucher_kind || "").toLowerCase())) {
        auditLog(db, {
          company_id: row.company_id,
          user_id: userId,
          action: `${row.voucher_kind}_operational_correction_posted`,
          table_name: "guided_vouchers",
          record_id: row.id,
          new_value: JSON.stringify({
            voucher_number: voucher.voucher_number,
            linked_invoice_id: payload.linked_invoice_id || null,
            linked_purchase_id: payload.linked_purchase_id || null,
            reason_code: payload.reason_code || null,
            reference_number: payload.reference_number || null
          })
        });
      }
      return voucher;
    });
    return tx();
  }

  function reverseVoucher(db, voucherId, reason = "") {
    const original = db.prepare("SELECT * FROM vouchers WHERE id = ? AND is_deleted = 0").get(Number(voucherId || 0));
    if (!original) throw new Error("Voucher not found");
    if (original.status === "Reversed") throw new Error("Voucher is already reversed");
    const existingReversal = db.prepare("SELECT id FROM vouchers WHERE source_module = 'voucher_reversal' AND source_id = ? AND is_deleted = 0").get(original.id);
    if (existingReversal) throw new Error("Voucher reversal already exists");

    const lines = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(original.id);
    if (!lines.length) throw new Error("Voucher has no lines to reverse");

    const reversal = db.transaction(() => {
      const reversalVoucher = createBalancedVoucher(db, {
        company_id: original.company_id,
        voucher_date: new Date().toISOString().slice(0, 10),
        voucher_type: "Journal",
        narration: `Reversal of ${original.voucher_number}${reason ? ` - ${reason}` : ""}`,
        source_module: "voucher_reversal",
        source_id: original.id,
        lines: lines.map((line) => ({
          account_id: line.account_id,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          narration: `Reverse ${original.voucher_number}`,
          linked_party_type: line.linked_party_type,
          linked_party_id: line.linked_party_id
        }))
      });

      db.prepare("UPDATE vouchers SET status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.id);
      if (original.source_module === "billing") db.prepare("UPDATE invoices SET posting_status = 'Reversed', invoice_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
      if (original.source_module === "procurement") db.prepare("UPDATE procurements SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
      if (original.source_module === "payment") db.prepare("UPDATE payments SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
      if (original.source_module === "supplier_payment") db.prepare("UPDATE supplier_payments SET posting_status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
      if (original.source_module === "expense") db.prepare("UPDATE expense_entries SET posting_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);

      if (original.source_module === "billing") {
        db.prepare(`
          UPDATE receivables
          SET balance_outstanding = 0, status = 'Reversed', allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE billing_id = ?
        `).run(original.source_id);
        db.prepare(`
          UPDATE payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE billing_id = ?
        `).run(original.source_id);
      }
      if (original.source_module === "payment") {
        const affected = db.prepare("SELECT DISTINCT billing_id FROM payment_allocations WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0").all(original.source_id);
        db.prepare(`
          UPDATE payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE payment_id = ?
        `).run(original.source_id);
        affected.forEach((row) => refreshReceivable(db, row.billing_id));
      }
      if (original.source_module === "supplier_payment") {
        db.prepare(`
          UPDATE supplier_payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE supplier_payment_id = ?
        `).run(original.source_id);
      }
      if (original.source_module === "procurement") {
        db.prepare(`
          UPDATE supplier_payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE procurement_id = ?
        `).run(original.source_id);
      }

      const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
      const cashRows = db.prepare(`SELECT * FROM cash_bank_ledger WHERE voucher_id = ?${cashBankActiveWhere} ORDER BY id`).all(original.id);
      cashRows.forEach((row) => {
        updateCashBankLedger(db, {
          company_id: row.company_id,
          bank_account_id: row.bank_account_id,
          transaction_date: reversalVoucher.voucher_date,
          transaction_type: "Voucher Reversal",
          source_module: "voucher_reversal",
          source_id: original.id,
          voucher_id: reversalVoucher.id,
          debit: Number(row.credit || 0),
          credit: Number(row.debit || 0),
          payment_mode: row.payment_mode,
          utr_number: `REV-${row.utr_number || original.voucher_number}`,
          remarks: `Reverse ${original.voucher_number}`
        });
      });

      auditLog(db, {
        company_id: original.company_id,
        action: "voucher reversal",
        table_name: "vouchers",
        record_id: original.id,
        old_value: JSON.stringify({ voucher_number: original.voucher_number, status: original.status }),
        new_value: JSON.stringify({ reversal_voucher_id: reversalVoucher.id, reason })
      });
      auditVoucherDependencySync(db, reversalVoucher, ["general_ledger_reversal", "trial_balance", "subledger_reversal", "cash_bank_reversal", "reports_resync"]);
      return reversalVoucher;
    });

    return reversal();
  }

  function postSalesVoucher(db, billingId) {
    try {
      const invoice = db.prepare("SELECT i.*, so.department_id FROM invoices i JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ?").get(billingId);
      if (!invoice) throw new Error("Invoice not found");
      if (invoice.posting_status === "Posted") throw new Error("Invoice is already posted");
      if (!invoice.order_id) throw new Error("Cannot post invoice without order");
      if (!invoice.department_id) throw new Error("Cannot post invoice without department");
      const companyId = invoice.company_id;
      const lines = db.prepare("SELECT * FROM invoice_items WHERE billing_id = ? AND is_deleted = 0").all(billingId);
      const taxable = lines.length ? lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0) : Number(invoice.billing_value || 0);
      const outputGst = lines.length ? lines.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) : Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100;
      const gross = taxable + outputGst;
      assertPositive(gross, "Invoice amount");
      const voucher = createBalancedVoucher(db, {
        company_id: companyId,
        voucher_date: invoice.invoice_date,
        voucher_type: invoice.invoice_type === "Credit Note" ? "Credit Note" : "Sales",
        narration: `Sales invoice ${invoice.invoice_number}`,
        source_module: "billing",
        source_id: invoice.id,
        lines: [
          { account_id: accountId(db, companyId, "Trade Receivables"), debit: gross, credit: 0, linked_party_type: "department", linked_party_id: invoice.department_id },
          { account_id: accountId(db, companyId, "Sales"), debit: 0, credit: taxable },
          { account_id: accountId(db, companyId, "Output GST"), debit: 0, credit: outputGst }
        ]
      });
      upsertReceivable(db, invoice, gross);
      markPosted(db, "invoices", invoice.id, voucher.id, invoice.invoice_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "receivables", "output_gst", "sales_register", "profitability"]);
      return voucher;
    } catch (error) {
      markPostingError(db, "invoices", billingId, error);
      throw error;
    }
  }

  function postPurchaseVoucher(db, procurementId) {
    try {
      const procurement = db.prepare("SELECT * FROM procurements WHERE id = ?").get(procurementId);
      if (!procurement) throw new Error("Procurement not found");
      if (procurement.posting_status === "Posted") throw new Error("Procurement is already posted");
      const companyId = procurement.company_id;
      const lines = db.prepare("SELECT * FROM procurement_items WHERE procurement_id = ? AND is_deleted = 0").all(procurementId);
      const taxable = lines.length ? lines.reduce((sum, row) => sum + Number(row.taxable_value || 0), 0) : Number(procurement.purchase_value || 0);
      const inputGst = lines.length ? lines.reduce((sum, row) => sum + Number(row.gst_amount || 0), 0) : Number(procurement.purchase_gst || 0);
      const gross = taxable + inputGst;
      assertPositive(gross, "Purchase amount");
      const voucher = createBalancedVoucher(db, {
        company_id: companyId,
        voucher_date: procurement.purchase_date,
        voucher_type: "Purchase",
        narration: `Purchase invoice ${procurement.purchase_invoice_number}`,
        source_module: "procurement",
        source_id: procurement.id,
        lines: [
          { account_id: accountId(db, companyId, "Purchase"), debit: taxable, credit: 0 },
          { account_id: accountId(db, companyId, "Input GST"), debit: inputGst, credit: 0 },
          { account_id: accountId(db, companyId, "Trade Payables"), debit: 0, credit: gross, linked_party_type: "supplier", linked_party_id: procurement.supplier_id }
        ]
      });
      markPosted(db, "procurements", procurement.id, voucher.id, procurement.purchase_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "payables", "input_gst", "purchase_register", "profitability"]);
      return voucher;
    } catch (error) {
      markPostingError(db, "procurements", procurementId, error);
      throw error;
    }
  }

  function postReceiptVoucher(db, paymentId, billingId, deductions = {}) {
    try {
      const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
      const invoice = db.prepare("SELECT i.*, so.department_id FROM invoices i JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ?").get(billingId);
      if (!payment || !invoice) throw new Error("Payment or invoice not found");
      if (payment.posting_status === "Posted") throw new Error("Payment is already posted");
      const amount = Number(payment.payment_amount || 0);
      const tds = Number(deductions.tds_deducted || 0);
      const gstTds = Number(deductions.gst_tds_deducted || 0);
      const other = Number(deductions.other_deductions || 0);
      assertPositive(amount + tds + gstTds + other, "Receipt allocation");
      const voucher = createBalancedVoucher(db, {
        company_id: payment.company_id,
        voucher_date: payment.payment_date,
        voucher_type: "Receipt",
        narration: `Receipt ${payment.utr_number || payment.id}`,
        source_module: "payment",
        source_id: payment.id,
        lines: [
          { account_id: accountId(db, payment.company_id, payment.payment_mode === "Cash" ? "Cash" : "Bank"), debit: amount, credit: 0 },
          { account_id: accountId(db, payment.company_id, "TDS Receivable"), debit: tds, credit: 0 },
          { account_id: accountId(db, payment.company_id, "GST TDS Receivable"), debit: gstTds, credit: 0 },
          { account_id: accountId(db, payment.company_id, "Trade Receivables"), debit: 0, credit: amount + tds + gstTds + other, linked_party_type: "department", linked_party_id: invoice.department_id }
        ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
      });
      db.prepare(`
        INSERT INTO payment_allocations (company_id, payment_id, billing_id, order_id, allocated_amount, tds_deducted, gst_tds_deducted, other_deductions, remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(payment.company_id, payment.id, invoice.id, invoice.order_id, amount, tds, gstTds, other, "Auto allocation");
      refreshReceivable(db, invoice.id);
      updateCashBankLedger(db, { company_id: payment.company_id, bank_account_id: payment.bank_id, transaction_date: payment.payment_date, transaction_type: "Receipt", source_module: "payment", source_id: payment.id, voucher_id: voucher.id, debit: amount, payment_mode: payment.payment_mode, utr_number: payment.utr_number, remarks: payment.remarks });
      markPosted(db, "payments", payment.id, voucher.id, payment.payment_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "cash_bank", "receivables", "outstanding", "ageing", "cash_flow"]);
      return voucher;
    } catch (error) {
      markPostingError(db, "payments", paymentId, error);
      throw error;
    }
  }

  function postSupplierPaymentVoucher(db, supplierPaymentId) {
    const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(supplierPaymentId);
    if (!payment) throw new Error("Supplier payment not found");
    const amount = Number(payment.amount_paid || 0);
    assertPositive(amount, "Supplier payment");
    const voucher = createBalancedVoucher(db, {
      company_id: payment.company_id,
      voucher_date: payment.payment_date,
      voucher_type: "Payment",
      narration: `Supplier payment ${payment.utr_number || payment.id}`,
      source_module: "supplier_payment",
      source_id: payment.id,
      lines: [
        { account_id: accountId(db, payment.company_id, "Trade Payables"), debit: amount, credit: 0, linked_party_type: "supplier", linked_party_id: payment.supplier_id },
        { account_id: accountId(db, payment.company_id, payment.payment_mode === "Cash" ? "Cash" : "Bank"), debit: 0, credit: amount }
      ]
    });
    updateCashBankLedger(db, { company_id: payment.company_id, bank_account_id: payment.bank_account_id, transaction_date: payment.payment_date, transaction_type: "Supplier Payment", source_module: "supplier_payment", source_id: payment.id, voucher_id: voucher.id, credit: amount, payment_mode: payment.payment_mode, utr_number: payment.utr_number, remarks: payment.remarks });
    db.prepare("UPDATE supplier_payments SET posting_status = 'Posted', voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id, payment.id);
    auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "cash_bank", "payables", "outstanding", "ageing", "cash_flow"]);
    return voucher;
  }

  function createReceiptAllocation(db, payload) {
    const payment = getRecord(db, "payments", payload.payment_id);
    const invoice = getRecord(db, "invoices", payload.billing_id);
    if (!payment || !invoice) throw new Error("Receipt and invoice are required");
    if (Number(payment.order_id) !== Number(invoice.order_id) && !payload.allow_excess) throw new Error("Receipt and invoice must belong to the same order unless marked excess");
    const allocated = Number(payload.allocated_amount || 0);
    const tds = Number(payload.tds_deducted || 0);
    const gstTds = Number(payload.gst_tds_deducted || 0);
    const other = Number(payload.other_deductions || 0);
    assertPositive(allocated + tds + gstTds + other, "Allocation");
    const available = receiptUnallocatedAmount(db, payment.id);
    if (allocated > available && !payload.allow_excess) throw new Error("Allocation cannot exceed available receipt amount");
    const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ?").get(invoice.id);
    const outstanding = Number(receivable?.balance_outstanding ?? (Number(invoice.billing_value || 0) + Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100));
    if (allocated + tds + gstTds + other > outstanding && !payload.allow_excess) throw new Error("Allocation cannot exceed invoice outstanding");
    const status = payload.allow_excess ? "Excess" : available === allocated ? "Fully Allocated" : "Partially Allocated";
    const result = db.prepare(`
      INSERT INTO payment_allocations (company_id, payment_id, billing_id, order_id, allocated_amount, tds_deducted, gst_tds_deducted, other_deductions, remarks, allocation_status, allow_excess, reallocated_from_id, change_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payment.company_id, payment.id, invoice.id, invoice.order_id, allocated, tds, gstTds, other, payload.remarks || "", status, payload.allow_excess ? 1 : 0, payload.reallocated_from_id || null, payload.change_reason || payload.reason || null);
    refreshReceivable(db, invoice.id);
    allocationAudit(db, payment.company_id, "receipt", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
    return db.prepare("SELECT * FROM payment_allocations WHERE id = ?").get(result.lastInsertRowid);
  }

  function unallocateReceiptAllocation(db, allocationId, reason = "") {
    if (!reason) throw new Error("Reason is required for unallocation");
    const row = db.prepare("SELECT * FROM payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
    if (!row) throw new Error("Allocation not found");
    db.prepare("UPDATE payment_allocations SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reallocated', change_reason = ? WHERE id = ?").run(reason, allocationId);
    refreshReceivable(db, row.billing_id);
    allocationAudit(db, row.company_id, "receipt", allocationId, "unallocate", row, null, reason);
    return true;
  }

  function reallocateReceiptAllocation(db, allocationId, payload) {
    const old = db.prepare("SELECT * FROM payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
    if (!old) throw new Error("Allocation not found");
    if (!payload.reason) throw new Error("Reason is required for reallocation");
    return db.transaction(() => {
      unallocateReceiptAllocation(db, allocationId, payload.reason);
      return createReceiptAllocation(db, { ...payload, payment_id: old.payment_id, reallocated_from_id: allocationId });
    })();
  }

  function createSupplierPaymentAllocation(db, payload) {
    const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(payload.supplier_payment_id);
    const procurement = getRecord(db, "procurements", payload.procurement_id);
    if (!payment || !procurement) throw new Error("Supplier payment and purchase bill are required");
    if (Number(payment.supplier_id) !== Number(procurement.supplier_id) && !payload.allow_excess) throw new Error("Supplier payment and purchase bill must belong to the same supplier unless marked advance/excess");
    const amount = Number(payload.allocated_amount || 0);
    assertPositive(amount, "Supplier allocation");
    const available = supplierPaymentUnallocatedAmount(db, payment.id);
    if (amount > available && !payload.allow_excess) throw new Error("Allocation cannot exceed available supplier payment amount");
    const outstanding = purchaseOutstandingAmount(db, procurement.id);
    if (amount > outstanding && !payload.allow_excess) throw new Error("Allocation cannot exceed purchase bill outstanding");
    const status = payload.allow_excess ? "Excess" : amount === available ? "Fully Allocated" : "Partially Allocated";
    const result = db.prepare(`
      INSERT INTO supplier_payment_allocations (company_id, supplier_payment_id, procurement_id, allocated_amount, remarks, allocation_status, allow_excess, reallocated_from_id, change_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payment.company_id, payment.id, procurement.id, amount, payload.remarks || "", status, payload.allow_excess ? 1 : 0, payload.reallocated_from_id || null, payload.change_reason || payload.reason || null);
    allocationAudit(db, payment.company_id, "supplier_payment", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
    return db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ?").get(result.lastInsertRowid);
  }

  function unallocateSupplierPaymentAllocation(db, allocationId, reason = "") {
    if (!reason) throw new Error("Reason is required for supplier unallocation");
    const row = db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
    if (!row) throw new Error("Supplier allocation not found");
    db.prepare("UPDATE supplier_payment_allocations SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reallocated', change_reason = ? WHERE id = ?").run(reason, allocationId);
    allocationAudit(db, row.company_id, "supplier_payment", allocationId, "unallocate", row, null, reason);
    return true;
  }

  function reallocateSupplierPaymentAllocation(db, allocationId, payload) {
    const old = db.prepare("SELECT * FROM supplier_payment_allocations WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(allocationId);
    if (!old) throw new Error("Supplier allocation not found");
    if (!payload.reason) throw new Error("Reason is required for supplier reallocation");
    return db.transaction(() => {
      unallocateSupplierPaymentAllocation(db, allocationId, payload.reason);
      return createSupplierPaymentAllocation(db, { ...payload, supplier_payment_id: old.supplier_payment_id, reallocated_from_id: allocationId });
    })();
  }

  function createAdvanceReceipt(db, payload) {
    const payment = getRecord(db, "payments", payload.payment_id);
    if (!payment) throw new Error("Payment receipt is required");
    const amount = Number(payload.advance_received || receiptUnallocatedAmount(db, payment.id));
    assertPositive(amount, "Advance receipt");
    const result = db.prepare(`
      INSERT INTO advance_receipts (company_id, department_id, payment_id, order_id, advance_received, balance_advance, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(payment.company_id, payload.department_id, payment.id, payload.order_id || payment.order_id || null, amount, amount, payload.remarks || "");
    allocationAudit(db, payment.company_id, "advance_receipt", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
    return db.prepare("SELECT * FROM advance_receipts WHERE id = ?").get(result.lastInsertRowid);
  }

  function createSupplierAdvance(db, payload) {
    const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ?").get(payload.supplier_payment_id);
    if (!payment) throw new Error("Supplier payment is required");
    const amount = Number(payload.advance_paid || supplierPaymentUnallocatedAmount(db, payment.id));
    assertPositive(amount, "Supplier advance");
    const result = db.prepare(`
      INSERT INTO supplier_advances (company_id, supplier_id, supplier_payment_id, advance_paid, balance_advance, remarks)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(payment.company_id, payment.supplier_id, payment.id, amount, amount, payload.remarks || "");
    allocationAudit(db, payment.company_id, "supplier_advance", result.lastInsertRowid, "create", null, payload, payload.remarks || "");
    return db.prepare("SELECT * FROM supplier_advances WHERE id = ?").get(result.lastInsertRowid);
  }

  function adjustAdvanceReceipt(db, payload) {
    const advance = db.prepare("SELECT * FROM advance_receipts WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.advance_id);
    if (!advance) throw new Error("Advance receipt is required");
    const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.billing_id);
    if (!invoice) throw new Error("Open invoice is required");
    const receivable = db.prepare("SELECT * FROM receivables WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0").get(invoice.id);
    if (!receivable) throw new Error("Receivable is not available for this invoice");
    const amount = Number(payload.adjusted_amount || 0);
    assertPositive(amount, "Adjustment amount");
    if (amount > Number(advance.balance_advance || 0)) throw new Error("Adjustment exceeds available advance");
    const outstanding = receivableOutstandingBeforeAdjustment(db, invoice.id);
    if (amount > outstanding) throw new Error("Adjustment exceeds invoice outstanding");
    const result = db.prepare(`
      INSERT INTO advance_adjustments (company_id, adjustment_type, advance_id, billing_id, order_id, adjusted_amount, reason, created_by)
      VALUES (?, 'receipt', ?, ?, ?, ?, ?, ?)
    `).run(advance.company_id, advance.id, invoice.id, invoice.order_id, amount, payload.reason || "Advance adjustment", payload.created_by || null);
    const balance = Number(advance.balance_advance || 0) - amount;
    db.prepare(`
      UPDATE advance_receipts SET advance_adjusted = advance_adjusted + ?, balance_advance = ?,
        status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(amount, balance, balance <= 0 ? "Closed" : "Open", advance.id);
    refreshReceivable(db, invoice.id);
    allocationAudit(db, advance.company_id, "advance_adjustment", result.lastInsertRowid, "adjust", null, payload, payload.reason || "Advance adjustment", payload.created_by || null);
    return db.prepare("SELECT * FROM advance_adjustments WHERE id = ?").get(result.lastInsertRowid);
  }

  function adjustSupplierAdvance(db, payload) {
    const advance = db.prepare("SELECT * FROM supplier_advances WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.advance_id);
    if (!advance) throw new Error("Supplier advance is required");
    const procurement = db.prepare("SELECT * FROM procurements WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(payload.procurement_id);
    if (!procurement) throw new Error("Purchase bill is required");
    const amount = Number(payload.adjusted_amount || 0);
    assertPositive(amount, "Adjustment amount");
    if (amount > Number(advance.balance_advance || 0)) throw new Error("Adjustment exceeds available supplier advance");
    const outstanding = purchaseOutstandingAmount(db, procurement.id);
    if (amount > outstanding) throw new Error("Adjustment exceeds purchase bill outstanding");
    const result = db.prepare(`
      INSERT INTO advance_adjustments (company_id, adjustment_type, advance_id, procurement_id, order_id, adjusted_amount, reason, created_by)
      VALUES (?, 'supplier', ?, ?, ?, ?, ?, ?)
    `).run(advance.company_id, advance.id, procurement.id, procurement.order_id, amount, payload.reason || "Supplier advance adjustment", payload.created_by || null);
    const balance = Number(advance.balance_advance || 0) - amount;
    db.prepare(`
      UPDATE supplier_advances SET advance_adjusted = advance_adjusted + ?, balance_advance = ?,
        status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(amount, balance, balance <= 0 ? "Closed" : "Open", advance.id);
    allocationAudit(db, advance.company_id, "supplier_advance_adjustment", result.lastInsertRowid, "adjust", null, payload, payload.reason || "Supplier advance adjustment", payload.created_by || null);
    return db.prepare("SELECT * FROM advance_adjustments WHERE id = ?").get(result.lastInsertRowid);
  }

  function reverseAdvanceAdjustment(db, adjustmentId, reason = "", userId = null) {
    if (!reason.trim()) throw new Error("Reversal reason is required");
    const adjustment = db.prepare("SELECT * FROM advance_adjustments WHERE id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").get(adjustmentId);
    if (!adjustment) throw new Error("Active advance adjustment is required");
    if (adjustment.adjustment_type === "receipt") {
      const advance = db.prepare("SELECT * FROM advance_receipts WHERE id = ?").get(adjustment.advance_id);
      db.prepare(`
        UPDATE advance_receipts SET advance_adjusted = MAX(0, advance_adjusted - ?), balance_advance = balance_advance + ?,
          status = 'Open', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(adjustment.adjusted_amount, adjustment.adjusted_amount, advance.id);
      refreshReceivable(db, adjustment.billing_id);
    } else {
      const advance = db.prepare("SELECT * FROM supplier_advances WHERE id = ?").get(adjustment.advance_id);
      db.prepare(`
        UPDATE supplier_advances SET advance_adjusted = MAX(0, advance_adjusted - ?), balance_advance = balance_advance + ?,
          status = 'Open', updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(adjustment.adjusted_amount, adjustment.adjusted_amount, advance.id);
    }
    db.prepare(`
      UPDATE advance_adjustments SET status = 'Reversed', is_deleted = 1, reversed_by = ?, reversed_at = CURRENT_TIMESTAMP,
        reversal_reason = ? WHERE id = ?
    `).run(userId, reason, adjustment.id);
    allocationAudit(db, adjustment.company_id, "advance_adjustment", adjustment.id, "reverse", adjustment, null, reason, userId);
    return { ...adjustment, status: "Reversed", reversal_reason: reason };
  }

  function saveCreditTerm(db, payload) {
    const companyId = Number(payload.company_id || 0);
    if (!companyId || !payload.party_type || !payload.party_id) throw new Error("Company, party type and party are required");
    const data = {
      company_id: companyId,
      party_type: payload.party_type,
      party_id: Number(payload.party_id),
      default_credit_days: Number(payload.default_credit_days || 30),
      grace_period: Number(payload.grace_period || 0),
      due_date_rule: payload.due_date_rule || "invoice_date",
      status: payload.status || "active"
    };
    const result = db.prepare(`
      INSERT INTO credit_terms (company_id, party_type, party_id, default_credit_days, grace_period, due_date_rule, status)
      VALUES (@company_id, @party_type, @party_id, @default_credit_days, @grace_period, @due_date_rule, @status)
      ON CONFLICT(company_id, party_type, party_id) DO UPDATE SET
        default_credit_days = excluded.default_credit_days,
        grace_period = excluded.grace_period,
        due_date_rule = excluded.due_date_rule,
        status = excluded.status,
        updated_at = CURRENT_TIMESTAMP
    `).run(data);
    allocationAudit(db, companyId, "credit_terms", result.lastInsertRowid || payload.party_id, "save", null, data, "Credit term change");
    auditLog(db, { company_id: companyId, action: "credit term save", table_name: "credit_terms", record_id: result.lastInsertRowid || payload.party_id, new_value: JSON.stringify(data) });
    return db.prepare("SELECT * FROM credit_terms WHERE company_id = ? AND party_type = ? AND party_id = ?").get(companyId, data.party_type, data.party_id);
  }

  function createPartyOpeningBalance(db, payload) {
    const companyId = Number(payload.company_id || 0);
    const amountDebit = Number(payload.opening_debit || 0);
    const amountCredit = Number(payload.opening_credit || 0);
    if (!companyId || !payload.party_type || !payload.party_id || !payload.financial_year_id || !payload.opening_date) throw new Error("Party, financial year and opening date are required");
    if ((amountDebit <= 0 && amountCredit <= 0) || (amountDebit > 0 && amountCredit > 0)) throw new Error("Enter either opening debit or opening credit");
    const partyAccount = partyControlAccount(db, companyId, payload.party_type);
    const suspense = accountId(db, companyId, "Opening Balance Suspense");
    const voucher = createBalancedVoucher(db, {
      company_id: companyId,
      voucher_date: payload.opening_date,
      voucher_type: "Journal",
      narration: payload.narration || `${payload.party_type} opening balance`,
      source_module: "opening_balance",
      source_id: null,
      lines: [
        { account_id: partyAccount, debit: amountDebit, credit: amountCredit, linked_party_type: payload.party_type, linked_party_id: payload.party_id },
        { account_id: suspense, debit: amountCredit, credit: amountDebit }
      ]
    });
    const result = db.prepare(`
      INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, payload.financial_year_id, payload.party_type, payload.party_id, partyAccount, amountDebit, amountCredit, voucher.id, payload.narration || "", payload.created_by || null);
    allocationAudit(db, companyId, "party_opening", result.lastInsertRowid, "create", null, payload, payload.narration || "");
    return db.prepare("SELECT * FROM opening_balances WHERE id = ?").get(result.lastInsertRowid);
  }

  function createFinancialYear(db, payload) {
    const companyId = Number(payload.company_id || 0);
    if (!companyId) throw new Error("Company is required");
    if (!payload.financial_year_name || !payload.start_date || !payload.end_date) throw new Error("Financial year name, start date and end date are required");
    const startMMDD = String(payload.start_date).slice(5);
    const endMMDD = String(payload.end_date).slice(5);
    if (startMMDD !== "04-01") throw new Error("Financial year must start on April 1");
    if (endMMDD !== "03-31") throw new Error("Financial year must end on March 31");
    const startYear = parseInt(String(payload.start_date).slice(0, 4), 10);
    const endYear = parseInt(String(payload.end_date).slice(0, 4), 10);
    if (endYear !== startYear + 1) throw new Error("Financial year must span exactly 12 months (April 1 to March 31)");
    const result = db.prepare(`
      INSERT INTO financial_years (company_id, financial_year_name, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(companyId, payload.financial_year_name, payload.start_date, payload.end_date, payload.status || "Open");
    auditLog(db, { company_id: companyId, action: "financial year create", table_name: "financial_years", record_id: result.lastInsertRowid, new_value: JSON.stringify(payload) });
    return db.prepare("SELECT * FROM financial_years WHERE id = ?").get(result.lastInsertRowid);
  }

  function updateFinancialYearStatus(db, id, status, userId = null) {
    const allowed = new Set(["Open", "Closed", "Locked"]);
    if (!allowed.has(status)) throw new Error("Invalid financial year status");
    const row = db.prepare("SELECT * FROM financial_years WHERE id = ?").get(id);
    if (!row) throw new Error("Financial year not found");
    const fields = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
    const params = [status];
    if (status === "Closed") {
      fields.push("closed_at = CURRENT_TIMESTAMP", "closed_by = ?");
      params.push(userId);
    }
    if (status === "Locked") {
      fields.push("locked_at = CURRENT_TIMESTAMP", "locked_by = ?");
      params.push(userId);
    }
    if (status === "Open") {
      fields.push("reopened_at = CURRENT_TIMESTAMP", "reopened_by = ?");
      params.push(userId);
    }
    params.push(id);
    db.prepare(`UPDATE financial_years SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    auditLog(db, { company_id: row.company_id, user_id: userId, action: `financial year ${status.toLowerCase()}`, table_name: "financial_years", record_id: id });
    return db.prepare("SELECT * FROM financial_years WHERE id = ?").get(id);
  }

  function createOpeningBalance(db, payload) {
    const companyId = Number(payload.company_id || 0);
    const financialYearId = Number(payload.financial_year_id || 0);
    const year = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(financialYearId, companyId);
    if (!year) throw new Error("Valid financial year is required");
    if (year.status !== "Open") throw new Error("Opening balances can be entered only in an open financial year");
    const debit = Number(payload.opening_debit || 0);
    const credit = Number(payload.opening_credit || 0);
    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) throw new Error("Enter either opening debit or opening credit");
    const capitalAccount = db.prepare("SELECT id, account_name FROM accounts WHERE company_id = ? AND account_name = 'Capital' AND is_deleted = 0").get(companyId);
    if (!capitalAccount) throw new Error("Opening balances require a 'Capital' account in the chart of accounts. Create a ledger account named 'Capital' under your company setup, then retry.");
    const suspense = capitalAccount.id;
    const account = payload.account_id ? Number(payload.account_id) : accountId(db, companyId, payload.balance_type === "Bank" ? "Bank" : payload.balance_type === "Cash" ? "Cash" : "Trade Receivables");
    const voucher = createBalancedVoucher(db, {
      company_id: companyId,
      voucher_date: year.start_date,
      voucher_type: "Journal",
      narration: `Opening balance - ${payload.balance_type || "Account"}`,
      source_module: "opening_balance",
      source_id: null,
      lines: [
        { account_id: account, debit, credit },
        { account_id: suspense, debit: credit, credit: debit }
      ]
    });
    const result = db.prepare(`
      INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by)
      VALUES (@company_id, @financial_year_id, @balance_type, @linked_id, @account_id, @opening_debit, @opening_credit, @voucher_id, @remarks, @created_by)
    `).run({
      company_id: companyId,
      financial_year_id: financialYearId,
      balance_type: payload.balance_type || "Account",
      linked_id: payload.linked_id || null,
      account_id: account,
      opening_debit: debit,
      opening_credit: credit,
      voucher_id: voucher.id,
      remarks: payload.remarks || "",
      created_by: payload.created_by || null
    });
    auditLog(db, { company_id: companyId, action: "opening balance create", table_name: "opening_balances", record_id: result.lastInsertRowid, new_value: JSON.stringify({ voucher_id: voucher.id }) });
    return db.prepare("SELECT * FROM opening_balances WHERE id = ?").get(result.lastInsertRowid);
  }

  function closeFinancialYear(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    const fromId = Number(payload.from_financial_year_id || 0);
    const toId = Number(payload.to_financial_year_id || 0);
    const approvedBy = payload.approved_by || null;
    const fromYear = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(fromId, companyId);
    const toYear = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(toId, companyId);
    if (!fromYear || !toYear) throw new Error("Valid source and target financial years are required");
    const duplicate = db.prepare("SELECT id FROM year_end_closings WHERE company_id = ? AND from_financial_year_id = ? AND to_financial_year_id = ?").get(companyId, fromId, toId);
    if (duplicate) throw new Error("Carry forward already exists for this company/year");
    const postingIssues = postingControlReport(db, companyId).filter((row) => !["Posted", "Reversed"].includes(row.posting_status));
    if (postingIssues.length) throw new Error("Cannot close year while Draft/Error transactions exist");

    const tb = trialBalance(db, companyId, fromYear.start_date, fromYear.end_date);
    const debit = tb.reduce((sum, row) => sum + Number(row.debit || 0), 0);
    const credit = tb.reduce((sum, row) => sum + Number(row.credit || 0), 0);
    const tbDifference = Math.round((debit - credit) * 100) / 100;
    if (Math.round(debit * 100) !== Math.round(credit * 100)) throw new Error("Trial balance must balance before year close");

    const pl = profitLossReport(db, companyId, fromYear.start_date, fromYear.end_date);
    const bs = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date);
    const bsDifference = Math.round((Number(bs.assets || 0) - Number(bs.liabilitiesAndEquity || 0)) * 100) / 100;
    if (Math.abs(bsDifference) > 1) throw new Error("Balance sheet must balance before year close");

    const transaction = db.transaction(() => {
      const closing = db.prepare(`
        INSERT INTO year_end_closings (company_id, from_financial_year_id, to_financial_year_id, closing_date, trial_balance_difference, balance_sheet_difference, net_profit, status, approved_by, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP)
      `).run(companyId, fromId, toId, fromYear.end_date, tbDifference, bsDifference, pl.netProfit, approvedBy);

      const balanceRows = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date).rows.filter((row) => Math.abs(Number(row.amount || 0)) > 0);
      balanceRows.forEach((row) => {
        db.prepare(`
          INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_balance_created, approved_by, status)
          VALUES (?, ?, ?, ?, ?, 0, ?, 'Approved')
        `).run(companyId, fromId, toId, row.id || accountId(db, companyId, row.account_name), row.amount, approvedBy);
      });

      if (Math.abs(pl.netProfit || 0) > 0) {
        const capitalAccount = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = 'Capital' AND is_deleted = 0").get(companyId);
        if (!capitalAccount) throw new Error("Year-end closing requires a 'Capital' account. Create a ledger account named 'Capital' under your company setup, then retry.");
        const retainedAccount = capitalAccount.id;
        db.prepare(`
          INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_balance_created, approved_by, status)
          VALUES (?, ?, ?, ?, ?, 0, ?, 'Approved')
        `).run(companyId, fromId, toId, retainedAccount, pl.netProfit, approvedBy);
      }

      updateFinancialYearStatus(fromId, "Locked", approvedBy);
      auditLog(db, { company_id: companyId, user_id: approvedBy, action: "year close and carry forward", table_name: "year_end_closings", record_id: closing.lastInsertRowid, new_value: JSON.stringify({ fromId, toId, netProfit: pl.netProfit }) });
      return db.prepare("SELECT * FROM year_end_closings WHERE id = ?").get(closing.lastInsertRowid);
    });
    return transaction();
  }

  function accountingData(db, filters = {}) {
    const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
    const dateFrom = filters.date_from || "1900-01-01";
    const dateTo = filters.date_to || "2999-12-31";
    const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
    const ledgerActiveWhere = activeRowClause(db, "ledger_entries", "le");
    return {
      references: referenceData(db, { company_id: companyId }),
      accounts: db.prepare("SELECT * FROM accounts WHERE company_id = ? AND is_deleted = 0 ORDER BY account_code").all(companyId),
      vouchers: db.prepare("SELECT * FROM vouchers WHERE company_id = ? AND is_deleted = 0 AND voucher_date BETWEEN ? AND ? ORDER BY voucher_date DESC, id DESC").all(companyId, dateFrom, dateTo),
      guidedVouchers: db.prepare("SELECT * FROM guided_vouchers WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY updated_at DESC, id DESC").all(companyId),
      voucherLines: db.prepare(`
        SELECT vl.*, a.account_name, a.account_code, v.voucher_number, v.voucher_date, v.voucher_type
        FROM voucher_lines vl
        JOIN vouchers v ON v.id = vl.voucher_id
        JOIN accounts a ON a.id = vl.account_id
        WHERE v.company_id = ? AND v.is_deleted = 0 AND v.voucher_date BETWEEN ? AND ?
        ORDER BY v.voucher_date DESC, vl.id
      `).all(companyId, dateFrom, dateTo),
      ledger: db.prepare(`
        SELECT le.*, a.account_name, a.account_code, v.voucher_number, v.voucher_type
        FROM ledger_entries le
        JOIN accounts a ON a.id = le.account_id
        JOIN vouchers v ON v.id = le.voucher_id
        WHERE le.company_id = ? AND le.entry_date BETWEEN ? AND ?${ledgerActiveWhere}
        ORDER BY le.entry_date, le.id
      `).all(companyId, dateFrom, dateTo),
      cashBank: db.prepare(`SELECT * FROM cash_bank_ledger WHERE company_id = ? AND transaction_date BETWEEN ? AND ?${cashBankActiveWhere} ORDER BY transaction_date, id`).all(companyId, dateFrom, dateTo),
      receivables: db.prepare("SELECT * FROM receivables WHERE company_id = ? AND is_deleted = 0 ORDER BY invoice_date DESC").all(companyId),
      payables: supplierPayableReport(db, companyId),
      auditLog: db.prepare("SELECT * FROM audit_log WHERE COALESCE(company_id, ?) = ? ORDER BY id DESC LIMIT 300").all(companyId, companyId),
      dayBook: dayBook(db, companyId, dateFrom, dateTo),
      trialBalance: trialBalance(db, companyId, dateFrom, dateTo),
      profitLoss: profitLossReport(db, companyId, dateFrom, dateTo),
      balanceSheet: balanceSheetReport(db, companyId, dateFrom, dateTo),
      statementSummary: financialStatementSummary(db, companyId, dateFrom, dateTo),
      gstSummary: gstSummary(db, companyId, dateFrom, dateTo),
      postingControl: postingControlReport(db, companyId),
      partyLedger: partyLedgerReport(db, companyId, dateFrom, dateTo),
      departmentLedger: departmentLedgerReport(db, companyId, dateFrom, dateTo),
      supplierLedger: supplierLedgerReport(db, companyId, dateFrom, dateTo),
      billWiseReceivables: billWiseReceivableReport(db, companyId),
      billWisePayables: billWisePayableReport(db, companyId),
      paymentAllocations: paymentAllocationReport(db, companyId),
      supplierPaymentAllocations: supplierPaymentAllocationReport(db, companyId),
      receivableAgeing: receivableAgeingReport(db, companyId),
      payableAgeing: payableAgeingReport(db, companyId),
      tdsReconciliation: tdsReconciliationReport(db, companyId),
      gstTdsReconciliation: gstTdsReconciliationReport(db, companyId),
      partyLedgerSummary: partyLedgerSummaryReport(db, companyId),
      partyReconciliation: partyReconciliationReport(db, companyId, dateFrom, dateTo),
      allocationReconciliation: allocationReconciliationReport(db, companyId),
      unallocatedReceipts: unallocatedReceiptsReport(db, companyId),
      unallocatedSupplierPayments: unallocatedSupplierPaymentsReport(db, companyId),
      advanceReceipts: advanceReceiptReport(db, companyId),
      supplierAdvances: supplierAdvanceReport(db, companyId),
      advanceAdjustments: advanceAdjustmentReport(db, companyId, dateFrom, dateTo),
      allocationAudit: allocationAuditReport(db, companyId, dateFrom, dateTo),
      creditTerms: creditTermsReport(db, companyId),
      payments: db.prepare("SELECT * FROM payments WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC").all(companyId),
      supplierPayments: db.prepare("SELECT sp.*, s.supplier_name FROM supplier_payments sp LEFT JOIN suppliers s ON s.id = sp.supplier_id WHERE sp.company_id = ? AND COALESCE(sp.is_deleted, 0) = 0 ORDER BY sp.payment_date DESC").all(companyId),
      invoices: db.prepare("SELECT i.*, so.order_number, gd.department_name FROM invoices i LEFT JOIN supply_orders so ON so.id = i.order_id LEFT JOIN government_departments gd ON gd.id = so.department_id WHERE i.company_id = ? AND COALESCE(i.is_deleted, 0) = 0 ORDER BY i.invoice_date DESC").all(companyId),
      procurements: db.prepare("SELECT p.*, s.supplier_name, so.order_number FROM procurements p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN supply_orders so ON so.id = p.order_id WHERE p.company_id = ? AND COALESCE(p.is_deleted, 0) = 0 ORDER BY p.purchase_date DESC").all(companyId),
      financialControl: financialControlReport(db, companyId, dateFrom, dateTo),
      financialYears: db.prepare("SELECT * FROM financial_years WHERE company_id = ? ORDER BY start_date DESC").all(companyId),
      openingBalances: openingBalanceReport(db, companyId),
      approvalQueue: approvalQueueReport(db, companyId),
      gstRegisters: gstRegisters(db, companyId, dateFrom, dateTo),
      tdsRegisters: tdsRegisters(db, companyId, dateFrom, dateTo),
      accountingRegisters: accountingRegisters(db, companyId, dateFrom, dateTo),
      billOutstanding: billOutstandingReport(db, companyId),
      yearEndClosings: yearEndClosingReport(db, companyId),
      carryForwardEntries: carryForwardReport(db, companyId),
      companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active'").all(),
      departments: db.prepare("SELECT id, department_name FROM government_departments WHERE status = 'active'").all(),
      suppliers: db.prepare("SELECT id, supplier_name FROM suppliers WHERE status = 'active'").all(),
      employees: db.prepare("SELECT id, employee_name FROM employees WHERE status = 'active'").all(),
      banks: db.prepare("SELECT id, bank_account_name, bank_name FROM banks WHERE company_id = ? AND status = 'active'").all(companyId)
    };
  }

  return {
    createLedgerAccount, createBalancedVoucher, createManualVoucher,
    createBusinessVoucher, updateGuidedVoucherStatus, postGuidedVoucher,
    reverseVoucher, postSalesVoucher, postPurchaseVoucher, postReceiptVoucher,
    postSupplierPaymentVoucher, createReceiptAllocation, unallocateReceiptAllocation,
    reallocateReceiptAllocation, createSupplierPaymentAllocation,
    unallocateSupplierPaymentAllocation, reallocateSupplierPaymentAllocation,
    createAdvanceReceipt, createSupplierAdvance, adjustAdvanceReceipt,
    adjustSupplierAdvance, reverseAdvanceAdjustment, saveCreditTerm,
    createPartyOpeningBalance, createFinancialYear, updateFinancialYearStatus,
    createOpeningBalance, closeFinancialYear, accountingData
  };
}
