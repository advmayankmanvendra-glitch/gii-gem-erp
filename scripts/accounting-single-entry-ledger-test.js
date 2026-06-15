import {
  accountingData,
  createLedgerAccount,
  createManualVoucher,
  initializeDatabase,
  reverseVoucher
} from "../src/main/database/init.js";

const TEST_NARRATION = "TEST ACCOUNTING ENTRY - SAFE TO REVERSE";
const TEST_DATE = "2026-06-15";
const TEST_AMOUNT = 1000;

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function trialBalanceSnapshot(db, companyId) {
  const data = accountingData(db, { company_id: companyId, date_from: "2026-01-01", date_to: "2026-12-31" });
  const debit = round2(data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0));
  const credit = round2(data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0));
  return {
    debit,
    credit,
    difference: round2(debit - credit),
    rows: data.trialBalance.length
  };
}

function findAccount(db, companyId, candidates) {
  const rows = db.prepare(`
    SELECT * FROM accounts
    WHERE company_id = ? AND COALESCE(is_deleted, 0) = 0
    ORDER BY id
  `).all(companyId);
  const wanted = new Set(candidates.map(normalize));
  return rows.find((row) => wanted.has(normalize(row.account_name))) || null;
}

function voucherWithLines(db, voucherId) {
  const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucherId);
  const lines = db.prepare(`
    SELECT vl.*, a.account_name, a.account_type
    FROM voucher_lines vl
    JOIN accounts a ON a.id = vl.account_id
    WHERE vl.voucher_id = ?
    ORDER BY vl.id
  `).all(voucherId);
  const ledgerEntries = db.prepare(`
    SELECT le.*, a.account_name
    FROM ledger_entries le
    JOIN accounts a ON a.id = le.account_id
    WHERE le.voucher_id = ?
    ORDER BY le.id
  `).all(voucherId);
  const cashBankEntries = db.prepare(`
    SELECT *
    FROM cash_bank_ledger
    WHERE voucher_id = ?
    ORDER BY id
  `).all(voucherId);
  return { voucher, lines, ledgerEntries, cashBankEntries };
}

function findAuditLog(db, companyId, action, recordId) {
  return db.prepare(`
    SELECT *
    FROM audit_log
    WHERE company_id = ?
      AND action = ?
      AND table_name = 'vouchers'
      AND record_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(companyId, action, recordId);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const db = initializeDatabase();

try {
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  assertCondition(company, "No active company found for accounting test");

  const user = db.prepare("SELECT * FROM users WHERE status = 'active' ORDER BY id LIMIT 1").get();
  const before = trialBalanceSnapshot(db, company.id);
  assertCondition(before.difference === 0, `Trial balance was not balanced before test: ${before.difference}`);

  let officeExpense = findAccount(db, company.id, ["Office Expense A/c", "Office Expense", "Office Expenses"]);
  let officeExpenseCreated = false;
  if (!officeExpense) {
    officeExpense = createLedgerAccount(db, {
      company_id: company.id,
      account_name: "Office Expense A/c",
      account_type: "Expense",
      normal_balance: "Debit",
      opening_balance: 0,
      source_module: "accounting_single_entry_test",
      user_id: user?.id || null
    });
    officeExpenseCreated = true;
  }

  const cash = findAccount(db, company.id, ["Cash"]);
  assertCondition(cash, "Cash account not found");

  const voucher = createManualVoucher(db, {
    company_id: company.id,
    voucher_date: TEST_DATE,
    voucher_type: "Journal",
    narration: TEST_NARRATION,
    reference_number: "TEST-JV-1000",
    lines: [
      {
        account_id: officeExpense.id,
        debit: TEST_AMOUNT,
        credit: 0,
        narration: TEST_NARRATION
      },
      {
        account_id: cash.id,
        debit: 0,
        credit: TEST_AMOUNT,
        narration: TEST_NARRATION
      }
    ]
  });

  const posted = voucherWithLines(db, voucher.id);
  assertCondition(posted.voucher, "Test voucher not found in voucher register");
  assertCondition(posted.voucher.status === "Posted", `Expected posted voucher, got ${posted.voucher.status}`);
  assertCondition(posted.lines.length === 2, `Expected 2 voucher lines, got ${posted.lines.length}`);
  assertCondition(posted.ledgerEntries.length === 2, `Expected 2 ledger entries, got ${posted.ledgerEntries.length}`);

  const officePostedLine = posted.lines.find((line) => line.account_id === officeExpense.id);
  const cashPostedLine = posted.lines.find((line) => line.account_id === cash.id);
  assertCondition(round2(officePostedLine?.debit) === TEST_AMOUNT, "Office Expense voucher debit mismatch");
  assertCondition(round2(cashPostedLine?.credit) === TEST_AMOUNT, "Cash voucher credit mismatch");

  const officePostedLedger = posted.ledgerEntries.find((line) => line.account_id === officeExpense.id);
  const cashPostedLedger = posted.ledgerEntries.find((line) => line.account_id === cash.id);
  assertCondition(round2(officePostedLedger?.debit) === TEST_AMOUNT, "Office Expense ledger debit mismatch");
  assertCondition(round2(cashPostedLedger?.credit) === TEST_AMOUNT, "Cash ledger credit mismatch");

  assertCondition(posted.cashBankEntries.some((row) => round2(row.credit) === TEST_AMOUNT), "Cash/Bank ledger credit row missing for original voucher");
  const postingAudit = findAuditLog(db, company.id, "voucher posting", voucher.id);
  assertCondition(postingAudit, "Audit log missing voucher posting entry");

  const afterPosting = trialBalanceSnapshot(db, company.id);
  assertCondition(afterPosting.difference === 0, `Trial balance not balanced after posting: ${afterPosting.difference}`);

  const reversal = reverseVoucher(db, voucher.id, TEST_NARRATION);
  const originalAfterReversal = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucher.id);
  const reversed = voucherWithLines(db, reversal.id);

  assertCondition(originalAfterReversal.status === "Reversed", `Original voucher status after reversal is ${originalAfterReversal.status}`);
  assertCondition(reversed.voucher, "Reversal voucher not found");
  assertCondition(reversed.lines.length === 2, `Expected 2 reversal voucher lines, got ${reversed.lines.length}`);
  assertCondition(reversed.ledgerEntries.length === 2, `Expected 2 reversal ledger entries, got ${reversed.ledgerEntries.length}`);

  const officeReversalLine = reversed.lines.find((line) => line.account_id === officeExpense.id);
  const cashReversalLine = reversed.lines.find((line) => line.account_id === cash.id);
  assertCondition(round2(officeReversalLine?.credit) === TEST_AMOUNT, "Office Expense reversal credit mismatch");
  assertCondition(round2(cashReversalLine?.debit) === TEST_AMOUNT, "Cash reversal debit mismatch");

  const officeReversalLedger = reversed.ledgerEntries.find((line) => line.account_id === officeExpense.id);
  const cashReversalLedger = reversed.ledgerEntries.find((line) => line.account_id === cash.id);
  assertCondition(round2(officeReversalLedger?.credit) === TEST_AMOUNT, "Office Expense ledger reversal credit mismatch");
  assertCondition(round2(cashReversalLedger?.debit) === TEST_AMOUNT, "Cash ledger reversal debit mismatch");

  assertCondition(reversed.cashBankEntries.some((row) => round2(row.debit) === TEST_AMOUNT), "Cash/Bank ledger debit row missing for reversal voucher");
  const reversalAudit = findAuditLog(db, company.id, "voucher reversal", voucher.id);
  assertCondition(reversalAudit, "Audit log missing voucher reversal entry");

  const afterReversal = trialBalanceSnapshot(db, company.id);
  assertCondition(afterReversal.difference === 0, `Trial balance not balanced after reversal: ${afterReversal.difference}`);

  const output = {
    status: "passed",
    company: {
      id: company.id,
      name: company.company_name
    },
    officeExpenseAccountCreated: officeExpenseCreated,
    voucher: {
      id: voucher.id,
      number: voucher.voucher_number,
      date: voucher.voucher_date,
      type: voucher.voucher_type,
      narration: voucher.narration,
      statusAfterPosting: posted.voucher.status,
      statusAfterReversal: originalAfterReversal.status
    },
    reversalVoucher: {
      id: reversal.id,
      number: reversal.voucher_number,
      date: reversal.voucher_date,
      type: reversal.voucher_type,
      narration: reversal.narration,
      status: reversed.voucher.status
    },
    debitLedger: {
      id: officeExpense.id,
      name: officeExpense.account_name,
      originalDebit: round2(officePostedLedger.debit),
      reversalCredit: round2(officeReversalLedger.credit)
    },
    creditLedger: {
      id: cash.id,
      name: cash.account_name,
      originalCredit: round2(cashPostedLedger.credit),
      reversalDebit: round2(cashReversalLedger.debit)
    },
    amount: TEST_AMOUNT,
    cashBankLedger: {
      originalRows: posted.cashBankEntries.map((row) => ({ id: row.id, debit: round2(row.debit), credit: round2(row.credit), balance: round2(row.balance) })),
      reversalRows: reversed.cashBankEntries.map((row) => ({ id: row.id, debit: round2(row.debit), credit: round2(row.credit), balance: round2(row.balance) }))
    },
    auditLog: {
      postingAuditId: postingAudit.id,
      reversalAuditId: reversalAudit.id
    },
    trialBalance: {
      before,
      afterPosting,
      afterReversal
    }
  };

  console.log(JSON.stringify(output, null, 2));
  db.close();
  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    error: error.message,
    stack: error.stack
  }, null, 2));
  db.close();
  process.exit(1);
}
