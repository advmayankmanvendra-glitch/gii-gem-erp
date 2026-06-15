import fs from "node:fs";
import path from "node:path";
import {
  accountingData,
  approveVoucherProposal,
  createBankStatementImport,
  createDraftVoucherFromProposal,
  initializeDatabase,
  postApprovedBankImport,
  postDraftVoucherFromProposal,
  updateBankImportStatus,
  voucherProposalData
} from "../src/main/database/init.js";

const root = path.join(process.cwd(), "phase8b-smoke-db");
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const results = [];
const pass = (name, detail = "") => results.push({ name, status: "pass", detail });
const fail = (name, error) => results.push({ name, status: "fail", detail: error?.message || String(error) });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const tbDifference = (db) => {
  const data = accountingData(db, {});
  return Math.round(data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0) * 100) / 100;
};

const db = initializeDatabase(root);

try {
  const beforeDifference = tbDifference(db);
  assert(beforeDifference === 0, "Opening trial balance is not balanced");

  const bankImport = createBankStatementImport(db, {
    company_id: 1,
    bank_id: 1,
    bank_name: "SBI",
    file_name: "phase8b-bank-statement.csv",
    rows: [
      { Date: "2026-06-25", Narration: "NEFT UTR10001 Public Works Department customer receipt", Debit: "", Credit: "350000", Balance: "350000", UTR: "UTR10001" },
      { Date: "2026-06-26", Narration: "Supplier payment Prime Industrial Suppliers PIS-1001", Debit: "25000", Credit: "", Balance: "325000", UTR: "SUPPAY001" },
      { Date: "2026-06-27", Narration: "Bank charges NEFT fee", Debit: "250", Credit: "", Balance: "324750", UTR: "BANKCHG001" },
      { Date: "2026-06-28", Narration: "Unknown suspense entry", Debit: "", Credit: "1000", Balance: "325750", UTR: "UNMATCHED001" }
    ],
    mapping: {
      transaction_date: "Date",
      narration: "Narration",
      debit: "Debit",
      credit: "Credit",
      balance: "Balance",
      utr: "UTR"
    }
  });
  const importId = bankImport.imports[0].id;
  pass("Bank statement draft import created", `Import #${importId}`);

  updateBankImportStatus(db, importId, "Ready for Review", null, "Phase 8B smoke review");
  updateBankImportStatus(db, importId, "Approved", null, "Phase 8B smoke approval");
  const proposalData = voucherProposalData(db, { import_id: importId });
  assert(proposalData.proposals.length === 4, `Expected 4 proposals, found ${proposalData.proposals.length}`);
  pass("Approved bank import generated voucher proposals", `${proposalData.proposals.length} proposals`);

  assert(tbDifference(db) === beforeDifference, "Proposal generation affected trial balance");
  pass("Unapproved proposals have no accounting impact");

  const proposal = proposalData.proposals.find((row) => Number(row.credit || 0) > 0) || proposalData.proposals[0];
  approveVoucherProposal(db, proposal.id, null, "Approved by Phase 8B smoke");
  createDraftVoucherFromProposal(db, proposal.id, null);
  assert(tbDifference(db) === beforeDifference, "Draft voucher affected trial balance before posting");
  pass("Draft voucher has no posted accounting impact");

  let duplicateDraftBlocked = false;
  try {
    createDraftVoucherFromProposal(db, proposal.id, null);
  } catch (error) {
    duplicateDraftBlocked = /already|approved/i.test(error.message);
  }
  assert(duplicateDraftBlocked, "Duplicate draft voucher creation was not blocked");
  pass("Duplicate draft voucher creation is blocked");

  postDraftVoucherFromProposal(db, proposal.id, null);
  assert(tbDifference(db) === 0, "Trial balance not balanced after posting proposal draft");
  pass("Posted proposal voucher remains balanced", `Difference ${tbDifference(db)}`);

  let directPostBlocked = false;
  try {
    postApprovedBankImport(db, importId, null);
  } catch (error) {
    directPostBlocked = /disabled|Voucher Proposal Queue/i.test(error.message);
  }
  assert(directPostBlocked, "Direct bank import posting was not blocked");
  pass("Direct bank import posting is blocked");
} catch (error) {
  fail("Phase 8B smoke", error);
} finally {
  db.close();
}

const failed = results.filter((row) => row.status === "fail");
console.log(JSON.stringify({ root, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
