import crypto from "node:crypto";

export function createBankReconciliationService(deps) {
  const {
    auditLog, activeRowClause, postLedgerEntry, updateCashBankLedger,
    assertOpenFinancialYear, accountId, nextVoucherNumber
  } = deps;

  function accountById(db, companyId, id) {
    return db.prepare("SELECT * FROM accounts WHERE company_id = ? AND id = ? AND is_deleted = 0").get(companyId, id);
  }

  function normalizeBankRows(db, payload) {
    const sourceRows = Array.isArray(payload.rows) ? payload.rows : [];
    const mapping = payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectBankStatementColumns(sourceRows);
    const companyId = Number(payload.company_id || 0);
    if (!companyId) throw new Error("Company context is required before importing a bank statement.");
    const bankId = payload.bank_id ? Number(payload.bank_id) : null;
    return sourceRows.map((row, index) => {
      const mapped = mapBankRow(row, mapping);
      const debit = parseMoney(mapped.debit);
      const credit = parseMoney(mapped.credit);
      const amount = Math.max(debit, credit);
      const transactionDate = parseBankDate(mapped.transaction_date);
      const narration = String(mapped.narration || "").trim();
      const utr = String(mapped.utr || extractUtr(narration) || "").trim();
      const referenceNumber = String(mapped.reference_number || "").trim();
      const chequeNumber = String(mapped.cheque_number || "").trim();
      const errors = [];
      if (!transactionDate) errors.push("Transaction date missing or invalid");
      if (!amount || amount <= 0) errors.push("Debit or credit amount is required");
      if (!narration) errors.push("Narration is required");
      const entryType = credit > 0 && debit <= 0 ? "Receipt" : debit > 0 && credit <= 0 ? "Payment" : "Unknown";
      if (entryType === "Unknown") errors.push("Either debit or credit must be present");
      const duplicateKey = crypto.createHash("sha1").update([transactionDate, amount.toFixed(2), utr, narration.toLowerCase()].join("|")).digest("hex");
      const duplicate = db.prepare("SELECT id FROM bank_statement_entries WHERE company_id = ? AND duplicate_key = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, duplicateKey);
      const match = errors.length || duplicate ? null : suggestBankMatch(db, companyId, { entryType, amount, utr, narration, transactionDate });
      return {
        company_id: companyId,
        bank_id: bankId,
        raw_row_number: index + 1,
        transaction_date: transactionDate,
        narration,
        debit,
        credit,
        balance: parseMoney(mapped.balance),
        utr,
        reference_number: referenceNumber,
        cheque_number: chequeNumber,
        amount,
        entry_type: entryType,
        duplicate_key: duplicateKey,
        validation_status: errors.length ? "Invalid" : duplicate ? "Duplicate" : "Valid",
        validation_errors: errors.join("; "),
        review_status: "Draft",
        match_status: duplicate ? "Duplicate" : match ? "Suggested" : errors.length ? "Review Required" : "Unmatched",
        matched_module: match?.module || null,
        matched_record_id: match?.recordId || null,
        matched_reference: match?.reference || null,
        matched_score: match?.score || 0
      };
    });
  }

  function bankImportSummary(db, payload, rows) {
    return {
      bankName: payload.bank_name || payload.bank_format || "Generic Format",
      mapping: payload.mapping && Object.keys(payload.mapping).length ? payload.mapping : detectBankStatementColumns(payload.rows || []),
      totalRows: rows.length,
      validRows: rows.filter((row) => row.validation_status === "Valid").length,
      duplicateRows: rows.filter((row) => row.validation_status === "Duplicate" || row.match_status === "Duplicate").length,
      errorRows: rows.filter((row) => row.validation_status === "Invalid").length,
      rows
    };
  }

  function insertBankStatementEntry(db, importId, row) {
    db.prepare(`
      INSERT INTO bank_statement_entries (
        company_id, import_id, bank_id, transaction_date, narration, debit, credit, balance, utr, reference_number, cheque_number, amount,
        entry_type, duplicate_key, validation_status, validation_errors, review_status, match_status, matched_module, matched_record_id, matched_reference, matched_score
      )
      VALUES (
        @company_id, @import_id, @bank_id, @transaction_date, @narration, @debit, @credit, @balance, @utr, @reference_number, @cheque_number, @amount,
        @entry_type, @duplicate_key, @validation_status, @validation_errors, @review_status, @match_status, @matched_module, @matched_record_id, @matched_reference, @matched_score
      )
    `).run({ ...row, import_id: importId });
  }

  function detectBankStatementColumns(rows = []) {
    const headers = Object.keys(rows[0] || {});
    const pick = (...needles) => headers.find((header) => needles.some((needle) => header.toLowerCase().includes(needle)));
    return {
      transaction_date: pick("transaction_date", "date", "txn_date", "value_date"),
      narration: pick("narration", "description", "particular", "details", "remarks"),
      debit: pick("debit", "withdrawal", "dr_amount", "paid"),
      credit: pick("credit", "deposit", "cr_amount", "received"),
      balance: pick("balance", "closing"),
      utr: pick("utr", "rrn", "transaction_id", "txn_id"),
      reference_number: pick("reference", "ref_no", "chq_ref", "instrument"),
      cheque_number: pick("cheque", "chq")
    };
  }

  function mapBankRow(row, mapping) {
    return Object.fromEntries(Object.entries(mapping).map(([target, source]) => [target, source ? row[source] : ""]));
  }

  function parseMoney(value) {
    if (value === null || value === undefined || value === "") return 0;
    const cleaned = String(value).replace(/,/g, "").replace(/[^\d.-]/g, "");
    const number = Number(cleaned);
    return Number.isFinite(number) ? Math.abs(number) : 0;
  }

  function parseBankDate(value) {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
  }

  function extractUtr(narration = "") {
    return narration.match(/\b(?:UTR|NEFT|IMPS|RTGS|UPI)[-/:\s]*([A-Z0-9]{6,})\b/i)?.[1] || narration.match(/\b[A-Z0-9]{12,22}\b/i)?.[0] || "";
  }

  function suggestBankMatch(db, companyId, entry) {
    const amount = Number(entry.amount || 0);
    if (entry.entryType === "Receipt") {
      if (entry.utr) {
        const payment = db.prepare("SELECT id, utr_number, order_id, payment_amount FROM payments WHERE COALESCE(company_id, ?) = ? AND utr_number = ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, companyId, entry.utr);
        if (payment) return { module: "payments", recordId: payment.id, reference: payment.utr_number, score: 98 };
      }
      const invoice = db.prepare("SELECT id, invoice_number, billing_value, gst_rate FROM invoices WHERE company_id = ? AND ABS((billing_value * (1 + COALESCE(gst_rate, 0) / 100.0)) - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, amount);
      if (invoice) return { module: "invoices", recordId: invoice.id, reference: invoice.invoice_number, score: 72 };
    }
    if (entry.entryType === "Payment") {
      const supplierPayment = db.prepare("SELECT id, utr_number, amount_paid FROM supplier_payments WHERE company_id = ? AND ABS(amount_paid - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, amount);
      if (supplierPayment) return { module: "supplier_payments", recordId: supplierPayment.id, reference: supplierPayment.utr_number || `Supplier Payment #${supplierPayment.id}`, score: 82 };
      const procurement = db.prepare("SELECT id, purchase_invoice_number, purchase_value FROM procurements WHERE COALESCE(company_id, ?) = ? AND ABS((purchase_value + COALESCE(purchase_gst, 0) + COALESCE(freight, 0) + COALESCE(loading_charges, 0)) - ?) <= 1 AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(companyId, companyId, amount);
      if (procurement) return { module: "procurements", recordId: procurement.id, reference: procurement.purchase_invoice_number, score: 72 };
    }
    const orderNumber = entry.narration.match(/[A-Z]{1,5}[-/]?\d{3,}/i)?.[0];
    if (orderNumber) {
      const order = db.prepare("SELECT id, order_number FROM supply_orders WHERE order_number LIKE ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(`%${orderNumber}%`);
      if (order) return { module: "supply_orders", recordId: order.id, reference: order.order_number, score: 60 };
    }
    return null;
  }

  function bankMatchLinks(db, companyId) {
    return {
      vouchers: db.prepare("SELECT v.id, v.voucher_number reference, v.voucher_type type, COALESCE((SELECT SUM(vl.debit) FROM voucher_lines vl WHERE vl.voucher_id = v.id), 0) amount FROM vouchers v WHERE v.company_id = ? AND v.is_deleted = 0 ORDER BY v.voucher_date DESC LIMIT 300").all(companyId),
      invoices: db.prepare("SELECT id, invoice_number reference, 'Invoice' type, billing_value * (1 + COALESCE(gst_rate, 0) / 100.0) amount FROM invoices WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY invoice_date DESC LIMIT 300").all(companyId),
      payments: db.prepare("SELECT id, utr_number reference, 'Receipt' type, payment_amount amount FROM payments WHERE COALESCE(company_id, ?) = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC LIMIT 300").all(companyId, companyId),
      supplier_payments: db.prepare("SELECT id, COALESCE(utr_number, 'Supplier Payment ' || id) reference, 'Supplier Payment' type, amount_paid amount FROM supplier_payments WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY payment_date DESC LIMIT 300").all(companyId),
      procurements: db.prepare("SELECT id, purchase_invoice_number reference, 'Purchase Bill' type, purchase_value amount FROM procurements WHERE COALESCE(company_id, ?) = ? AND COALESCE(is_deleted, 0) = 0 ORDER BY purchase_date DESC LIMIT 300").all(companyId, companyId),
      orders: db.prepare("SELECT id, order_number reference, 'Order' type, 0 amount FROM supply_orders WHERE COALESCE(is_deleted, 0) = 0 ORDER BY order_date DESC LIMIT 300").all()
    };
  }

  function referenceModule(db, moduleName, recordId) {
    const map = {
      vouchers: ["vouchers", "voucher_number"],
      invoices: ["invoices", "invoice_number"],
      payments: ["payments", "utr_number"],
      supplier_payments: ["supplier_payments", "utr_number"],
      procurements: ["procurements", "purchase_invoice_number"],
      supply_orders: ["supply_orders", "order_number"]
    };
    const target = map[moduleName];
    if (!target) return null;
    const row = db.prepare(`SELECT id, ${target[1]} reference FROM ${target[0]} WHERE id = ?`).get(recordId);
    return row || null;
  }

  // A bank line that matches a receipt, supplier payment or voucher already posted
  // in the books is reconciliation evidence, not a new transaction.
  function alreadyBookedMatch(db, entry) {
    const recordId = Number(entry.matched_record_id || 0);
    if (!recordId) return null;
    if (entry.matched_module === "payments" || entry.matched_module === "supplier_payments") {
      const row = db.prepare(`SELECT id, posting_status FROM ${entry.matched_module} WHERE id = ?`).get(recordId);
      if (["Posted", "Reversed"].includes(row?.posting_status)) {
        const voucher = db.prepare("SELECT id, voucher_number FROM vouchers WHERE source_module = ? AND source_id = ? AND is_deleted = 0 ORDER BY id LIMIT 1").get(entry.matched_module === "payments" ? "payment" : "supplier_payment", recordId);
        return { voucher_id: voucher?.id || null, reference: voucher?.voucher_number || `${entry.matched_module} #${recordId}` };
      }
    }
    if (entry.matched_module === "vouchers") {
      const voucher = db.prepare("SELECT id, voucher_number, status FROM vouchers WHERE id = ? AND is_deleted = 0").get(recordId);
      if (["Posted", "Reversed"].includes(voucher?.status)) return { voucher_id: voucher.id, reference: voucher.voucher_number };
    }
    return null;
  }

  function buildVoucherProposal(db, companyId, entry) {
    const amount = Number(entry.amount || Math.max(Number(entry.debit || 0), Number(entry.credit || 0)));
    const isReceipt = entry.entry_type === "Receipt" || Number(entry.credit || 0) > 0;
    const suggestedVoucherType = isReceipt ? "Receipt" : inferPaymentVoucherType(entry.narration);
    const linked = linkedPartyForBankEntry(db, companyId, entry, isReceipt);
    const ledgerName = isReceipt ? "Trade Receivables" : suggestedVoucherType === "Bank Charges" ? "Bank Charges" : "Trade Payables";
    const ledger = db.prepare("SELECT id, account_name FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, ledgerName)
      || db.prepare("SELECT id, account_name FROM accounts WHERE company_id = ? AND account_name = ? AND is_deleted = 0").get(companyId, isReceipt ? "Sales" : "Expense Payable");
    const score = proposalConfidence(entry, linked, suggestedVoucherType);
    const booked = alreadyBookedMatch(db, entry);
    return {
      company_id: companyId,
      bank_entry_id: entry.id,
      import_id: entry.import_id,
      bank_id: entry.bank_id || entry.import_bank_id || null,
      bank_name: entry.bank_name || "Generic Format",
      transaction_date: entry.transaction_date,
      narration: entry.narration,
      debit: Number(entry.debit || 0),
      credit: Number(entry.credit || 0),
      utr: entry.utr || null,
      reference_number: entry.reference_number || null,
      suggested_voucher_type: suggestedVoucherType,
      suggested_party_type: linked.party_type || null,
      suggested_party_id: linked.party_id || null,
      suggested_party_name: linked.party_name || null,
      suggested_ledger_id: ledger?.id || null,
      suggested_ledger_name: ledger?.account_name || ledgerName,
      linked_invoice_id: linked.invoice_id || null,
      linked_procurement_id: linked.procurement_id || null,
      linked_order_id: linked.order_id || null,
      linked_voucher_id: booked?.voucher_id || (entry.matched_module === "vouchers" ? entry.matched_record_id : null),
      confidence_score: score,
      status: booked ? "Already Booked" : score >= 70 ? "Suggested" : "Needs Review",
      remarks: booked ? `Already booked as ${booked.reference}; reconciled, no new voucher needed` : linked.reference || entry.matched_reference || null
    };
  }

  function inferPaymentVoucherType(narration = "") {
    return /charge|charges|fee|fees|sms|neft chg|rtgs chg|commission/i.test(narration) ? "Bank Charges" : "Payment";
  }

  function linkedPartyForBankEntry(db, companyId, entry, isReceipt) {
    const moduleName = entry.matched_module;
    const recordId = Number(entry.matched_record_id || 0);
    if (moduleName === "invoices" && recordId) {
      const row = db.prepare(`
        SELECT i.id invoice_id, i.order_id, i.invoice_number reference, so.department_id party_id, gd.department_name party_name
        FROM invoices i
        LEFT JOIN supply_orders so ON so.id = i.order_id
        LEFT JOIN government_departments gd ON gd.id = so.department_id
        WHERE i.id = ? AND i.company_id = ?
      `).get(recordId, companyId);
      if (row) return { party_type: "Department", ...row };
    }
    if (moduleName === "payments" && recordId) {
      const row = db.prepare(`
        SELECT p.id payment_id, p.order_id, p.utr_number reference, so.department_id party_id, gd.department_name party_name,
          (SELECT id FROM invoices WHERE order_id = p.order_id AND COALESCE(is_deleted, 0) = 0 ORDER BY invoice_date DESC LIMIT 1) invoice_id
        FROM payments p
        LEFT JOIN supply_orders so ON so.id = p.order_id
        LEFT JOIN government_departments gd ON gd.id = so.department_id
        WHERE p.id = ? AND COALESCE(p.company_id, ?) = ?
      `).get(recordId, companyId, companyId);
      if (row) return { party_type: "Department", ...row };
    }
    if (moduleName === "procurements" && recordId) {
      const row = db.prepare(`
        SELECT p.id procurement_id, p.order_id, p.purchase_invoice_number reference, p.supplier_id party_id, s.supplier_name party_name
        FROM procurements p
        LEFT JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.id = ? AND COALESCE(p.company_id, ?) = ?
      `).get(recordId, companyId, companyId);
      if (row) return { party_type: "Supplier", ...row };
    }
    if (moduleName === "supplier_payments" && recordId) {
      const row = db.prepare(`
        SELECT sp.id supplier_payment_id, sp.order_id, sp.utr_number reference, sp.supplier_id party_id, s.supplier_name party_name,
          (SELECT id FROM procurements WHERE order_id = sp.order_id AND supplier_id = sp.supplier_id AND COALESCE(is_deleted, 0) = 0 ORDER BY purchase_date DESC LIMIT 1) procurement_id
        FROM supplier_payments sp
        LEFT JOIN suppliers s ON s.id = sp.supplier_id
        WHERE sp.id = ? AND sp.company_id = ?
      `).get(recordId, companyId);
      if (row) return { party_type: "Supplier", ...row };
    }
    const narration = String(entry.narration || "").toLowerCase();
    if (isReceipt) {
      const department = db.prepare("SELECT id party_id, department_name party_name FROM government_departments WHERE status = 'active' AND instr(?, lower(department_name)) > 0 ORDER BY length(department_name) DESC LIMIT 1").get(narration);
      if (department) return { party_type: "Department", ...department };
    } else {
      const supplier = db.prepare("SELECT id party_id, supplier_name party_name FROM suppliers WHERE status = 'active' AND instr(?, lower(supplier_name)) > 0 ORDER BY length(supplier_name) DESC LIMIT 1").get(narration);
      if (supplier) return { party_type: "Supplier", ...supplier };
    }
    const orderNumber = String(entry.narration || "").match(/[A-Z]{1,5}[-/]?\d{3,}/i)?.[0];
    if (orderNumber) {
      const order = db.prepare("SELECT id order_id, order_number reference FROM supply_orders WHERE order_number LIKE ? AND COALESCE(is_deleted, 0) = 0 LIMIT 1").get(`%${orderNumber}%`);
      if (order) return order;
    }
    return {};
  }

  function proposalConfidence(entry, linked, voucherType) {
    let score = 20;
    if (entry.utr) score += 20;
    if (entry.matched_reference) score += 20;
    if (entry.matched_score) score += Math.min(25, Number(entry.matched_score || 0) / 4);
    if (linked.party_id) score += 15;
    if (linked.invoice_id || linked.procurement_id) score += 15;
    if (linked.order_id) score += 10;
    if (voucherType === "Bank Charges") score = Math.max(score, 62);
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function voucherProposalControlMeta(row) {
    const status = row.status || "Suggested";
    if (status === "Posted") {
      return {
        status_reason: "Posted voucher is linked and has ledger impact",
        blocking_reason: "Posted proposals cannot be edited directly",
        recommended_action: "Review posted voucher, ledger and audit trail"
      };
    }
    if (status === "Draft Voucher Created") {
      return {
        status_reason: "Draft voucher exists but is not posted",
        blocking_reason: row.draft_voucher_status === "Posted" ? "Draft voucher is already posted" : "Posting is pending final review",
        recommended_action: "Review draft voucher and post only if it is safe"
      };
    }
    if (status === "Approved") {
      return {
        status_reason: "Proposal approved by checker",
        blocking_reason: row.draft_voucher_id ? "Draft voucher already exists" : "Draft voucher creation is pending",
        recommended_action: "Create draft voucher, then review before posting"
      };
    }
    if (status === "Rejected") {
      return {
        status_reason: "Proposal rejected and stopped",
        blocking_reason: row.rejection_reason || row.remarks || "Rejection reason not recorded",
        recommended_action: "Review rejection reason and source bank entry"
      };
    }
    if (status === "Needs Review") {
      return {
        status_reason: "Maker review changed or confirmed proposal mapping",
        blocking_reason: "Checker approval is pending",
        recommended_action: "Approve, reject or correct the proposal mapping"
      };
    }
    return {
      status_reason: "Auto-suggested from approved bank statement",
      blocking_reason: row.confidence_score < 70 ? "Low confidence score requires manual review" : "Manual review is pending",
      recommended_action: "Review party, ledger, source links and narration"
    };
  }

  function getVoucherProposal(db, proposalId) {
    const proposal = db.prepare("SELECT * FROM voucher_proposals WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(Number(proposalId || 0));
    if (!proposal) throw new Error("Voucher proposal not found");
    return proposal;
  }

  function proposalAudit(db, payload) {
    db.prepare(`
      INSERT INTO voucher_proposal_audit (company_id, proposal_id, bank_entry_id, action, old_value, new_value, remarks, created_by)
      VALUES (@company_id, @proposal_id, @bank_entry_id, @action, @old_value, @new_value, @remarks, @created_by)
    `).run({
      company_id: payload.company_id,
      proposal_id: payload.proposal_id,
      bank_entry_id: payload.bank_entry_id || null,
      action: payload.action,
      old_value: payload.old_value || null,
      new_value: payload.new_value || null,
      remarks: payload.remarks || null,
      created_by: payload.created_by || null
    });
  }

  function voucherLinesFromProposal(db, proposal) {
    const amount = Number(proposal.credit || proposal.debit || 0);
    if (amount <= 0) throw new Error("Proposal amount is required");
    const bankAccount = accountId(db, proposal.company_id, "Bank");
    const ledgerAccount = Number(proposal.suggested_ledger_id || 0) || accountId(db, proposal.company_id, proposal.suggested_voucher_type === "Bank Charges" ? "Bank Charges" : proposal.credit > 0 ? "Trade Receivables" : "Trade Payables");
    const partyType = proposal.suggested_party_type || null;
    const partyId = proposal.suggested_party_id || null;
    if (Number(proposal.credit || 0) > 0) {
      return [
        { account_id: bankAccount, debit: amount, credit: 0, narration: proposal.narration, linked_party_type: null, linked_party_id: null },
        { account_id: ledgerAccount, debit: 0, credit: amount, narration: proposal.narration, linked_party_type: partyType, linked_party_id: partyId }
      ];
    }
    return [
      { account_id: ledgerAccount, debit: amount, credit: 0, narration: proposal.narration, linked_party_type: partyType, linked_party_id: partyId },
      { account_id: bankAccount, debit: 0, credit: amount, narration: proposal.narration, linked_party_type: null, linked_party_id: null }
    ];
  }

  function normalizeVoucherType(type = "") {
    if (String(type).includes("Receipt")) return "Receipt";
    if (String(type).includes("Contra")) return "Contra";
    if (String(type).includes("Charges")) return "Payment";
    return ["Sales", "Purchase", "Receipt", "Payment", "Journal", "Credit Note", "Debit Note", "Contra"].includes(type) ? type : "Payment";
  }

  function previewBankStatementImport(db, payload = {}) {
    const rows = normalizeBankRows(db, payload);
    return bankImportSummary(db, payload, rows);
  }

  function createBankStatementImport(db, payload = {}) {
    const companyId = Number(payload.company_id || 0);
    if (!companyId) throw new Error("Company is required for bank statement import");
    const bankId = payload.bank_id ? Number(payload.bank_id) : null;
    const bankName = payload.bank_name || payload.bank_format || "Generic Format";
    const rows = normalizeBankRows(db, { ...payload, company_id: companyId, bank_id: bankId });
    const summary = bankImportSummary(db, { ...payload, company_id: companyId, bank_id: bankId }, rows);
    const hash = crypto.createHash("sha256").update(JSON.stringify({ bankId, bankName, rows: rows.map((row) => row.duplicate_key) })).digest("hex");
    const existing = db.prepare("SELECT id FROM bank_statement_imports WHERE file_hash = ? AND COALESCE(is_deleted, 0) = 0").get(hash);
    if (existing) throw new Error(`Duplicate bank statement import blocked. Existing import #${existing.id}`);

    const tx = db.transaction(() => {
      const importInfo = db.prepare(`
        INSERT INTO bank_statement_imports (company_id, bank_id, bank_name, source_file_name, file_hash, total_rows, valid_rows, duplicate_rows, error_rows, status, column_mapping, imported_by, remarks)
        VALUES (@company_id, @bank_id, @bank_name, @source_file_name, @file_hash, @total_rows, @valid_rows, @duplicate_rows, @error_rows, 'Draft', @column_mapping, @imported_by, @remarks)
      `).run({
        company_id: companyId,
        bank_id: bankId,
        bank_name: bankName,
        source_file_name: payload.file_name || payload.source_file_name || "bank-statement",
        file_hash: hash,
        total_rows: summary.totalRows,
        valid_rows: summary.validRows,
        duplicate_rows: summary.duplicateRows,
        error_rows: summary.errorRows,
        column_mapping: JSON.stringify(summary.mapping || {}),
        imported_by: payload.imported_by || payload.user_id || null,
        remarks: payload.remarks || null
      });
      rows.forEach((row) => insertBankStatementEntry(db, importInfo.lastInsertRowid, row));
      auditLog(db, {
        company_id: companyId,
        user_id: payload.imported_by || payload.user_id || null,
        action: "bank_statement_import_created",
        table_name: "bank_statement_imports",
        record_id: importInfo.lastInsertRowid,
        new_value: JSON.stringify({ file: payload.file_name, totalRows: summary.totalRows, validRows: summary.validRows, duplicateRows: summary.duplicateRows, errorRows: summary.errorRows })
      });
      return importInfo.lastInsertRowid;
    });
    const id = tx();
    return bankStatementData(db, { company_id: companyId, import_id: id });
  }

  function updateBankImportStatus(db, importId, status, userId = null, remarks = "") {
    const row = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
    if (!row) throw new Error("Bank statement import not found");
    const next = String(status || "").trim();
    if (!["Ready for Review", "Approved", "Rejected"].includes(next)) throw new Error("Unsupported bank statement status");
    if (row.posting_status === "Posted") throw new Error("Posted bank statement import cannot be changed");
    if (next === "Approved" && (Number(row.error_rows || 0) > 0 || Number(row.duplicate_rows || 0) > 0)) {
      throw new Error("Resolve validation errors and duplicates before approval");
    }
    const fieldSql = next === "Approved"
      ? "status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks)"
      : next === "Rejected"
        ? "status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ?"
        : "status = 'Ready for Review', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks)";
    db.prepare(`UPDATE bank_statement_imports SET ${fieldSql} WHERE id = ?`).run(userId, remarks, importId);
    db.prepare("UPDATE bank_statement_entries SET review_status = ? WHERE import_id = ? AND COALESCE(is_deleted, 0) = 0").run(next, importId);
    auditLog(db, { company_id: row.company_id, user_id: userId, action: `bank_statement_${next.toLowerCase().replaceAll(" ", "_")}`, table_name: "bank_statement_imports", record_id: importId, new_value: remarks || next });
    if (next === "Approved") generateVoucherProposalsForImport(db, importId, userId);
    return bankStatementData(db, { company_id: row.company_id, import_id: importId });
  }

  function manualBankEntryMatch(db, entryId, payload = {}) {
    const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(entryId);
    if (!entry) throw new Error("Bank statement entry not found");
    const moduleName = payload.matched_module || payload.module;
    const recordId = Number(payload.matched_record_id || payload.record_id || 0);
    if (!moduleName || !recordId) throw new Error("Match module and record ID are required");
    const reference = payload.matched_reference || referenceModule(db, moduleName, recordId)?.reference || `${moduleName} #${recordId}`;
    const score = Math.min(100, Math.max(0, Number(payload.confidence_score || 100)));
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE bank_statement_entries
        SET match_status = 'Matched', matched_module = ?, matched_record_id = ?, matched_reference = ?, matched_score = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(moduleName, recordId, reference, score, entryId);
      db.prepare(`
        INSERT INTO bank_reconciliation_matches (company_id, bank_entry_id, matched_module, matched_record_id, matched_reference, confidence_score, match_method, status, matched_by, remarks)
        VALUES (?, ?, ?, ?, ?, ?, 'Manual', 'Accepted', ?, ?)
      `).run(entry.company_id, entryId, moduleName, recordId, reference, score, payload.user_id || null, payload.remarks || null);
      auditLog(db, { company_id: entry.company_id, user_id: payload.user_id || null, action: "bank_entry_manual_matched", table_name: "bank_statement_entries", record_id: entryId, new_value: JSON.stringify({ moduleName, recordId, reference, score }) });
    });
    tx();
    return db.prepare("SELECT * FROM bank_statement_entries WHERE id = ?").get(entryId);
  }

  function postApprovedBankImport(db, importId, userId = null) {
    const statement = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
    if (!statement) throw new Error("Bank statement import not found");
    auditLog(db, { company_id: statement.company_id, user_id: userId, action: "bank_statement_direct_post_blocked", table_name: "bank_statement_imports", record_id: importId, new_value: "Use Voucher Proposal Queue. Bank imports cannot post directly." });
    throw new Error("Direct Bank Book posting is disabled. Use Voucher Proposal Queue so every bank entry is reviewed, approved, drafted and posted through vouchers.");
  }

  function generateVoucherProposalsForImport(db, importId, userId = null) {
    const statement = db.prepare("SELECT * FROM bank_statement_imports WHERE id = ? AND COALESCE(is_deleted, 0) = 0").get(importId);
    if (!statement) throw new Error("Bank statement import not found");
    if (statement.status !== "Approved") throw new Error("Bank statement import must be approved before proposal generation");
    const entries = db.prepare(`
      SELECT bse.*, bsi.bank_name, bsi.bank_id import_bank_id
      FROM bank_statement_entries bse
      JOIN bank_statement_imports bsi ON bsi.id = bse.import_id
      WHERE bse.import_id = ?
        AND bse.validation_status = 'Valid'
        AND bse.match_status != 'Duplicate'
        AND COALESCE(bse.is_deleted, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM voucher_proposals vp WHERE vp.bank_entry_id = bse.id AND COALESCE(vp.is_deleted, 0) = 0)
      ORDER BY bse.transaction_date, bse.id
    `).all(importId);
    const tx = db.transaction(() => {
      entries.forEach((entry) => {
        const proposal = buildVoucherProposal(db, statement.company_id, entry);
        const info = db.prepare(`
          INSERT INTO voucher_proposals (
            company_id, bank_entry_id, import_id, bank_id, bank_name, transaction_date, narration, debit, credit, utr, reference_number,
            suggested_voucher_type, suggested_party_type, suggested_party_id, suggested_party_name, suggested_ledger_id, suggested_ledger_name,
            linked_invoice_id, linked_procurement_id, linked_order_id, linked_voucher_id, confidence_score, status, remarks
          ) VALUES (
            @company_id, @bank_entry_id, @import_id, @bank_id, @bank_name, @transaction_date, @narration, @debit, @credit, @utr, @reference_number,
            @suggested_voucher_type, @suggested_party_type, @suggested_party_id, @suggested_party_name, @suggested_ledger_id, @suggested_ledger_name,
            @linked_invoice_id, @linked_procurement_id, @linked_order_id, @linked_voucher_id, @confidence_score, @status, @remarks
          )
        `).run(proposal);
        proposalAudit(db, { company_id: statement.company_id, proposal_id: info.lastInsertRowid, bank_entry_id: entry.id, action: "Proposal Generated", created_by: userId, new_value: JSON.stringify({ status: proposal.status, confidence_score: proposal.confidence_score }) });
        db.prepare("UPDATE bank_statement_entries SET review_status = ?, voucher_id = COALESCE(voucher_id, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(proposal.status === "Already Booked" ? "Reconciled" : "Ready for Voucher Proposal", proposal.status === "Already Booked" ? proposal.linked_voucher_id : null, entry.id);
      });
      auditLog(db, { company_id: statement.company_id, user_id: userId, action: "voucher_proposals_generated", table_name: "bank_statement_imports", record_id: importId, new_value: JSON.stringify({ proposals: entries.length }) });
    });
    tx();
    return voucherProposalData(db, { company_id: statement.company_id, import_id: importId });
  }

  function voucherProposalData(db, filters = {}) {
    const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
    const where = ["vp.company_id = ?", "COALESCE(vp.is_deleted, 0) = 0"];
    const params = [companyId];
    if (filters.status) {
      where.push("vp.status = ?");
      params.push(filters.status);
    }
    if (filters.import_id) {
      where.push("vp.import_id = ?");
      params.push(Number(filters.import_id));
    }
    const proposals = db.prepare(`
      SELECT vp.*, b.bank_account_name, bse.match_status bank_match_status, bse.validation_status bank_validation_status,
        dv.voucher_number draft_voucher_number, dv.status draft_voucher_status,
        pv.voucher_number posted_voucher_number
      FROM voucher_proposals vp
      LEFT JOIN banks b ON b.id = vp.bank_id
      LEFT JOIN bank_statement_entries bse ON bse.id = vp.bank_entry_id
      LEFT JOIN vouchers dv ON dv.id = vp.draft_voucher_id
      LEFT JOIN vouchers pv ON pv.id = vp.posted_voucher_id
      WHERE ${where.join(" AND ")}
      ORDER BY vp.updated_at DESC, vp.id DESC
    `).all(...params).map((row) => ({ ...row, ...voucherProposalControlMeta(row) }));
    return {
      proposals,
      dashboard: {
        pendingProposals: proposals.filter((row) => ["Suggested", "Needs Review"].includes(row.status)).length,
        approvedPendingPosting: proposals.filter((row) => ["Approved", "Draft Voucher Created"].includes(row.status)).length,
        rejectedProposals: proposals.filter((row) => row.status === "Rejected").length,
        postedProposals: proposals.filter((row) => row.status === "Posted").length,
        unmatchedEntries: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0").get(companyId).count,
        duplicateBankEntries: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Duplicate' AND COALESCE(is_deleted, 0) = 0").get(companyId).count,
        bankEntriesAwaitingReview: db.prepare("SELECT COUNT(*) count FROM bank_statement_entries WHERE company_id = ? AND review_status IN ('Draft','Ready for Review','Approved','Ready for Voucher Proposal') AND COALESCE(is_deleted, 0) = 0").get(companyId).count
      },
      audit: db.prepare("SELECT * FROM voucher_proposal_audit WHERE company_id = ? ORDER BY created_at DESC, id DESC LIMIT 500").all(companyId),
      accounts: db.prepare("SELECT id, account_name, account_code, account_type FROM accounts WHERE company_id = ? AND is_deleted = 0 ORDER BY account_code").all(companyId),
      departments: db.prepare("SELECT id, department_name FROM government_departments WHERE status = 'active' ORDER BY department_name").all(),
      suppliers: db.prepare("SELECT id, supplier_name FROM suppliers WHERE status = 'active' ORDER BY supplier_name").all()
    };
  }

  function updateVoucherProposal(db, proposalId, payload = {}) {
    const proposal = getVoucherProposal(db, proposalId);
    if (["Draft Voucher Created", "Posted"].includes(proposal.status)) throw new Error("Proposal cannot be edited after draft voucher creation");
    const next = {
      suggested_voucher_type: payload.suggested_voucher_type || proposal.suggested_voucher_type,
      suggested_party_type: payload.suggested_party_type || proposal.suggested_party_type,
      suggested_party_id: payload.suggested_party_id ? Number(payload.suggested_party_id) : proposal.suggested_party_id,
      suggested_party_name: payload.suggested_party_name || proposal.suggested_party_name,
      suggested_ledger_id: payload.suggested_ledger_id ? Number(payload.suggested_ledger_id) : proposal.suggested_ledger_id,
      suggested_ledger_name: payload.suggested_ledger_name || proposal.suggested_ledger_name,
      linked_invoice_id: payload.linked_invoice_id ? Number(payload.linked_invoice_id) : proposal.linked_invoice_id,
      linked_procurement_id: payload.linked_procurement_id ? Number(payload.linked_procurement_id) : proposal.linked_procurement_id,
      linked_order_id: payload.linked_order_id ? Number(payload.linked_order_id) : proposal.linked_order_id,
      narration: payload.narration || proposal.narration,
      remarks: payload.remarks || proposal.remarks,
      status: payload.status || "Needs Review"
    };
    db.prepare(`
      UPDATE voucher_proposals SET
        suggested_voucher_type = @suggested_voucher_type,
        suggested_party_type = @suggested_party_type,
        suggested_party_id = @suggested_party_id,
        suggested_party_name = @suggested_party_name,
        suggested_ledger_id = @suggested_ledger_id,
        suggested_ledger_name = @suggested_ledger_name,
        linked_invoice_id = @linked_invoice_id,
        linked_procurement_id = @linked_procurement_id,
        linked_order_id = @linked_order_id,
        narration = @narration,
        remarks = @remarks,
        status = @status,
        reviewed_by = @reviewed_by,
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...next, reviewed_by: payload.user_id || null, id: proposal.id });
    proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Edited", created_by: payload.user_id || null, old_value: JSON.stringify(proposal), new_value: JSON.stringify(next), remarks: payload.remarks || null });
    return voucherProposalData(db, { company_id: proposal.company_id });
  }

  function approveVoucherProposal(db, proposalId, userId = null, remarks = "") {
    const proposal = getVoucherProposal(db, proposalId);
    if (proposal.status === "Already Booked") throw new Error(`Bank line is already booked in the books (${proposal.remarks || "matched voucher"}). It is reconciled; approving it would book the money twice.`);
    if (!["Suggested", "Needs Review", "Approved"].includes(proposal.status)) throw new Error("Only suggested or reviewed proposals can be approved");
    db.prepare("UPDATE voucher_proposals SET status = 'Approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP, remarks = COALESCE(NULLIF(?, ''), remarks), updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId, remarks, proposal.id);
    proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Approved", created_by: userId, remarks });
    return voucherProposalData(db, { company_id: proposal.company_id });
  }

  function rejectVoucherProposal(db, proposalId, userId = null, reason = "") {
    const proposal = getVoucherProposal(db, proposalId);
    if (proposal.status === "Posted") throw new Error("Posted proposal cannot be rejected");
    db.prepare("UPDATE voucher_proposals SET status = 'Rejected', rejected_by = ?, rejected_at = CURRENT_TIMESTAMP, rejection_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId, reason, proposal.id);
    proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Proposal Rejected", created_by: userId, remarks: reason });
    return voucherProposalData(db, { company_id: proposal.company_id });
  }

  function createDraftVoucherFromProposal(db, proposalId, userId = null) {
    const proposal = getVoucherProposal(db, proposalId);
    if (proposal.status !== "Approved") throw new Error("Proposal must be approved before draft voucher creation");
    if (proposal.draft_voucher_id) throw new Error("Draft voucher already exists for this proposal");
    const entry = db.prepare("SELECT * FROM bank_statement_entries WHERE id = ?").get(proposal.bank_entry_id);
    const booked = entry ? alreadyBookedMatch(db, entry) : null;
    if (booked) throw new Error(`Bank line is already booked as ${booked.reference}. Open Bank Reconciliation and mark it reconciled instead of creating a second voucher.`);
    const lines = voucherLinesFromProposal(db, proposal);
    const financialYear = assertOpenFinancialYear(db, proposal.company_id, proposal.transaction_date);
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Draft voucher proposal is not balanced");
    const tx = db.transaction(() => {
      const voucherNumber = nextVoucherNumber(db, proposal.company_id, `DRAFT-${proposal.suggested_voucher_type.toUpperCase().replaceAll(" ", "")}`);
      const info = db.prepare(`
        INSERT INTO vouchers (company_id, voucher_number, voucher_date, voucher_type, narration, source_module, source_id, status, financial_year_id, approval_status)
        VALUES (?, ?, ?, ?, ?, 'voucher_proposal', ?, 'Draft', ?, 'Pending Approval')
      `).run(proposal.company_id, voucherNumber, proposal.transaction_date, normalizeVoucherType(proposal.suggested_voucher_type), proposal.narration, proposal.id, financialYear.id);
      lines.forEach((line) => {
        db.prepare(`
          INSERT INTO voucher_lines (voucher_id, account_id, debit, credit, narration, linked_party_type, linked_party_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(info.lastInsertRowid, line.account_id, line.debit, line.credit, line.narration, line.linked_party_type || null, line.linked_party_id || null);
      });
      db.prepare("UPDATE voucher_proposals SET status = 'Draft Voucher Created', draft_voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(info.lastInsertRowid, proposal.id);
      db.prepare("UPDATE bank_statement_entries SET voucher_id = ?, review_status = 'Draft Voucher Created', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(info.lastInsertRowid, proposal.bank_entry_id);
      proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Draft Voucher Created", created_by: userId, new_value: JSON.stringify({ voucher_id: info.lastInsertRowid, voucher_number: voucherNumber }) });
      return info.lastInsertRowid;
    });
    tx();
    return voucherProposalData(db, { company_id: proposal.company_id });
  }

  function postDraftVoucherFromProposal(db, proposalId, userId = null) {
    const proposal = getVoucherProposal(db, proposalId);
    if (proposal.status !== "Draft Voucher Created") throw new Error("Create a draft voucher before posting");
    if (!proposal.draft_voucher_id) throw new Error("Draft voucher is missing");
    if (proposal.posted_voucher_id) throw new Error("Proposal already has a posted voucher");
    const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ? AND source_module = 'voucher_proposal' AND is_deleted = 0").get(proposal.draft_voucher_id);
    if (!voucher) throw new Error("Draft voucher not found");
    if (voucher.status === "Posted") throw new Error("Draft voucher is already posted");
    const lines = db.prepare("SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id").all(voucher.id);
    const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Draft voucher is not balanced");
    assertOpenFinancialYear(db, voucher.company_id, voucher.voucher_date);
    const cashBankActiveWhere = activeRowClause(db, "cash_bank_ledger");
    const tx = db.transaction(() => {
      lines.forEach((line) => {
        postLedgerEntry(db, voucher.company_id, voucher.id, line.id, line.account_id, voucher.voucher_date, Number(line.debit || 0), Number(line.credit || 0), "voucher_proposal", proposal.id);
      });
      lines.forEach((line) => {
        const account = accountById(db, voucher.company_id, line.account_id);
        if (!["Cash", "Bank"].includes(account?.account_name)) return;
        updateCashBankLedger(db, {
          company_id: voucher.company_id,
          bank_account_id: proposal.bank_id || null,
          transaction_date: voucher.voucher_date,
          transaction_type: voucher.voucher_type,
          source_module: "voucher_proposal",
          source_id: proposal.id,
          voucher_id: voucher.id,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
          payment_mode: "Bank Statement",
          utr_number: proposal.utr || proposal.reference_number || voucher.voucher_number,
          remarks: voucher.narration || proposal.narration
        });
      });
      db.prepare("UPDATE vouchers SET status = 'Posted', approval_status = 'Approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id);
      db.prepare("UPDATE voucher_proposals SET status = 'Posted', posted_voucher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(voucher.id, proposal.id);
      db.prepare(`UPDATE bank_statement_entries SET review_status = 'Posted', posted_bank_book_id = (SELECT id FROM cash_bank_ledger WHERE voucher_id = ?${cashBankActiveWhere} ORDER BY id DESC LIMIT 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(voucher.id, proposal.bank_entry_id);
      proposalAudit(db, { company_id: proposal.company_id, proposal_id: proposal.id, bank_entry_id: proposal.bank_entry_id, action: "Voucher Posted", created_by: userId, new_value: JSON.stringify({ voucher_id: voucher.id, voucher_number: voucher.voucher_number }) });
      auditLog(db, { company_id: proposal.company_id, user_id: userId, action: "voucher_proposal_posted", table_name: "voucher_proposals", record_id: proposal.id, new_value: JSON.stringify({ voucher_id: voucher.id }) });
    });
    tx();
    return voucherProposalData(db, { company_id: proposal.company_id });
  }

  function bankStatementData(db, filters = {}) {
    const companyId = Number(filters.company_id || db.prepare("SELECT id FROM companies ORDER BY id LIMIT 1").get()?.id || 0);
    const imports = db.prepare(`
      SELECT bsi.*, b.bank_account_name
      FROM bank_statement_imports bsi
      LEFT JOIN banks b ON b.id = bsi.bank_id
      WHERE bsi.company_id = ? AND COALESCE(bsi.is_deleted, 0) = 0
      ORDER BY bsi.imported_at DESC, bsi.id DESC
    `).all(companyId);
    const importId = Number(filters.import_id || imports[0]?.id || 0);
    const entries = importId ? db.prepare(`
      SELECT * FROM bank_statement_entries
      WHERE company_id = ? AND import_id = ? AND COALESCE(is_deleted, 0) = 0
      ORDER BY transaction_date, id
    `).all(companyId, importId) : [];
    return {
      imports,
      entries,
      matches: importId ? db.prepare("SELECT * FROM bank_reconciliation_matches WHERE company_id = ? AND bank_entry_id IN (SELECT id FROM bank_statement_entries WHERE import_id = ?) ORDER BY matched_at DESC").all(companyId, importId) : [],
      unmatchedReceipts: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND entry_type = 'Receipt' AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
      unmatchedPayments: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND entry_type = 'Payment' AND match_status = 'Unmatched' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
      duplicates: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND match_status = 'Duplicate' AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
      reviewRequired: db.prepare("SELECT * FROM bank_statement_entries WHERE company_id = ? AND (validation_status != 'Valid' OR match_status IN ('Review Required','Duplicate')) AND COALESCE(is_deleted, 0) = 0 ORDER BY transaction_date DESC").all(companyId),
      references: bankMatchLinks(db, companyId),
      banks: db.prepare("SELECT id, bank_account_name, bank_name, account_number FROM banks WHERE company_id = ? AND status = 'active' ORDER BY bank_account_name").all(companyId),
      companies: db.prepare("SELECT id, company_name FROM companies WHERE status = 'active' ORDER BY company_name").all()
    };
  }

  return {
    previewBankStatementImport,
    createBankStatementImport,
    updateBankImportStatus,
    manualBankEntryMatch,
    postApprovedBankImport,
    generateVoucherProposalsForImport,
    voucherProposalData,
    updateVoucherProposal,
    approveVoucherProposal,
    rejectVoucherProposal,
    createDraftVoucherFromProposal,
    postDraftVoucherFromProposal,
    bankStatementData
  };
}
