import { accountingData, initializeDatabase } from "../src/main/database/init.js";
import { parseProfileArgs, PROFILES } from "./lib/verificationProfiles.js";

const profile = parseProfileArgs();
const db = initializeDatabase();
const data = accountingData(db, {});
const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
const difference = Math.round((debit - credit) * 100) / 100;

const isProduction = profile.key === "production";
const isDevelopment = profile.key === "development" || profile.key === "testing" || profile.key === "training";

/* Detect clean development profile (no data yet) */
const isEmptyDevelopment = isDevelopment
  && data.vouchers.length === 0
  && data.ledger.length === 0
  && data.receivables.length === 0
  && data.payables.length === 0
  && data.cashBank.length === 0
  && Number(data.gstSummary.inputGst) === 0
  && Number(data.gstSummary.outputGst) === 0;

const checks = [];

if (isProduction) {
  checks.push(
    ["trial balance", difference === 0],
    ["receivables count", data.receivables.length === 0],
    ["payables count", data.payables.length === 0],
    ["vouchers count", data.vouchers.length === 0],
    ["ledger entries count", data.ledger.length === 0],
    ["accounts exist", data.accounts.length >= 15],
    ["input GST", Number(data.gstSummary.inputGst) === 0],
    ["output GST", Number(data.gstSummary.outputGst) === 0]
  );
} else if (isEmptyDevelopment) {
  /* Enhancement 10: Clean dev DB — PASS without strict checks */
} else {
  checks.push(
    ["accounts", data.accounts.length >= 15],
    ["vouchers", data.vouchers.length > 0],
    ["ledger entries", data.ledger.length > 0],
    ["cash bank ledger", data.cashBank.length > 0],
    ["receivables", data.receivables.length > 0],
    ["payables", data.payables.length > 0],
    ["input GST", data.gstSummary.inputGst > 0],
    ["output GST", data.gstSummary.outputGst > 0],
    ["trial balance", difference === 0]
  );
}

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({
  profile: profile.name,
  debit,
  credit,
  difference,
  accounts: data.accounts.length,
  vouchers: data.vouchers.length,
  ledgerEntries: data.ledger.length,
  cashBankEntries: data.cashBank.length,
  receivables: data.receivables.length,
  payables: data.payables.length,
  gstSummary: data.gstSummary
}, null, 2));

db.close();

if (isEmptyDevelopment) {
  console.log(`PASS: Development profile — empty data is expected`);
  process.exit(0);
}

if (failed.length) {
  console.error(`Failed accounting checks (${profile.name}): ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

process.exit(0);
