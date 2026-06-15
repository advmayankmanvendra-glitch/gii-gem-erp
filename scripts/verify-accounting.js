import { accountingData, initializeDatabase } from "../src/main/database/init.js";

const db = initializeDatabase();
const data = accountingData(db, {});
const debit = data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0);
const credit = data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0);
const difference = Math.round((debit - credit) * 100) / 100;

const checks = [
  ["accounts", data.accounts.length >= 15],
  ["vouchers", data.vouchers.length > 0],
  ["ledger entries", data.ledger.length > 0],
  ["cash bank ledger", data.cashBank.length > 0],
  ["receivables", data.receivables.length > 0],
  ["payables", data.payables.length > 0],
  ["input GST", data.gstSummary.inputGst > 0],
  ["output GST", data.gstSummary.outputGst > 0],
  ["trial balance", difference === 0]
];

const failed = checks.filter(([, ok]) => !ok);
console.log(JSON.stringify({
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

if (failed.length) {
  console.error(`Failed accounting checks: ${failed.map(([name]) => name).join(", ")}`);
  process.exit(1);
}

process.exit(0);
