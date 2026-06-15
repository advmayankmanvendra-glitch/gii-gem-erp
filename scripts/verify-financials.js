import { accountingData, initializeDatabase } from "../src/main/database/init.js";

process.on("uncaughtException", (error) => {
  console.error(error.message || error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(error?.message || error);
  process.exit(1);
});

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const db = initializeDatabase();
const data = accountingData(db, {});

const debit = round(data.trialBalance.reduce((sum, row) => sum + Number(row.debit || 0), 0));
const credit = round(data.trialBalance.reduce((sum, row) => sum + Number(row.credit || 0), 0));
const trialBalanceDifference = round(debit - credit);

const plIncome = round(data.profitLoss.income);
const plExpenses = round(data.profitLoss.expenses);
const plNetProfit = round(data.profitLoss.netProfit);
const plDifference = round(plIncome - plExpenses - plNetProfit);

const assets = round(data.balanceSheet.assets);
const liabilitiesAndEquity = round(data.balanceSheet.liabilitiesAndEquity);
const balanceSheetDifference = round(assets - liabilitiesAndEquity);

const invoiceOutstanding = round(data.billWiseReceivables.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0));
const receivableOutstanding = round(data.receivables.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0));
const receivableDifference = round(invoiceOutstanding - receivableOutstanding);

const payableOutstanding = round(data.billWisePayables.reduce((sum, row) => sum + Number(row.balance_due || 0), 0));
const payableReportOutstanding = round(data.payables.reduce((sum, row) => sum + Number(row.balance_due || 0), 0));
const payableDifference = round(payableOutstanding - payableReportOutstanding);

const gstRegisterNet = round(data.gstRegisters.payable);
const gstSummaryNet = round(data.gstSummary.netGstPayable);
const gstDifference = round(gstRegisterNet - gstSummaryNet);

const tdsRegisterTds = round(data.tdsRegisters.reduce((sum, row) => sum + Number(row.tds_deducted || 0), 0));
const tdsReportTds = round(data.tdsReconciliation.reduce((sum, row) => sum + Number(row.tds_deducted || 0), 0));
const tdsDifference = round(tdsRegisterTds - tdsReportTds);

const gstTdsRegister = round(data.tdsRegisters.reduce((sum, row) => sum + Number(row.gst_tds_deducted || 0), 0));
const gstTdsReport = round(data.gstTdsReconciliation.reduce((sum, row) => sum + Number(row.gst_tds_deducted || 0), 0));
const gstTdsDifference = round(gstTdsRegister - gstTdsReport);

const result = {
  trialBalance: { debit, credit, difference: trialBalanceDifference },
  profitLoss: { income: plIncome, expenses: plExpenses, netProfit: plNetProfit, difference: plDifference },
  balanceSheet: { assets, liabilitiesAndEquity, difference: balanceSheetDifference },
  receivables: { billWiseOutstanding: invoiceOutstanding, ledgerOutstanding: receivableOutstanding, difference: receivableDifference },
  payables: { billWiseOutstanding: payableOutstanding, reportOutstanding: payableReportOutstanding, difference: payableDifference },
  gst: { registerNet: gstRegisterNet, summaryNet: gstSummaryNet, difference: gstDifference },
  tds: { tdsRegister: tdsRegisterTds, tdsReport: tdsReportTds, difference: tdsDifference },
  gstTds: { register: gstTdsRegister, report: gstTdsReport, difference: gstTdsDifference }
};

console.log(JSON.stringify(result, null, 2));

db.close();

assert(trialBalanceDifference === 0, "Trial Balance Difference is not zero");
assert(plDifference === 0, "P&L does not reconcile");
assert(balanceSheetDifference === 0, "Balance Sheet Difference is not zero");
assert(receivableDifference === 0, "Receivables do not reconcile");
assert(payableDifference === 0, "Payables do not reconcile");
assert(gstDifference === 0, "GST does not reconcile");
assert(tdsDifference === 0, "TDS does not reconcile");
assert(gstTdsDifference === 0, "GST TDS does not reconcile");
process.exit(0);
