import { ROUNDING_ADJUSTMENT_SOURCE, VOUCHER_REVERSAL_SOURCE } from "../database/ledgerGuards.js";
import { parseMoneyToMinor, roundMoney, rupees, sumRupees, subtractRupees } from "../domain/money.js";
import { localBusinessDate } from "../domain/businessDate.js";

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
    createAutomaticGrnFromPurchaseVoucher, createAutomaticStockIssueFromSalesVoucher,
    mirrorStockForSource
  } = deps;

  const SOURCE_DOCUMENTS = {
    billing: { table: "invoices", label: "invoice" },
    procurement: { table: "procurements", label: "purchase bill" },
    payment: { table: "payments", label: "receipt" },
    supplier_payment: { table: "supplier_payments", label: "supplier payment" },
    expense: { table: "expense_entries", label: "expense" },
    stock_inwards: { table: "stock_inwards", label: "stock inward" },
    stock_outwards: { table: "stock_outwards", label: "stock issue" },
    stock_adjustments: { table: "stock_adjustments", label: "stock adjustment" },
    stock_returns: { table: "stock_returns", label: "stock return" }
  };

  // Refuses a second posting of the same source document, before anything is written.
  function assertNotAlreadyPosted(db, sourceModule, sourceId, record, label) {
    if (["Posted", "Reversed"].includes(record?.posting_status)) {
      throw new Error(`This ${label} is already ${String(record.posting_status).toLowerCase()} and cannot be posted again. Open it from the register to view its voucher.`);
    }
    const existing = db.prepare("SELECT voucher_number FROM vouchers WHERE source_module = ? AND source_id = ? AND status IN ('Posted','Reversed') AND is_deleted = 0").get(sourceModule, sourceId);
    if (existing) throw new Error(`This ${label} is already posted as voucher ${existing.voucher_number} and cannot be posted again.`);
    if (["Pending Approval", "Rejected"].includes(record?.approval_status)) {
      throw new Error(`This ${label} is ${record.approval_status === "Rejected" ? "rejected" : "waiting for approval"}. Approve it in the Approval Queue before posting.`);
    }
  }

  // Runs a posting as one all-or-nothing transaction. If anything fails, nothing is
  // left behind and only the error is recorded on the source document.
  function atomicPosting(db, table, id, work) {
    try {
      return db.transaction(work)();
    } catch (error) {
      markPostingError(db, table, id, error);
      throw error;
    }
  }

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
      VALUES (@company_id, @account_code, @account_name, @account_type, @normal_balance, 0, 'active')
    `).run({
      company_id: companyId,
      account_code: accountCode,
      account_name: accountName,
      account_type: accountType,
      normal_balance: normalBalance
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

  // options.mirrorImbalanceMinor is for reverseVoucher only: a reversal that mirrors an
  // older, unbalanced voucher line for line carries the opposite of that voucher's paise
  // difference, so the pair nets to zero. The database guard checks the same.
  function createBalancedVoucher(db, payload, options = {}) {
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
    const debitMinors = lines.map(line => parseMoneyToMinor(line.debit));
    const creditMinors = lines.map(line => parseMoneyToMinor(line.credit));
    const totalDebitMinor = debitMinors.reduce((a, b) => a + b, 0);
    const totalCreditMinor = creditMinors.reduce((a, b) => a + b, 0);
    if (lines.some((line, idx) => debitMinors[idx] === 0 && creditMinors[idx] === 0)) {
      throw new Error("Voucher line amount is less than one paisa. Enter amounts to two decimal places.");
    }
    const mirroredDifference = Number.isSafeInteger(options.mirrorImbalanceMinor) && options.mirrorImbalanceMinor !== 0
      && totalDebitMinor - totalCreditMinor === options.mirrorImbalanceMinor;
    if (totalDebitMinor !== totalCreditMinor && !mirroredDifference) {
      throw new Error(`Unbalanced voucher: debit ${rupees(totalDebitMinor).toFixed(2)} and credit ${rupees(totalCreditMinor).toFixed(2)} differ by ${rupees(Math.abs(totalDebitMinor - totalCreditMinor)).toFixed(2)}. Correct the voucher lines so debit equals credit to the paisa.`);
    }

    const transaction = db.transaction(() => {
      const voucherNumber = payload.voucher_number || nextVoucherNumber(db, payload.company_id, payload.voucher_type.toUpperCase().replaceAll(" ", ""));
      const voucherResult = db.prepare(`
        INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
        VALUES (@company_id, @voucher_number, @voucher_date, @voucher_type, @narration, @source_module, @source_id, 'Draft', @financial_year_id, 'Approved')
      `).run({ ...payload, voucher_number: voucherNumber, financial_year_id: financialYear.id });
      const voucherId = voucherResult.lastInsertRowid;
      lines.forEach((line, idx) => {
        const lineMinorDebit = debitMinors[idx];
        const lineMinorCredit = creditMinors[idx];
        const lineResult = db.prepare(`
          INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, linked_party_type, linked_party_id, debit_minor, credit_minor)
          VALUES (@voucher_id, @account_id, @debit, @credit, @narration, @linked_party_type, @linked_party_id, @debit_minor, @credit_minor)
        `).run({
          voucher_id: voucherId,
          account_id: line.account_id,
          debit: rupees(lineMinorDebit),
          credit: rupees(lineMinorCredit),
          narration: line.narration,
          linked_party_type: line.linked_party_type,
          linked_party_id: line.linked_party_id,
          debit_minor: lineMinorDebit,
          credit_minor: lineMinorCredit
        });
        postLedgerEntry(db, payload.company_id, voucherId, lineResult.lastInsertRowid, line.account_id, payload.voucher_date, rupees(lineMinorDebit), rupees(lineMinorCredit), payload.source_module, payload.source_id, lineMinorDebit, lineMinorCredit);
      });
      // The voucher becomes Posted only now, once its lines and ledger entries are in,
      // so the database's own guard can check that they balance.
      db.prepare("UPDATE vouchers SET status = 'Posted' WHERE id = ?").run(voucherId);
      auditLog(db, { company_id: payload.company_id, action: "voucher posting", table_name: "vouchers", record_id: voucherId, new_value: JSON.stringify({ voucherNumber, totalDebit: rupees(totalDebitMinor) }) });
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
    const voucherDate = String(payload.voucher_date || payload.receipt_date || payload.payment_date || payload.invoice_date || payload.purchase_date || localBusinessDate());
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

  function releaseReceiptAdvances(db, paymentId, reason) {
    const advances = db.prepare("SELECT * FROM advance_receipts WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0").all(paymentId);
    advances.forEach((advance) => {
      db.prepare("SELECT * FROM advance_adjustments WHERE adjustment_type = 'receipt' AND advance_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").all(advance.id)
        .forEach((adjustment) => reverseAdvanceAdjustment(db, adjustment.id, reason));
      db.prepare("UPDATE advance_receipts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, status = 'Reversed', balance_advance = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(advance.id);
    });
  }

  function releaseSupplierAdvances(db, supplierPaymentId, reason) {
    const advances = db.prepare("SELECT * FROM supplier_advances WHERE supplier_payment_id = ? AND COALESCE(is_deleted, 0) = 0").all(supplierPaymentId);
    advances.forEach((advance) => {
      db.prepare("SELECT * FROM advance_adjustments WHERE adjustment_type = 'supplier' AND advance_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").all(advance.id)
        .forEach((adjustment) => reverseAdvanceAdjustment(db, adjustment.id, reason));
      db.prepare("UPDATE supplier_advances SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, status = 'Reversed', balance_advance = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(advance.id);
    });
  }

  // Undoes the stock that a guided purchase or sales voucher moved automatically.
  function reverseGuidedVoucherStock(db, guidedVoucherId, guidedVoucher, reason) {
    const inwards = db.prepare(`
      SELECT si.* FROM goods_receipts grn
      JOIN goods_receipt_items gri ON gri.grn_id = grn.id
      JOIN stock_inwards si ON si.id = gri.stock_inward_id
      WHERE grn.guided_voucher_id = ? AND si.posting_status = 'Posted'
    `).all(guidedVoucherId);
    inwards.forEach((inward) => reverseSourceDocumentStock(db, "stock_inwards", inward, reason));
    db.prepare("UPDATE goods_receipts SET status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE guided_voucher_id = ?").run(guidedVoucherId);
    const issued = db.prepare(`
      SELECT record_id FROM audit_log
      WHERE action = 'automatic_sales_stock_issue' AND table_name = 'stock_outwards'
        AND json_extract(new_value, '$.voucher_number') = ?
        AND (company_id IS NULL OR company_id = ?)
    `).all(guidedVoucher.voucher_number, guidedVoucher.company_id);
    // Voucher numbers repeat across companies, so only this company's issues are reversed.
    issued.forEach(({ record_id: outwardId }) => {
      const outward = db.prepare("SELECT * FROM stock_outwards WHERE id = ? AND company_id = ? AND posting_status = 'Posted'").get(outwardId, guidedVoucher.company_id);
      if (outward) reverseSourceDocumentStock(db, "stock_outwards", outward, reason);
    });
  }

  // Reverses a stock document: its GL voucher (when it has one) and its stock movement.
  function reverseSourceDocumentStock(db, table, row, reason) {
    if (row.voucher_id) {
      const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(row.voucher_id);
      if (voucher?.status === "Posted") {
        reverseVoucher(db, row.voucher_id, reason);
        return;
      }
    }
    mirrorStockForSource(db, table, row.id, null, reason);
    db.prepare(`UPDATE ${table} SET posting_status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
  }

  function reverseVoucher(db, voucherId, reason = "", userId = null) {
    const original = db.prepare("SELECT * FROM vouchers WHERE id = ? AND is_deleted = 0").get(Number(voucherId || 0));
    if (!original) throw new Error("Voucher not found");
    if (original.status === "Reversed") throw new Error(`Voucher ${original.voucher_number} is already reversed`);
    if (original.status !== "Posted") {
      throw new Error(`Only posted vouchers can be reversed. ${original.voucher_number} is ${original.status || "not posted"}; edit or delete the draft instead.`);
    }
    if (original.source_module === ROUNDING_ADJUSTMENT_SOURCE) {
      throw new Error(`${original.voucher_number} is a rounding adjustment and cannot be reversed. It only corrects a paise difference in the older voucher it names.`);
    }
    if (original.source_module === VOUCHER_REVERSAL_SOURCE) {
      throw new Error(`${original.voucher_number} is itself a reversal and cannot be reversed. Post a fresh voucher for the correct entry instead.`);
    }
    const existingReversal = db.prepare("SELECT id FROM vouchers WHERE source_module = ? AND source_id = ? AND is_deleted = 0").get(VOUCHER_REVERSAL_SOURCE, original.id);
    if (existingReversal) throw new Error("Voucher reversal already exists");

    // Every line is reversed, as the ledger and the database guards count every line.
    const lines = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(original.id);
    if (!lines.length) throw new Error("Voucher has no lines to reverse");
    // A rounding adjustment that corrected this voucher is reversed with it, in the same
    // reversal voucher, so the pair still balances.
    const adjustment = db.prepare("SELECT * FROM vouchers WHERE source_module = ? AND source_id = ? AND status = 'Posted' AND is_deleted = 0").get(ROUNDING_ADJUSTMENT_SOURCE, original.id);
    const adjustmentLines = adjustment
      ? db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(adjustment.id)
      : [];
    // Lines worth less than a paisa on both sides hold nothing in the books and would make
    // an empty reversal line, so they are left out.
    const reversedLines = [...lines, ...adjustmentLines]
      .filter((line) => Number(line.debit_minor || 0) !== 0 || Number(line.credit_minor || 0) !== 0);
    if (!reversedLines.length) throw new Error(`${original.voucher_number} has no amounts to reverse`);
    // Amounts come from the paise columns, which are what the books hold.
    const imbalanceMinor = reversedLines.reduce((sum, line) => sum + Number(line.credit_minor || 0) - Number(line.debit_minor || 0), 0);
    const reasonText = String(reason || "").trim() || "Reversed by user";
    const today = localBusinessDate();
    const mirrorImbalanceMinor = adjustment ? 0 : imbalanceMinor;
    // The reversal is dated today (in the open year) unless the original is later
    // than today; the original stays in its own period, so closed years never change.
    // An older unbalanced voucher is mirrored on its own date instead, so the two cancel
    // inside one year and neither year's trial balance is left off by the difference.
    const reversalDate = mirrorImbalanceMinor !== 0
      ? original.voucher_date
      : (original.voucher_date > today ? original.voucher_date : today);
    if (mirrorImbalanceMinor !== 0) {
      try {
        assertOpenFinancialYear(db, original.company_id, reversalDate);
      } catch (error) {
        throw new Error(`${original.voucher_number} is out of balance by ${rupees(Math.abs(mirrorImbalanceMinor)).toFixed(2)} and must be reversed on its own date (${reversalDate}), but that year is not open: ${error.message}`);
      }
    }

    const reversal = db.transaction(() => {
      const reversalVoucher = createBalancedVoucher(db, {
        company_id: original.company_id,
        voucher_date: reversalDate,
        voucher_type: "Journal",
        narration: `Reversal of ${original.voucher_number} - ${reasonText}`,
        source_module: VOUCHER_REVERSAL_SOURCE,
        source_id: original.id,
        lines: reversedLines.map((line) => ({
          account_id: line.account_id,
          debit: rupees(line.credit_minor),
          credit: rupees(line.debit_minor),
          narration: `Reverse ${original.voucher_number}`,
          linked_party_type: line.linked_party_type,
          linked_party_id: line.linked_party_id
        }))
      }, { mirrorImbalanceMinor });
      if (adjustment) db.prepare("UPDATE vouchers SET status = 'Reversed', reversal_reason = ?, reversal_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(`Reversed with ${original.voucher_number}`, reversalDate, adjustment.id);

      db.prepare("UPDATE vouchers SET status = 'Reversed', reversal_reason = ?, reversal_date = ?, reversed_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(reasonText, reversalDate, userId && db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId) ? userId : null, original.id);
      const source = SOURCE_DOCUMENTS[original.source_module];
      if (original.source_module === "billing") db.prepare("UPDATE invoices SET posting_status = 'Reversed', invoice_status = 'Reversed', locked_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
      else if (source && !original.source_module.startsWith("stock_")) db.prepare(`UPDATE ${source.table} SET posting_status = 'Reversed' WHERE id = ?`).run(original.source_id);

      if (original.source_module === "billing") {
        // Release advances first: reverseAdvanceAdjustment refreshes the receivable, which must not reopen it.
        db.prepare("SELECT * FROM advance_adjustments WHERE adjustment_type = 'receipt' AND billing_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").all(original.source_id)
          .forEach((adjustment) => reverseAdvanceAdjustment(db, adjustment.id, `Invoice reversed: ${reasonText}`));
        db.prepare(`
          UPDATE receivables
          SET balance_outstanding = 0, status = 'Reversed', allocation_status = 'Reversed', updated_at = CURRENT_TIMESTAMP
          WHERE billing_id = ?
        `).run(original.source_id);
        db.prepare(`
          UPDATE payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', change_reason = ?
          WHERE billing_id = ? AND COALESCE(is_deleted, 0) = 0
        `).run(`Invoice reversed: ${reasonText}`, original.source_id);
      }
      if (original.source_module === "payment") {
        const affected = db.prepare("SELECT DISTINCT billing_id FROM payment_allocations WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0").all(original.source_id);
        db.prepare(`
          UPDATE payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', change_reason = ?
          WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0
        `).run(`Receipt reversed: ${reasonText}`, original.source_id);
        releaseReceiptAdvances(db, original.source_id, `Receipt reversed: ${reasonText}`);
        affected.forEach((row) => refreshReceivable(db, row.billing_id));
      }
      if (original.source_module === "supplier_payment") {
        db.prepare(`
          UPDATE supplier_payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', change_reason = ?
          WHERE supplier_payment_id = ? AND COALESCE(is_deleted, 0) = 0
        `).run(`Supplier payment reversed: ${reasonText}`, original.source_id);
        releaseSupplierAdvances(db, original.source_id, `Supplier payment reversed: ${reasonText}`);
      }
      if (original.source_module === "procurement") {
        db.prepare(`
          UPDATE supplier_payment_allocations
          SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, allocation_status = 'Reversed', change_reason = ?
          WHERE procurement_id = ? AND COALESCE(is_deleted, 0) = 0
        `).run(`Purchase reversed: ${reasonText}`, original.source_id);
        db.prepare("SELECT * FROM advance_adjustments WHERE adjustment_type = 'supplier' AND procurement_id = ? AND COALESCE(is_deleted, 0) = 0 AND status = 'Active'").all(original.source_id)
          .forEach((adjustment) => reverseAdvanceAdjustment(db, adjustment.id, `Purchase reversed: ${reasonText}`));
      }
      if (source && original.source_module.startsWith("stock_")) {
        mirrorStockForSource(db, source.table, original.source_id, reversalVoucher.id, reasonText);
        db.prepare(`UPDATE ${source.table} SET posting_status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(original.source_id);
      }
      if (original.source_module === "guided_vouchers") {
        db.prepare("UPDATE guided_vouchers SET status = 'Reversed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(original.source_id);
        reverseGuidedVoucherStock(db, original.source_id, original, `Guided voucher reversed: ${reasonText}`);
      }

      const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
      const cashRows = db.prepare(`SELECT * FROM cash_bank_ledger WHERE voucher_id = ?${cashBankActiveWhere} ORDER BY id`).all(original.id);
      cashRows.forEach((row) => {
        updateCashBankLedger(db, {
          company_id: row.company_id,
          bank_account_id: row.bank_account_id,
          transaction_date: reversalVoucher.voucher_date,
          transaction_type: "Voucher Reversal",
          source_module: VOUCHER_REVERSAL_SOURCE,
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
        user_id: userId,
        action: "voucher reversal",
        table_name: "vouchers",
        record_id: original.id,
        old_value: JSON.stringify({ voucher_number: original.voucher_number, status: original.status }),
        new_value: JSON.stringify({ reversal_voucher_id: reversalVoucher.id, reason: reasonText })
      });
      auditVoucherDependencySync(db, reversalVoucher, ["general_ledger_reversal", "trial_balance", "subledger_reversal", "cash_bank_reversal", "reports_resync"]);
      return reversalVoucher;
    });

    return reversal();
  }

  // Line values are rounded to paise one by one and then added, so the voucher
  // always balances exactly in paise.
  function documentTotals(lines, fallbackTaxable, fallbackTax) {
    if (lines.length) {
      const taxable = sumRupees(lines.map((row) => roundMoney(row.taxable_value)));
      const tax = sumRupees(lines.map((row) => roundMoney(row.gst_amount)));
      return { taxable, tax, gross: sumRupees([taxable, tax]) };
    }
    const taxable = roundMoney(fallbackTaxable);
    const tax = roundMoney(fallbackTax);
    return { taxable, tax, gross: roundMoney(taxable + tax) };
  }

  function postSalesVoucher(db, billingId) {
    const invoice = db.prepare("SELECT i.*, so.department_id FROM invoices i LEFT JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ? AND COALESCE(i.is_deleted, 0) = 0").get(billingId);
    if (!invoice) throw new Error("Invoice not found");
    assertNotAlreadyPosted(db, "billing", invoice.id, invoice, "invoice");
    return atomicPosting(db, "invoices", invoice.id, () => {
      if (!invoice.order_id) throw new Error("Cannot post invoice without order. Link the invoice to a supply order, then post.");
      if (!invoice.department_id) throw new Error("Cannot post invoice without department. Set the buyer department on the supply order, then post.");
      const companyId = invoice.company_id;
      const lines = db.prepare("SELECT * FROM invoice_items WHERE billing_id = ? AND is_deleted = 0").all(billingId);
      const totals = documentTotals(lines, invoice.billing_value, Number(invoice.billing_value || 0) * Number(invoice.gst_rate || 0) / 100);
      assertPositive(totals.gross, "Invoice amount");
      const isCreditNote = invoice.invoice_type === "Credit Note";
      const party = { linked_party_type: "department", linked_party_id: invoice.department_id };
      // A credit note is the mirror of a sale: it reduces sales, output GST and the buyer's balance.
      const voucherLines = isCreditNote ? [
        { account_id: accountId(db, companyId, "Sales"), debit: totals.taxable, credit: 0 },
        { account_id: accountId(db, companyId, "Output GST"), debit: totals.tax, credit: 0 },
        { account_id: accountId(db, companyId, "Trade Receivables"), debit: 0, credit: totals.gross, ...party }
      ] : [
        { account_id: accountId(db, companyId, "Trade Receivables"), debit: totals.gross, credit: 0, ...party },
        { account_id: accountId(db, companyId, "Sales"), debit: 0, credit: totals.taxable },
        { account_id: accountId(db, companyId, "Output GST"), debit: 0, credit: totals.tax }
      ];
      const voucher = createBalancedVoucher(db, {
        company_id: companyId,
        voucher_date: invoice.invoice_date,
        voucher_type: isCreditNote ? "Credit Note" : "Sales",
        narration: `${isCreditNote ? "Credit note" : "Sales invoice"} ${invoice.invoice_number}`,
        source_module: "billing",
        source_id: invoice.id,
        lines: voucherLines.filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
      });
      // A credit note stands in the buyer's bill-wise account as a credit line
      // (negative amount), so bill-wise receivables keep agreeing with the ledger.
      upsertReceivable(db, invoice, isCreditNote ? -totals.gross : totals.gross);
      markPosted(db, "invoices", invoice.id, voucher.id, invoice.invoice_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "receivables", "output_gst", "sales_register", "profitability"]);
      return voucher;
    });
  }

  function postPurchaseVoucher(db, procurementId) {
    const procurement = db.prepare("SELECT * FROM procurements WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(procurementId);
    if (!procurement) throw new Error("Procurement not found");
    assertNotAlreadyPosted(db, "procurement", procurement.id, procurement, "purchase bill");
    return atomicPosting(db, "procurements", procurement.id, () => {
      const companyId = procurement.company_id;
      const lines = db.prepare("SELECT * FROM procurement_items WHERE procurement_id = ? AND is_deleted = 0").all(procurementId);
      const totals = documentTotals(lines, procurement.purchase_value, procurement.purchase_gst);
      assertPositive(totals.gross, "Purchase amount");
      // Goods already received into stock through a GRN were debited to Inventory
      // against GRNI; the bill clears GRNI for that value instead of expensing the
      // goods a second time. Any remainder (services, goods not received) is a purchase.
      const receivedValue = roundMoney(Number(db.prepare(`
        SELECT COALESCE(SUM(sl.value_minor), 0) / 100.0 value FROM stock_inwards si
        JOIN stock_ledger sl ON sl.source_module = 'stock_inwards' AND sl.source_id = si.id AND COALESCE(sl.is_deleted, 0) = 0 AND sl.transaction_type = 'Inward'
        WHERE si.procurement_id = ? AND si.company_id = ? AND si.posting_status = 'Posted' AND COALESCE(si.is_deleted, 0) = 0
      `).get(procurement.id, companyId)?.value || 0));
      // GRNI is cleared in full; a bill price above or below the GRN value is a
      // purchase price difference booked to Purchase (debit or credit).
      const grniPortion = receivedValue;
      const purchasePortion = roundMoney(totals.taxable - grniPortion);
      const voucher = createBalancedVoucher(db, {
        company_id: companyId,
        voucher_date: procurement.purchase_date,
        voucher_type: "Purchase",
        narration: `Purchase invoice ${procurement.purchase_invoice_number}`,
        source_module: "procurement",
        source_id: procurement.id,
        lines: [
          { account_id: accountId(db, companyId, "Goods Received Not Invoiced"), debit: grniPortion, credit: 0 },
          { account_id: accountId(db, companyId, "Purchase"), debit: Math.max(purchasePortion, 0), credit: Math.max(-purchasePortion, 0) },
          { account_id: accountId(db, companyId, "Input GST"), debit: totals.tax, credit: 0 },
          { account_id: accountId(db, companyId, "Trade Payables"), debit: 0, credit: totals.gross, linked_party_type: "supplier", linked_party_id: procurement.supplier_id }
        ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
      });
      markPosted(db, "procurements", procurement.id, voucher.id, procurement.purchase_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "payables", "input_gst", "purchase_register", "profitability"]);
      return voucher;
    });
  }

  // Open posted invoices of an order, oldest first, for automatic receipt allocation.
  function openInvoicesForOrder(db, companyId, orderId) {
    return db.prepare(`
      SELECT i.id, r.balance_outstanding
      FROM invoices i
      JOIN receivables r ON r.billing_id = i.id AND COALESCE(r.is_deleted, 0) = 0
      WHERE i.company_id = ? AND i.order_id = ? AND COALESCE(i.is_deleted, 0) = 0
        AND i.posting_status = 'Posted' AND COALESCE(r.status, '') NOT IN ('Reversed', 'Closed')
        AND r.balance_outstanding > 0.004
      ORDER BY i.invoice_date, i.id
    `).all(companyId, orderId);
  }

  // Posts a receipt (Dr Bank + TDS/GST-TDS/other deductions, Cr Trade Receivables)
  // and allocates it: to the named invoice, else oldest-first across the order's
  // open invoices. Any amount left over stays on account as unallocated.
  function postReceiptVoucher(db, paymentId, billingId = null, deductions = null) {
    const payment = db.prepare("SELECT * FROM payments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(paymentId);
    if (!payment) throw new Error("Payment not found");
    assertNotAlreadyPosted(db, "payment", payment.id, payment, "receipt");
    return atomicPosting(db, "payments", payment.id, () => {
      const source = deductions || payment;
      const amount = roundMoney(payment.payment_amount);
      const tds = roundMoney(source.tds_deducted);
      const gstTds = roundMoney(source.gst_tds_deducted);
      const other = roundMoney(source.other_deductions);
      const settlement = roundMoney(amount + tds + gstTds + other);
      assertPositive(settlement, "Receipt amount");
      const targetId = Number(billingId || payment.billing_id || 0);
      const named = targetId ? db.prepare("SELECT i.*, so.department_id FROM invoices i LEFT JOIN supply_orders so ON so.id = i.order_id WHERE i.id = ?").get(targetId) : null;
      if (targetId && !named) throw new Error("The invoice selected on this receipt was not found. Pick the invoice again, then post.");
      if (named && Number(named.company_id) !== Number(payment.company_id)) throw new Error("Receipt refused: the selected invoice belongs to another company.");
      if (named && named.posting_status !== "Posted") throw new Error(`Receipt refused: invoice ${named.invoice_number} is ${named.posting_status || "Draft"}. Post the invoice first, then post this receipt so it settles that invoice.`);
      const order = db.prepare("SELECT department_id FROM supply_orders WHERE id = ?").get(named?.order_id || payment.order_id);
      const departmentId = named?.department_id || order?.department_id || null;
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
          { account_id: accountId(db, payment.company_id, "Other Deduction Ledger"), debit: other, credit: 0 },
          { account_id: accountId(db, payment.company_id, "Trade Receivables"), debit: 0, credit: settlement, linked_party_type: "department", linked_party_id: departmentId }
        ].filter((line) => Number(line.debit || 0) || Number(line.credit || 0))
      });
      const targets = named ? [{ id: named.id, balance_outstanding: receivableOutstandingBeforeAdjustment(db, named.id) }] : openInvoicesForOrder(db, payment.company_id, payment.order_id);
      let cashLeft = amount;
      let deductionLeft = { tds, gstTds, other };
      targets.forEach((target) => {
        let room = roundMoney(Number(target.balance_outstanding || 0));
        if (room <= 0) return;
        const take = (value) => { const used = roundMoney(Math.min(value, room)); room = roundMoney(room - used); return used; };
        const tdsUsed = take(deductionLeft.tds);
        const gstTdsUsed = take(deductionLeft.gstTds);
        const otherUsed = take(deductionLeft.other);
        const cashUsed = take(cashLeft);
        if (!(tdsUsed || gstTdsUsed || otherUsed || cashUsed)) return;
        deductionLeft = { tds: roundMoney(deductionLeft.tds - tdsUsed), gstTds: roundMoney(deductionLeft.gstTds - gstTdsUsed), other: roundMoney(deductionLeft.other - otherUsed) };
        cashLeft = roundMoney(cashLeft - cashUsed);
        const invoiceRow = db.prepare("SELECT order_id FROM invoices WHERE id = ?").get(target.id);
        db.prepare(`
          INSERT INTO payment_allocations (company_id, payment_id, billing_id, order_id, allocated_amount, tds_deducted, gst_tds_deducted, other_deductions, remarks, allocation_status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Auto allocation on posting', ?)
        `).run(payment.company_id, payment.id, target.id, invoiceRow?.order_id || payment.order_id, cashUsed, tdsUsed, gstTdsUsed, otherUsed, room <= 0 ? "Fully Allocated" : "Partially Allocated");
        refreshReceivable(db, target.id);
      });
      // Deductions (TDS, GST TDS, others) only make sense against an invoice; with no
      // open invoice to carry them they would be stranded, so the receipt is refused.
      const strandedDeductions = roundMoney(deductionLeft.tds + deductionLeft.gstTds + deductionLeft.other);
      if (strandedDeductions > 0.004) {
        throw new Error(`Receipt refused: deductions of ${strandedDeductions.toFixed(2)} (TDS / GST TDS / other) have no open posted invoice to settle. Post the invoice for this order first, or remove the deductions and record them when the invoice is posted.`);
      }
      db.prepare("UPDATE payments SET allocation_status = ? WHERE id = ?").run(cashLeft > 0.004 ? (cashLeft < amount ? "Partially Allocated" : "Unallocated") : "Fully Allocated", payment.id);
      updateCashBankLedger(db, { company_id: payment.company_id, bank_account_id: payment.bank_id, transaction_date: payment.payment_date, transaction_type: "Receipt", source_module: "payment", source_id: payment.id, voucher_id: voucher.id, debit: amount, payment_mode: payment.payment_mode, utr_number: payment.utr_number, remarks: payment.remarks });
      markPosted(db, "payments", payment.id, voucher.id, payment.payment_date);
      auditVoucherDependencySync(db, voucher, ["general_ledger", "trial_balance", "cash_bank", "receivables", "outstanding", "ageing", "cash_flow", "tds"]);
      return voucher;
    });
  }

  function postSupplierPaymentVoucher(db, supplierPaymentId) {
    const payment = db.prepare("SELECT * FROM supplier_payments WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(supplierPaymentId);
    if (!payment) throw new Error("Supplier payment not found");
    assertNotAlreadyPosted(db, "supplier_payment", payment.id, payment, "supplier payment");
    const amount = roundMoney(payment.amount_paid);
    assertPositive(amount, "Supplier payment");
    return atomicPosting(db, "supplier_payments", payment.id, () => {
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
    });
  }

  function createReceiptAllocation(db, payload) {
    const payment = getRecord(db, "payments", payload.payment_id);
    const invoice = getRecord(db, "invoices", payload.billing_id);
    if (!payment || !invoice) throw new Error("Receipt and invoice are required");
    if (Number(payment.company_id) !== Number(invoice.company_id)) throw new Error("Allocation refused: the receipt and the invoice belong to different companies.");
    if (Number(payment.order_id) !== Number(invoice.order_id) && !payload.allow_excess) throw new Error("Receipt and invoice must belong to the same order unless marked excess");
    const allocated = Number(payload.allocated_amount || 0);
    const tds = Number(payload.tds_deducted || 0);
    const gstTds = Number(payload.gst_tds_deducted || 0);
    const other = Number(payload.other_deductions || 0);
    assertPositive(allocated + tds + gstTds + other, "Allocation");
    // Only money and deductions already in the ledger can settle an invoice:
    // both documents must be posted, and deductions cannot exceed what the
    // receipt itself recorded (and posted to the TDS ledgers).
    if (payment.posting_status !== "Posted") throw new Error(`Allocation refused: receipt ${payment.utr_number || payment.id} is ${payment.posting_status || "Draft"}. Post the receipt first.`);
    if (invoice.posting_status !== "Posted") throw new Error(`Allocation refused: invoice ${invoice.invoice_number} is ${invoice.posting_status || "Draft"}. Post the invoice first.`);
    const usedDeductions = db.prepare("SELECT COALESCE(SUM(tds_deducted), 0) tds, COALESCE(SUM(gst_tds_deducted), 0) gst_tds, COALESCE(SUM(other_deductions), 0) other FROM payment_allocations WHERE payment_id = ? AND COALESCE(is_deleted, 0) = 0").get(payment.id);
    const room = {
      tds: roundMoney(Number(payment.tds_deducted || 0) - usedDeductions.tds),
      gstTds: roundMoney(Number(payment.gst_tds_deducted || 0) - usedDeductions.gst_tds),
      other: roundMoney(Number(payment.other_deductions || 0) - usedDeductions.other)
    };
    if (tds > room.tds + 0.004 || gstTds > room.gstTds + 0.004 || other > room.other + 0.004) {
      throw new Error(`Allocation refused: deductions exceed what the receipt recorded (TDS ${room.tds.toFixed(2)}, GST TDS ${room.gstTds.toFixed(2)}, other ${room.other.toFixed(2)} still available). Enter TDS on the receipt itself so it is posted to the TDS ledgers.`);
    }
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
    if (Number(payment.company_id) !== Number(procurement.company_id)) throw new Error("Allocation refused: the supplier payment and the purchase bill belong to different companies.");
    if (Number(payment.supplier_id) !== Number(procurement.supplier_id) && !payload.allow_excess) throw new Error("Supplier payment and purchase bill must belong to the same supplier unless marked advance/excess");
    const amount = Number(payload.allocated_amount || 0);
    assertPositive(amount, "Supplier allocation");
    if (payment.posting_status !== "Posted") throw new Error(`Allocation refused: supplier payment ${payment.utr_number || payment.id} is ${payment.posting_status || "Draft"}. Post the payment first.`);
    if (procurement.posting_status !== "Posted") throw new Error(`Allocation refused: purchase bill ${procurement.purchase_invoice_number || procurement.id} is ${procurement.posting_status || "Draft"}. Post the bill first.`);
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
    if (payment.posting_status !== "Posted") throw new Error("Advance refused: post the receipt first. Only a posted receipt can be held as an advance.");
    const available = roundMoney(receiptUnallocatedAmount(db, payment.id));
    const amount = Number(payload.advance_received || available);
    assertPositive(amount, "Advance receipt");
    if (amount > available + 0.004) throw new Error(`Advance refused: it cannot exceed the receipt's unallocated amount of ${available.toFixed(2)}. Reduce the advance or release an allocation first.`);
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
    const available = roundMoney(supplierPaymentUnallocatedAmount(db, payment.id));
    const amount = Number(payload.advance_paid || available);
    assertPositive(amount, "Supplier advance");
    if (amount > available + 0.004) throw new Error(`Supplier advance refused: it cannot exceed the payment's unallocated amount of ${available.toFixed(2)}.`);
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
    if (invoice.posting_status !== "Posted" || receivable.status === "Reversed") {
      throw new Error(`Adjustment refused: invoice ${invoice.invoice_number || invoice.id} is ${receivable.status === "Reversed" ? "reversed" : String(invoice.posting_status || "not posted").toLowerCase()}. Advances can be adjusted only against a posted invoice. Post the invoice first, or pick another one.`);
    }
    if (Number(invoice.company_id) !== Number(advance.company_id)) throw new Error("Adjustment refused: the advance and the invoice belong to different companies.");
    if (advance.department_id && receivable.department_id && Number(advance.department_id) !== Number(receivable.department_id)) {
      throw new Error("Adjustment refused: this advance was received from a different buyer department than the invoice. Pick an invoice of the same department.");
    }
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
    if (procurement.posting_status !== "Posted") {
      throw new Error(`Adjustment refused: purchase bill ${procurement.purchase_invoice_number || procurement.id} is ${String(procurement.posting_status || "not posted").toLowerCase()}. Supplier advances can be adjusted only against a posted bill. Post the bill first, or pick another one.`);
    }
    if (Number(procurement.company_id) !== Number(advance.company_id) || Number(procurement.supplier_id) !== Number(advance.supplier_id)) {
      throw new Error("Adjustment refused: this advance was paid to a different supplier (or company) than the purchase bill. Pick a bill of the same supplier.");
    }
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
    const year = db.prepare("SELECT * FROM financial_years WHERE id = ? AND company_id = ?").get(payload.financial_year_id, companyId);
    if (!year) throw new Error("Financial year does not belong to the selected company");
    if (year.status !== "Open") throw new Error("Party opening balance can be entered only in an open financial year");
    if (payload.opening_date < year.start_date || payload.opening_date > year.end_date) throw new Error("Opening date is outside the selected financial year");
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
    const openingDebitMinor = parseMoneyToMinor(amountDebit);
    const openingCreditMinor = parseMoneyToMinor(amountCredit);
    const result = db.prepare(`
      INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by, opening_debit_minor, opening_credit_minor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(companyId, payload.financial_year_id, payload.party_type, payload.party_id, partyAccount, amountDebit, amountCredit, voucher.id, payload.narration || "", payload.created_by || null, openingDebitMinor, openingCreditMinor);
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
    const openingDebitMinor = parseMoneyToMinor(debit);
    const openingCreditMinor = parseMoneyToMinor(credit);
    const result = db.prepare(`
      INSERT INTO opening_balances (company_id, financial_year_id, balance_type, linked_id, account_id, opening_debit, opening_credit, voucher_id, remarks, created_by, opening_debit_minor, opening_credit_minor)
      VALUES (@company_id, @financial_year_id, @balance_type, @linked_id, @account_id, @opening_debit, @opening_credit, @voucher_id, @remarks, @created_by, @opening_debit_minor, @opening_credit_minor)
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
      created_by: payload.created_by || null,
      opening_debit_minor: openingDebitMinor,
      opening_credit_minor: openingCreditMinor
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
    if (fromYear.status !== "Open") throw new Error(`Source financial year status is '${fromYear.status}', must be 'Open'`);
    if (toYear.status !== "Open") throw new Error(`Target financial year status is '${toYear.status}', must be 'Open'`);
    if (toYear.start_date <= fromYear.end_date) throw new Error("Target financial year must start after source year ends");
    const duplicate = db.prepare("SELECT id FROM year_end_closings WHERE company_id = ? AND from_financial_year_id = ? AND to_financial_year_id = ?").get(companyId, fromId, toId);
    if (duplicate) throw new Error("Carry forward already exists for this company/year");
    const postingIssues = postingControlReport(db, companyId).filter((row) => !["Posted", "Reversed"].includes(row.posting_status));
    if (postingIssues.length) throw new Error("Cannot close year while Draft/Error transactions exist");

    const tb = trialBalance(db, companyId, fromYear.start_date, fromYear.end_date);
    const debit = sumRupees(tb.map((row) => row.debit));
    const credit = sumRupees(tb.map((row) => row.credit));
    const tbDifference = subtractRupees(debit, credit);
    if (tbDifference !== 0) throw new Error(`Trial balance must balance before year close: debit ${debit.toFixed(2)}, credit ${credit.toFixed(2)}. Open the Trial Balance for this year and correct the difference first.`);

    const pl = profitLossReport(db, companyId, fromYear.start_date, fromYear.end_date);
    const bs = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date);
    const bsDifference = subtractRupees(bs.assets, bs.liabilitiesAndEquity);
    if (bsDifference !== 0) throw new Error(`Balance sheet must balance to the paisa before year close (difference ${bsDifference.toFixed(2)}). Open the Balance Sheet for this year and correct the difference first.`);

    const transaction = db.transaction(() => {
      const closing = db.prepare(`
        INSERT INTO year_end_closings (company_id, from_financial_year_id, to_financial_year_id, closing_date, trial_balance_difference, balance_sheet_difference, net_profit, status, approved_by, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved', ?, CURRENT_TIMESTAMP)
      `).run(companyId, fromId, toId, fromYear.end_date, tbDifference, bsDifference, pl.netProfit, approvedBy);

      const bsRows = balanceSheetReport(db, companyId, fromYear.start_date, fromYear.end_date).rows;
      const balanceRows = bsRows.filter((row) => Math.abs(Number(row.amount || 0)) > 0 && ["Asset", "Liability", "Equity"].includes(row.account_type));
      balanceRows.forEach((row) => {
        const amount = Number(row.amount || 0);
        let openingDebit = 0, openingCredit = 0;
        if (row.account_type === "Asset") {
          openingDebit = Math.max(amount, 0);
          openingCredit = Math.max(-amount, 0);
        } else {
          openingCredit = Math.max(amount, 0);
          openingDebit = Math.max(-amount, 0);
        }
        const closingBalanceMinor = parseMoneyToMinor(amount);
        const openingDebitMinor = parseMoneyToMinor(openingDebit);
        const openingCreditMinor = parseMoneyToMinor(openingCredit);
        db.prepare(`
          INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_debit, opening_credit, approved_by, status, closing_balance_minor, opening_debit_minor, opening_credit_minor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?, ?)
        `).run(companyId, fromId, toId, row.id, amount, openingDebit, openingCredit, approvedBy, closingBalanceMinor, openingDebitMinor, openingCreditMinor);
      });

      if (Math.abs(pl.netProfit || 0) > 0) {
        const capitalAccount = db.prepare("SELECT id FROM accounts WHERE company_id = ? AND account_name = 'Capital' AND is_deleted = 0").get(companyId);
        if (!capitalAccount) throw new Error("Year-end closing requires a 'Capital' account. Create a ledger account named 'Capital' under your company setup, then retry.");
        const retainedAccount = capitalAccount.id;
        const profitAmount = Number(pl.netProfit);
        let profitDebit = 0, profitCredit = 0;
        if (profitAmount >= 0) { profitCredit = profitAmount; }
        else { profitDebit = -profitAmount; }
        const closingBalanceMinor = parseMoneyToMinor(profitAmount);
        const profitDebitMinor = parseMoneyToMinor(profitDebit);
        const profitCreditMinor = parseMoneyToMinor(profitCredit);
        db.prepare(`
          INSERT INTO carry_forward_entries (company_id, from_financial_year_id, to_financial_year_id, account_id, closing_balance, opening_debit, opening_credit, approved_by, status, closing_balance_minor, opening_debit_minor, opening_credit_minor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?, ?)
        `).run(companyId, fromId, toId, retainedAccount, profitAmount, profitDebit, profitCredit, approvedBy, closingBalanceMinor, profitDebitMinor, profitCreditMinor);
      }

      updateFinancialYearStatus(db, fromId, "Locked", approvedBy);
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
      banks: db.prepare("SELECT id, bank_account_name, bank_name, account_number, ifsc FROM banks WHERE company_id = ? AND status = 'active'").all(companyId)
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
