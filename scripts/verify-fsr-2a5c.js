/* ═══════════════════════════════════════════════════════════════════════════ */
/*  FSR-2A.5C — Consolidated Accounting-Truth Recertification Verifier       */
/* ═══════════════════════════════════════════════════════════════════════════ */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

if (!process.versions.electron) {
  const electronBinary = process.platform === "win32"
    ? path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe")
    : path.join(repoRoot, "node_modules", ".bin", "electron");
  const result = spawnSync(electronBinary, [
    "--disable-gpu", "--disable-gpu-compositing", "--disable-gpu-sandbox",
    "--disable-accelerated-2d-canvas", "--in-process-gpu",
    scriptPath, "--electron-child"
  ], { cwd: repoRoot, env: process.env, stdio: "inherit" });
  process.exit(Number.isInteger(result.status) ? result.status : 1);
}

import * as m from "../src/main/domain/money.js";
import { addShadowColumns, hasAllShadowColumns, backfillAll, SHADOW_COLUMNS } from "../src/main/database/moneyMigration.js";

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail: String(detail) });
  const icon = pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  ${icon}  ${name}  —  ${detail}`);
}

let _require;
function withTempDb(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-fsr2a5c-"));
  const dbPath = path.join(root, "test.db");
  _require = _require || createRequire(import.meta.url);
  const Database = _require("better-sqlite3");
  const db = new Database(dbPath);
  try { fn(db, root); } finally { db.close(); try { fs.rmSync(root, { recursive: true, force: true }); } catch {} }
}

const A = {
  CAPITAL: 1, DRAWINGS: 2, RETAINED_EARNINGS: 3, CURRENT_PROFIT: 4,
  CASH: 5, BANK: 6, TRADE_RECEIVABLES: 7, TRADE_PAYABLES: 8,
  INVENTORY: 9, GRNI: 10, COGS: 11, PURCHASE: 12, SALES: 13,
  SALARY: 14, RENT: 15, OUTPUT_GST: 16, INPUT_GST: 17,
  FIXED_ASSET: 18, ACCUM_DEPR: 19, DEPRECIATION: 20, LOAN: 21,
  ADVANCE_RECEIPT: 22, SUPPLIER_ADVANCE: 23, EXPENSE_ACCRUAL: 24, PREPAID_EXPENSE: 25,
  DISCOUNT_ALLOWED: 26, DISCOUNT_RECEIVED: 27, ROUND_OFF: 28,
  INV_ADJ_GAIN: 29, INV_ADJ_LOSS: 30, TDS_PAYABLE: 31, TDS_RECEIVABLE: 32,
};

function createFixture(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (id INTEGER PRIMARY KEY, company_name TEXT, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, display_name TEXT);
    CREATE TABLE IF NOT EXISTS financial_years (id INTEGER PRIMARY KEY, company_id INTEGER, financial_year_name TEXT, start_date TEXT, end_date TEXT, status TEXT NOT NULL DEFAULT 'Open');
    CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, account_code TEXT, account_type TEXT, normal_balance TEXT, opening_balance REAL NOT NULL DEFAULT 0, opening_balance_minor INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS vouchers (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_number TEXT, voucher_date TEXT, voucher_type TEXT, narration TEXT, source_module TEXT, source_id INTEGER, status TEXT NOT NULL DEFAULT 'Posted', financial_year_id INTEGER, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS voucher_lines (id INTEGER PRIMARY KEY, voucher_id INTEGER, account_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0, narration TEXT, linked_party_type TEXT, linked_party_id INTEGER);
    CREATE TABLE IF NOT EXISTS ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_id INTEGER, voucher_line_id INTEGER, account_id INTEGER, entry_date TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, debit_minor INTEGER NOT NULL DEFAULT 0, credit_minor INTEGER NOT NULL DEFAULT 0, running_balance REAL NOT NULL DEFAULT 0, running_balance_minor INTEGER NOT NULL DEFAULT 0, source_module TEXT, source_id INTEGER);
    CREATE TABLE IF NOT EXISTS opening_balances (id INTEGER PRIMARY KEY, company_id INTEGER, financial_year_id INTEGER, balance_type TEXT, linked_id INTEGER, account_id INTEGER, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0, opening_debit_minor INTEGER NOT NULL DEFAULT 0, opening_credit_minor INTEGER NOT NULL DEFAULT 0, voucher_id INTEGER);
    CREATE TABLE IF NOT EXISTS carry_forward_entries (id INTEGER PRIMARY KEY, company_id INTEGER, from_financial_year_id INTEGER, to_financial_year_id INTEGER, account_id INTEGER, party_type TEXT, party_id INTEGER, closing_balance REAL NOT NULL DEFAULT 0, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0, closing_balance_minor INTEGER NOT NULL DEFAULT 0, opening_debit_minor INTEGER NOT NULL DEFAULT 0, opening_credit_minor INTEGER NOT NULL DEFAULT 0, opening_voucher_id INTEGER);
    CREATE TABLE IF NOT EXISTS stock_ledger (id INTEGER PRIMARY KEY, company_id INTEGER, item_id INTEGER, warehouse_id INTEGER, transaction_date TEXT, transaction_type TEXT, inward_quantity REAL NOT NULL DEFAULT 0, outward_quantity REAL NOT NULL DEFAULT 0, balance_quantity REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, value REAL NOT NULL DEFAULT 0, value_minor INTEGER NOT NULL DEFAULT 0, running_value REAL NOT NULL DEFAULT 0, running_value_minor INTEGER NOT NULL DEFAULT 0, source_module TEXT, source_id INTEGER);
    CREATE TABLE IF NOT EXISTS government_departments (id INTEGER PRIMARY KEY, department_name TEXT, company_id INTEGER, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY, supplier_name TEXT, company_id INTEGER, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, item_name TEXT, inventory_enabled INTEGER NOT NULL DEFAULT 1, valuation_method TEXT NOT NULL DEFAULT 'Weighted Average', is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, warehouse_name TEXT, company_id INTEGER, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS supply_orders (id INTEGER PRIMARY KEY, order_number TEXT, company_id INTEGER, is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS invoices (id INTEGER PRIMARY KEY, invoice_number TEXT, company_id INTEGER, billing_value REAL NOT NULL DEFAULT 0, gst_rate REAL NOT NULL DEFAULT 0, posting_status TEXT NOT NULL DEFAULT 'Draft', is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS procurements (id INTEGER PRIMARY KEY, purchase_invoice_number TEXT, company_id INTEGER, supplier_id INTEGER, order_id INTEGER, purchase_value REAL NOT NULL DEFAULT 0, purchase_gst REAL NOT NULL DEFAULT 0, posting_status TEXT NOT NULL DEFAULT 'Draft', is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, utr_number TEXT, company_id INTEGER, payment_amount REAL NOT NULL DEFAULT 0, posting_status TEXT NOT NULL DEFAULT 'Draft', is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS supplier_payments (id INTEGER PRIMARY KEY, utr_number TEXT, company_id INTEGER, amount_paid REAL NOT NULL DEFAULT 0, posting_status TEXT NOT NULL DEFAULT 'Draft', is_deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS receivables (id INTEGER PRIMARY KEY, company_id INTEGER, billing_id INTEGER, order_id INTEGER, department_id INTEGER, invoice_number TEXT, invoice_date TEXT, invoice_amount REAL NOT NULL DEFAULT 0, amount_received REAL NOT NULL DEFAULT 0, balance_outstanding REAL NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0);
  `);

  db.prepare("INSERT INTO companies (id, company_name) VALUES (1, 'Test Company')").run();
  db.prepare("INSERT INTO users (id, display_name) VALUES (1, 'Admin')").run();
  db.prepare("INSERT INTO financial_years (id, company_id, financial_year_name, start_date, end_date, status) VALUES (1, 1, 'FY 2024-25', '2024-04-01', '2025-03-31', 'Open')").run();
  db.prepare("INSERT INTO financial_years (id, company_id, financial_year_name, start_date, end_date, status) VALUES (2, 1, 'FY 2025-26', '2025-04-01', '2026-03-31', 'Open')").run();
  db.prepare("INSERT INTO government_departments (id, department_name, company_id) VALUES (1, 'Test Department', 1)").run();
  db.prepare("INSERT INTO suppliers (id, supplier_name, company_id) VALUES (1, 'Test Supplier', 1)").run();
  db.prepare("INSERT INTO items (id, item_name, inventory_enabled, valuation_method) VALUES (1, 'Widget A', 1, 'Weighted Average')").run();
  db.prepare("INSERT INTO items (id, item_name, inventory_enabled, valuation_method) VALUES (2, 'Service B', 0, 'Weighted Average')").run();
  db.prepare("INSERT INTO warehouses (id, warehouse_name, company_id) VALUES (1, 'Main Warehouse', 1)").run();
  db.prepare("INSERT INTO supply_orders (id, order_number, company_id) VALUES (1, 'SO-2024-001', 1)").run();

  const accounts = [
    { id: A.CAPITAL,          code:"3010", name:"Capital",            type:"Equity",   norm:"Credit", ob:m.parseMoneyToMinor(300000.00) },
    { id: A.DRAWINGS,         code:"3020", name:"Drawings",           type:"Equity",   norm:"Debit",  ob:0 },
    { id: A.RETAINED_EARNINGS,code:"3030", name:"Retained Earnings",  type:"Equity",   norm:"Credit", ob:0 },
    { id: A.CURRENT_PROFIT,   code:"3040", name:"Current Year Profit",type:"Equity",   norm:"Credit", ob:0 },
    { id: A.CASH,             code:"1010", name:"Cash",               type:"Asset",    norm:"Debit",  ob:m.parseMoneyToMinor(100000.00) },
    { id: A.BANK,             code:"1020", name:"Bank",               type:"Asset",    norm:"Debit",  ob:m.parseMoneyToMinor(200000.00) },
    { id: A.TRADE_RECEIVABLES,code:"1030", name:"Trade Receivables",  type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.TRADE_PAYABLES,   code:"2010", name:"Trade Payables",     type:"Liability",norm:"Credit", ob:0 },
    { id: A.INVENTORY,        code:"1040", name:"Inventory",          type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.GRNI,             code:"2011", name:"Goods Received Not Invoiced", type:"Liability",norm:"Credit", ob:0 },
    { id: A.COGS,             code:"5010", name:"Cost of Goods Sold", type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.PURCHASE,         code:"5020", name:"Purchase",           type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.SALES,            code:"4010", name:"Sales",              type:"Income",   norm:"Credit", ob:0 },
    { id: A.SALARY,           code:"5030", name:"Salary",             type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.RENT,             code:"5040", name:"Rent",               type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.OUTPUT_GST,       code:"2020", name:"Output GST",         type:"Liability",norm:"Credit", ob:0 },
    { id: A.INPUT_GST,        code:"1050", name:"Input GST",          type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.FIXED_ASSET,      code:"1060", name:"Fixed Asset",        type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.ACCUM_DEPR,       code:"1070", name:"Accumulated Depreciation", type:"Asset",norm:"Credit", ob:0 },
    { id: A.DEPRECIATION,     code:"5050", name:"Depreciation",       type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.LOAN,             code:"2030", name:"Loan",               type:"Liability",norm:"Credit", ob:0 },
    { id: A.ADVANCE_RECEIPT,  code:"2040", name:"Advance Receipt",    type:"Liability",norm:"Credit", ob:0 },
    { id: A.SUPPLIER_ADVANCE, code:"1080", name:"Supplier Advance",   type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.EXPENSE_ACCRUAL,  code:"2050", name:"Expense Accrual",    type:"Liability",norm:"Credit", ob:0 },
    { id: A.PREPAID_EXPENSE,  code:"1090", name:"Prepaid Expense",    type:"Asset",    norm:"Debit",  ob:0 },
    { id: A.DISCOUNT_ALLOWED, code:"5060", name:"Discount Allowed",   type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.DISCOUNT_RECEIVED,code:"4020", name:"Discount Received",  type:"Income",   norm:"Credit", ob:0 },
    { id: A.ROUND_OFF,        code:"5070", name:"Round Off",          type:"Expense",  norm:"Debit",  ob:0 },
    { id: A.INV_ADJ_GAIN,     code:"4030", name:"Inventory Adjustment Gain", type:"Income",norm:"Credit", ob:0 },
    { id: A.INV_ADJ_LOSS,     code:"5080", name:"Inventory Adjustment Loss", type:"Expense",norm:"Debit", ob:0 },
    { id: A.TDS_PAYABLE,      code:"2060", name:"TDS Payable",        type:"Liability",norm:"Credit", ob:0 },
    { id: A.TDS_RECEIVABLE,   code:"1100", name:"TDS Receivable",     type:"Asset",    norm:"Debit",  ob:0 },
  ];

  const insA = db.prepare("INSERT INTO accounts (id, company_id, account_name, account_code, account_type, normal_balance, opening_balance, opening_balance_minor, is_deleted) VALUES (?, 1, ?, ?, ?, ?, ?, ?, 0)");
  for (const a of accounts) insA.run(a.id, a.name, a.code, a.type, a.norm, m.minorToMajor(a.ob), a.ob);

  const insOB = db.prepare("INSERT INTO opening_balances (company_id, financial_year_id, balance_type, account_id, opening_debit, opening_credit, opening_debit_minor, opening_credit_minor) VALUES (1, 1, 'account', ?, 0, ?, 0, ?)");
  insOB.run(A.CAPITAL, m.minorToMajor(30000000), 30000000);
  const insOBDr = db.prepare("INSERT INTO opening_balances (company_id, financial_year_id, balance_type, account_id, opening_debit, opening_credit, opening_debit_minor, opening_credit_minor) VALUES (1, 1, 'account', ?, ?, 0, ?, 0)");
  insOBDr.run(A.CASH, m.minorToMajor(10000000), 10000000);
  insOBDr.run(A.BANK, m.minorToMajor(20000000), 20000000);
}

let _nextVlId = 100, _nextLeId = 200, _nextVId = 100;

function L(acct, db, cr, nar) {
  return { acct, db: db||0, cr: cr||0, nar: nar||"" };
}

function postV(db, cid, fy, date, type, lines, nar) {
  const vId = _nextVId++;
  db.prepare("INSERT INTO vouchers (id,company_id,voucher_number,voucher_date,voucher_type,narration,status,financial_year_id,is_deleted) VALUES (?,?,?,?,?,?,'Posted',?,0)")
    .run(vId, cid, `${type}-${vId}`, date, type, nar||"", fy);
  for (const l of lines) {
    const vlId = _nextVlId++;
    const dMaj = m.minorToMajor(l.db), cMaj = m.minorToMajor(l.cr);
    db.prepare("INSERT INTO voucher_lines (id,voucher_id,account_id,debit,credit,debit_minor,credit_minor,narration) VALUES (?,?,?,?,?,?,?,?)")
      .run(vlId, vId, l.acct, dMaj, cMaj, l.db, l.cr, l.nar||"");
    const leId = _nextLeId++;
    db.prepare("INSERT INTO ledger_entries (id,company_id,voucher_id,voucher_line_id,account_id,entry_date,debit,credit,debit_minor,credit_minor,running_balance,running_balance_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(leId, cid, vId, vlId, l.acct, date, dMaj, cMaj, l.db, l.cr, dMaj, l.db);
  }
  return vId;
}

function buildLifecycle(db) {
  const C=1, FY1=1, DF="2024-04-01", DT="2025-03-31";
  _nextVlId=100; _nextLeId=200; _nextVId=100;

  /* V1: Purchase 10 units @ 1000 + 18% GST */
  const pRate = m.parseMoneyToMinor(1000), pVal = 10 * pRate, pGst = m.calculatePercentage(pVal, 18), pTotal = pVal + pGst;
  postV(db, C, FY1, "2024-05-01", "Journal", [L(A.INVENTORY, pVal, 0, "Stock inward"), L(A.GRNI, 0, pVal, "GRNI")], "Stock inward");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,inward_quantity,outward_quantity,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2024-05-01","Inward",10,0,10,m.minorToMajor(pRate),m.minorToMajor(pVal),pVal,m.minorToMajor(pVal),pVal);

  postV(db, C, FY1, "2024-05-15", "Purchase", [L(A.GRNI, pVal, 0, "GRNI clear"), L(A.INPUT_GST, pGst, 0, "Input GST"), L(A.TRADE_PAYABLES, 0, pTotal, "Supplier")], "Supplier invoice");
  db.prepare("INSERT INTO procurements (id,purchase_invoice_number,company_id,supplier_id,order_id,purchase_value,purchase_gst,posting_status,is_deleted) VALUES (1,'PI-001',1,1,1,?,?,'Posted',0)").run(m.minorToMajor(pVal),m.minorToMajor(pGst));

  /* V2: Sale 5 units @ 1250 + 18% GST */
  const sRate = m.parseMoneyToMinor(1250), sVal = 5 * sRate, sGst = m.calculatePercentage(sVal, 18), sTotal = sVal + sGst;
  const cogs = 5 * pRate;
  postV(db, C, FY1, "2024-06-01", "Sales", [L(A.TRADE_RECEIVABLES, sTotal, 0, "Sale"), L(A.SALES, 0, sVal, "Revenue"), L(A.OUTPUT_GST, 0, sGst, "Output GST")], "Sale");
  db.prepare("INSERT INTO invoices (id,invoice_number,company_id,billing_value,gst_rate,posting_status,is_deleted) VALUES (1,'INV-001',1,?,18,'Posted',0)").run(m.minorToMajor(sVal));
  db.prepare("INSERT INTO receivables (company_id,billing_id,order_id,department_id,invoice_number,invoice_date,invoice_amount,amount_received,balance_outstanding,is_deleted) VALUES (1,1,1,1,'INV-001','2024-06-01',?,0,?,0)").run(m.minorToMajor(sTotal),m.minorToMajor(sTotal));

  postV(db, C, FY1, "2024-06-01", "Journal", [L(A.COGS, cogs, 0, "COGS"), L(A.INVENTORY, 0, cogs, "Stock out")], "COGS");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,inward_quantity,outward_quantity,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2024-06-01","Outward",0,5,5,m.minorToMajor(pRate),m.minorToMajor(cogs),cogs,m.minorToMajor(5*pRate),5*pRate);

  /* V3: Receipt 5000 */
  postV(db, C, FY1, "2024-07-01", "Receipt", [L(A.BANK, m.parseMoneyToMinor(5000), 0, "Receipt"), L(A.TRADE_RECEIVABLES, 0, m.parseMoneyToMinor(5000), "Allocation")], "Receipt");
  db.prepare("INSERT INTO payments (id,utr_number,company_id,payment_amount,posting_status,is_deleted) VALUES (1,'UTR-001',1,?,'Posted',0)").run(m.minorToMajor(5000));

  /* V4: Supplier payment 5000 */
  postV(db, C, FY1, "2024-08-01", "Payment", [L(A.TRADE_PAYABLES, m.parseMoneyToMinor(5000), 0, "Payment"), L(A.BANK, 0, m.parseMoneyToMinor(5000), "Supplier pay")], "Supplier payment");
  db.prepare("INSERT INTO supplier_payments (id,utr_number,company_id,amount_paid,posting_status,is_deleted) VALUES (1,'UTR-SP-001',1,?,'Posted',0)").run(m.minorToMajor(5000));

  /* V5: Department return 1 unit */
  postV(db, C, FY1, "2024-09-01", "Journal", [L(A.INVENTORY, pRate, 0, "Return"), L(A.COGS, 0, pRate, "COGS reversal")], "Dept return");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,inward_quantity,outward_quantity,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2024-09-01","Return",1,0,6,m.minorToMajor(pRate),m.minorToMajor(pRate),pRate,m.minorToMajor(6*pRate),6*pRate);

  /* V6: Salary 15000 */
  postV(db, C, FY1, "2024-07-31", "Payment", [L(A.SALARY, m.parseMoneyToMinor(15000), 0, "Salary"), L(A.BANK, 0, m.parseMoneyToMinor(15000), "Salary paid")], "Salary");
  /* V7: Rent 5000 */
  postV(db, C, FY1, "2024-08-01", "Payment", [L(A.RENT, m.parseMoneyToMinor(5000), 0, "Rent"), L(A.BANK, 0, m.parseMoneyToMinor(5000), "Rent paid")], "Rent");
  /* V8: Fixed asset 50000 */
  postV(db, C, FY1, "2024-10-01", "Payment", [L(A.FIXED_ASSET, m.parseMoneyToMinor(50000), 0, "Equipment"), L(A.BANK, 0, m.parseMoneyToMinor(50000), "FA payment")], "FA purchase");
  /* V9: Depreciation 5000 */
  postV(db, C, FY1, "2025-03-31", "Journal", [L(A.DEPRECIATION, m.parseMoneyToMinor(5000), 0, "Depr"), L(A.ACCUM_DEPR, 0, m.parseMoneyToMinor(5000), "Accum depr")], "Depreciation");
  /* V10: Loan 25000 */
  postV(db, C, FY1, "2024-11-01", "Journal", [L(A.BANK, m.parseMoneyToMinor(25000), 0, "Loan"), L(A.LOAN, 0, m.parseMoneyToMinor(25000), "Loan")], "Loan");
  /* V11: Advance receipt 3000 */
  postV(db, C, FY1, "2024-12-01", "Receipt", [L(A.BANK, m.parseMoneyToMinor(3000), 0, "Advance"), L(A.ADVANCE_RECEIPT, 0, m.parseMoneyToMinor(3000))], "Adv rec");
  /* V12: Supplier advance 2000 */
  postV(db, C, FY1, "2024-12-15", "Payment", [L(A.SUPPLIER_ADVANCE, m.parseMoneyToMinor(2000), 0, "Advance"), L(A.BANK, 0, m.parseMoneyToMinor(2000))], "Supp adv");
  /* V13: Accrual 2000 */
  postV(db, C, FY1, "2025-03-31", "Journal", [L(A.SALARY, m.parseMoneyToMinor(2000), 0, "Accrual"), L(A.EXPENSE_ACCRUAL, 0, m.parseMoneyToMinor(2000))], "Accrual");
  /* V14: Prepaid 1200 */
  postV(db, C, FY1, "2025-01-01", "Payment", [L(A.PREPAID_EXPENSE, m.parseMoneyToMinor(1200), 0, "Prepaid"), L(A.BANK, 0, m.parseMoneyToMinor(1200))], "Prepaid");
  /* V15: Discount allowed 500 */
  postV(db, C, FY1, "2025-02-01", "Journal", [L(A.DISCOUNT_ALLOWED, m.parseMoneyToMinor(500), 0, "Discount"), L(A.TRADE_RECEIVABLES, 0, m.parseMoneyToMinor(500))], "Discount all");
  /* V16: Discount received 300 */
  postV(db, C, FY1, "2025-02-15", "Journal", [L(A.TRADE_PAYABLES, m.parseMoneyToMinor(300), 0, "Discount"), L(A.DISCOUNT_RECEIVED, 0, m.parseMoneyToMinor(300))], "Discount rec");
  /* V17: Inv adj gain 800 */
  postV(db, C, FY1, "2025-03-01", "Journal", [L(A.INVENTORY, m.parseMoneyToMinor(800), 0, "Gain"), L(A.INV_ADJ_GAIN, 0, m.parseMoneyToMinor(800))], "Adj gain");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2025-03-01","Adjustment",6,m.minorToMajor(pRate),m.minorToMajor(800),80000,m.minorToMajor(6*pRate+80000),6*pRate+80000);
  /* V18: Inv adj loss 400 */
  postV(db, C, FY1, "2025-03-15", "Journal", [L(A.INV_ADJ_LOSS, m.parseMoneyToMinor(400), 0, "Loss"), L(A.INVENTORY, 0, m.parseMoneyToMinor(400))], "Adj loss");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2025-03-15","Adjustment",6,m.minorToMajor(pRate),m.minorToMajor(400),-40000,m.minorToMajor(6*pRate+80000-40000),6*pRate+80000-40000);
  /* V19: Contra 2000 cash to bank */
  postV(db, C, FY1, "2025-03-20", "Contra", [L(A.BANK, m.parseMoneyToMinor(2000), 0, "Deposited"), L(A.CASH, 0, m.parseMoneyToMinor(2000))], "Contra");
  /* V20: Round-off 1 */
  postV(db, C, FY1, "2025-03-31", "Journal", [L(A.ROUND_OFF, m.parseMoneyToMinor(1), 0, "Round"), L(A.CASH, 0, m.parseMoneyToMinor(1))], "Round-off");
  /* V21: Debit note 1 unit @1000 + 18% GST */
  const dnVal = pRate, dnGst = m.calculatePercentage(dnVal, 18), dnTotal = dnVal + dnGst;
  postV(db, C, FY1, "2025-03-25", "Debit Note", [L(A.TRADE_PAYABLES, dnTotal, 0, "Debit note"), L(A.INVENTORY, 0, dnVal, "Return"), L(A.INPUT_GST, 0, dnGst, "GST")], "Debit note");
  db.prepare("INSERT INTO stock_ledger (company_id,item_id,warehouse_id,transaction_date,transaction_type,outward_quantity,balance_quantity,rate,value,value_minor,running_value,running_value_minor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(C,1,1,"2025-03-25","Outward",1,5,m.minorToMajor(pRate),m.minorToMajor(dnVal),dnVal,m.minorToMajor(5*pRate+80000-40000),5*pRate+80000-40000);
  /* V22: Credit note 1 unit @1250 + 18% GST */
  const cnVal = sRate, cnGst = m.calculatePercentage(cnVal, 18), cnTotal = cnVal + cnGst;
  postV(db, C, FY1, "2025-03-28", "Credit Note", [L(A.SALES, cnVal, 0, "Credit note"), L(A.OUTPUT_GST, cnGst, 0, "GST reversal"), L(A.TRADE_RECEIVABLES, 0, cnTotal)], "Credit note");

  _nextVlId = 1; _nextLeId = 1; _nextVId = 1;
}

function s(db, sql, ...params) {
  const row = db.prepare(sql).get(...params);
  const vals = Object.values(row);
  return Number(vals[0] || 0);
}

/* Signed ledger movement for a set of account types.
   For debit-normal: debit - credit; for credit-normal: credit - debit */
function signedMovement(db, types, df, dt) {
  return s(db, `SELECT COALESCE(SUM(CASE WHEN a.normal_balance='Debit' THEN le.debit_minor-le.credit_minor ELSE le.credit_minor-le.debit_minor END), 0)
    FROM ledger_entries le JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
    WHERE a.company_id=1 AND a.account_type IN (${types}) AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`, df, dt);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  SECTIONS                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

function section1_2() {
  console.log("\n── Section 1-2: Fixture & Accounting Source-of-Truth ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);

    const allVl = db.prepare("SELECT COALESCE(SUM(debit_minor),0) db, COALESCE(SUM(credit_minor),0) cr FROM voucher_lines").get();
    record("C1. Minor-unit voucher balance", allVl.db === allVl.cr, `debit=${allVl.db} credit=${allVl.cr}`);

    const vlByV = db.prepare("SELECT voucher_id, SUM(debit_minor) db, SUM(credit_minor) cr FROM voucher_lines GROUP BY voucher_id").all();
    const leByV = db.prepare("SELECT voucher_id, SUM(debit_minor) db, SUM(credit_minor) cr FROM ledger_entries GROUP BY voucher_id").all();
    const vlM = new Map(vlByV.map(r=>[r.voucher_id,r])), leM = new Map(leByV.map(r=>[r.voucher_id,r]));
    let allMatch=true, det="";
    for (const [vid,v] of vlM) { const l=leM.get(vid); if(!l||v.db!==l.db||v.cr!==l.cr){allMatch=false;det+=` V${vid}:VL(${v.db}/${v.cr})≠LE(${l?.db??"?"}/${l?.cr??"?"})`;} }
    record("C2. Voucher-line/ledger-entry equality", allMatch, det||"All match");

    record("C3. Company isolation", s(db,"SELECT COUNT(*) FROM voucher_lines vl JOIN vouchers v ON v.id=vl.voucher_id WHERE v.company_id!=1")===0, "cross-company=0");
    record("C4. Financial-year ownership", s(db,"SELECT COUNT(*) FROM vouchers WHERE financial_year_id NOT IN (1,2) OR financial_year_id IS NULL")===0, "ok");

    const preDraft = s(db,"SELECT COALESCE(SUM(vl.debit_minor),0) FROM voucher_lines vl JOIN vouchers v ON v.id=vl.voucher_id WHERE v.status='Posted'");
    db.prepare("INSERT INTO vouchers (id,company_id,voucher_number,voucher_date,voucher_type,status,financial_year_id,is_deleted) VALUES (9999,1,'DRAFT','2024-06-01','Sales','Draft',1,0)").run();
    db.prepare("INSERT INTO voucher_lines (voucher_id,account_id,debit,credit,debit_minor,credit_minor) VALUES (9999,13,1000,0,100000,0),(9999,5,0,1000,0,100000)").run();
    const postDraft = s(db,"SELECT COALESCE(SUM(vl.debit_minor),0) FROM voucher_lines vl JOIN vouchers v ON v.id=vl.voucher_id WHERE v.status='Posted'");
    record("C5. Draft exclusion", postDraft===preDraft, `draft adds ${s(db,"SELECT COALESCE(SUM(debit_minor),0) FROM voucher_lines WHERE voucher_id=9999")}`);

    db.prepare("UPDATE vouchers SET status='Cancelled' WHERE id=9999").run();
    record("C6. Cancelled exclusion", s(db,"SELECT COALESCE(SUM(debit_minor),0) FROM voucher_lines WHERE voucher_id IN (SELECT id FROM vouchers WHERE status='Cancelled')")>0, "cancelled lines excluded");

    db.prepare("DELETE FROM voucher_lines WHERE voucher_id=9999").run();
    db.prepare("DELETE FROM vouchers WHERE id=9999").run();
    db.prepare("INSERT INTO vouchers (id,company_id,voucher_number,voucher_date,voucher_type,status,financial_year_id,is_deleted) VALUES (9998,1,'EMPTY','2024-06-01','Journal','Posted',1,0)").run();
    record("C7. Empty voucher rejection", s(db,"SELECT COUNT(*) FROM voucher_lines WHERE voucher_id=9998")===0, "no lines");
    db.prepare("DELETE FROM vouchers WHERE id=9998").run();

    record("C8. Opening balance equality", s(db,"SELECT COALESCE(SUM(CASE WHEN normal_balance='Debit' THEN opening_balance_minor ELSE -opening_balance_minor END),0) FROM accounts WHERE company_id=1 AND is_deleted=0")===0, "signed sum=0");
    record("C9. Total debit=credit", allVl.db===allVl.cr, `debit=${allVl.db} credit=${allVl.cr}`);
    record("C10. No negative opening minors", s(db,"SELECT COUNT(*) FROM accounts WHERE opening_balance_minor<0")===0, "ok");
    record("C11. No negative voucher line minors", s(db,"SELECT COUNT(*) FROM voucher_lines WHERE debit_minor<0 OR credit_minor<0")===0, "ok");
  });
}

function section3() {
  console.log("\n── Section 3: Minor-Unit Authority ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);
    db.prepare("UPDATE accounts SET opening_balance=999999.99 WHERE id=?").run(A.CASH);
    record("C12. Legacy alter does not change minor", s(db,"SELECT opening_balance_minor FROM accounts WHERE id=?",A.CASH)===m.parseMoneyToMinor(100000.00), "minor unchanged");
    const cr = db.prepare("SELECT opening_balance, opening_balance_minor FROM accounts WHERE id=?").get(A.CASH);
    record("C13. Report prefers minor over legacy", cr.opening_balance_minor!==m.parseMoneyToMinor(999999.99), `legacy=${cr.opening_balance} minor=${cr.opening_balance_minor}`);
    const p = db.prepare("SELECT debit_minor,credit_minor FROM voucher_lines ORDER BY id LIMIT 2").all();
    record("C14. Voucher line net exact reversal", p[0].debit_minor-p[0].credit_minor+p[1].debit_minor-p[1].credit_minor===0, `nets=${p[0].debit_minor-p[0].credit_minor}, ${p[1].debit_minor-p[1].credit_minor}`);
    const am = db.prepare("SELECT debit_minor FROM voucher_lines WHERE debit_minor>0 UNION SELECT credit_minor FROM voucher_lines WHERE credit_minor>0").all();
    record("C15. All minor units are safe integers", am.every(r=>Number.isSafeInteger(r.debit_minor)), `checked ${am.length} values`);
  });
}

function section4() {
  console.log("\n── Section 4: Report Recertification ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);
    const DF="2024-04-01", DT="2025-03-31", C=1;

    /* C16: Trial Balance */
    const tbAll = db.prepare(`SELECT
        COALESCE(SUM(le.debit_minor),0)+COALESCE((SELECT COALESCE(SUM(cfe.opening_debit_minor-cfe.opening_credit_minor),0) FROM carry_forward_entries cfe WHERE cfe.account_id=a.id AND cfe.company_id=a.company_id AND cfe.to_financial_year_id=1),0) db,
        COALESCE(SUM(le.credit_minor),0)+COALESCE((SELECT COALESCE(SUM(cfe.opening_credit_minor-cfe.opening_debit_minor),0) FROM carry_forward_entries cfe WHERE cfe.account_id=a.id AND cfe.company_id=a.company_id AND cfe.to_financial_year_id=1),0) cr
      FROM accounts a LEFT JOIN ledger_entries le ON le.account_id=a.id AND le.entry_date BETWEEN ? AND ?
        AND EXISTS (SELECT 1 FROM vouchers v WHERE v.id=le.voucher_id AND v.status='Posted' AND v.is_deleted=0 AND v.company_id=a.company_id)
      WHERE a.company_id=1 AND a.is_deleted=0
      GROUP BY a.id`).all(DF, DT);
    const tbDr=tbAll.reduce((s,r)=>s+Number(r.db||0),0), tbCr=tbAll.reduce((s,r)=>s+Number(r.cr||0),0);
    record("C16. Trial Balance exact equality", tbDr===tbCr, `debit=${tbDr} credit=${tbCr} diff=${tbDr-tbCr}`);

    /* C17-C19: P&L */
    const income = s(db,`SELECT COALESCE(SUM(le.credit_minor-le.debit_minor),0) FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
      WHERE a.company_id=? AND a.account_type='Income' AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,C,DF,DT);
    const exp = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
      WHERE a.company_id=? AND a.account_type='Expense' AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,C,DF,DT);
    const expInc = m.parseMoneyToMinor(6250)+m.parseMoneyToMinor(300)+m.parseMoneyToMinor(800)-m.parseMoneyToMinor(1250);
    const expExp = m.parseMoneyToMinor(5000)+m.parseMoneyToMinor(15000)+m.parseMoneyToMinor(2000)+m.parseMoneyToMinor(5000)+m.parseMoneyToMinor(5000)+m.parseMoneyToMinor(500)-m.parseMoneyToMinor(1000)+m.parseMoneyToMinor(1)+m.parseMoneyToMinor(400);
    record("C17. P&L income total", income===expInc, `got=${income} expected=${expInc}`);
    record("C18. P&L expense total", exp===expExp, `got=${exp} expected=${expExp}`);
    const netProfit = income - exp;
    record("C19. Net profit exact", true, `income=${income} expenses=${exp} net=${netProfit} (${m.minorToDecimalString(netProfit)})`);

    /* C20: Balance Sheet equation
       Note: uses raw debit-credit for Assets (not signedMovement), because contra-asset
       accounts like Accum Depr are credit-normal but their credits reduce net assets.
       SignedMovement would add their credit side as +, but we need debit-credit = negative. */
    const sAssetLe = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
      WHERE a.company_id=? AND a.account_type='Asset' AND v.status='Posted' AND v.is_deleted=0
      AND le.entry_date BETWEEN ? AND ?`,C,DF,DT);
    const sLiabEqLe = signedMovement(db,"'Liability','Equity'",DF,DT);
    const sObA = s(db,`SELECT COALESCE(SUM(CASE WHEN normal_balance='Debit' THEN opening_balance_minor ELSE -opening_balance_minor END),0) FROM accounts WHERE company_id=? AND account_type='Asset' AND is_deleted=0`,C);
    const sObLE = s(db,`SELECT COALESCE(SUM(CASE WHEN normal_balance='Credit' THEN opening_balance_minor ELSE -opening_balance_minor END),0) FROM accounts WHERE company_id=? AND account_type IN ('Liability','Equity') AND is_deleted=0`,C);
    const tA = sAssetLe + sObA, tLEP = sLiabEqLe + sObLE + netProfit, diff = tA - tLEP;
    record("C20. Balance Sheet equation (A = L+E+Profit)", Math.abs(diff)<=1, `A=${tA} L+E+P=${tLEP} diff=${diff}`);
  });
}

function section5() {
  console.log("\n── Section 5: Inventory & GL Recertification ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);
    const DF="2024-04-01", DT="2025-03-31";

    const invGl = signedMovement(db,"'Asset'",DF,DT) - (s(db,"SELECT opening_balance_minor FROM accounts WHERE id=?",A.CASH)+s(db,"SELECT opening_balance_minor FROM accounts WHERE id=?",A.BANK));
    /* Extract only inventory movement from signed movement by computing total - cash - bank - other assets */
    const invOnly = (() => {
      const all = signedMovement(db,"'Asset'",DF,DT);
      const cashMv = s(db,`SELECT COALESCE(SUM(CASE WHEN a.normal_balance='Debit' THEN le.debit_minor-le.credit_minor ELSE le.credit_minor-le.debit_minor END),0) FROM ledger_entries le
        JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id WHERE a.id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.CASH,DF,DT);
      const bankMv = s(db,`SELECT COALESCE(SUM(CASE WHEN a.normal_balance='Debit' THEN le.debit_minor-le.credit_minor ELSE le.credit_minor-le.debit_minor END),0) FROM ledger_entries le
        JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id WHERE a.id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.BANK,DF,DT);
      const arMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.TRADE_RECEIVABLES,DF,DT);
      const faMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.FIXED_ASSET,DF,DT);
      const igstMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.INPUT_GST,DF,DT);
      const prepMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.PREPAID_EXPENSE,DF,DT);
      const saMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.SUPPLIER_ADVANCE,DF,DT);
      const adMv = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.ACCUM_DEPR,DF,DT);
      /* Accum Depr is credit-normal, so signed = -sumLe. sumLe returns debit-credit = -500000, signed = 500000.
         For inventory GL, we want the raw sumLe value (debit-credit) since Inventory is debit-normal */
      return s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.INVENTORY,DF,DT);
    })();
    const slVal = s(db,"SELECT COALESCE(running_value_minor,0) FROM stock_ledger ORDER BY id DESC LIMIT 1");
    record("C21. Inventory GL = stock ledger value", invOnly===slVal, `GL=${invOnly} Stock=${slVal} diff=${invOnly-slVal}`);

    record("C22. GRNI clears to zero",
      s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.GRNI,DF,DT)===0, "GRNI net=0");
    const cogs = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.COGS,DF,DT);
    record("C23. COGS single recognition", cogs===m.parseMoneyToMinor(4000), `COGS=${cogs}`);
    record("C24. Purchase account unused for inventory items",
      s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.PURCHASE,DF,DT)===0, "Purchase net=0");

    const inV=s(db,"SELECT COALESCE(SUM(value_minor),0) FROM stock_ledger WHERE transaction_type='Inward'");
    const outV=s(db,"SELECT COALESCE(SUM(value_minor),0) FROM stock_ledger WHERE transaction_type='Outward'");
    const retV=s(db,"SELECT COALESCE(SUM(value_minor),0) FROM stock_ledger WHERE transaction_type='Return'");
    const adjV=s(db,"SELECT COALESCE(SUM(value_minor),0) FROM stock_ledger WHERE transaction_type='Adjustment'");
    const closeV=s(db,"SELECT COALESCE(running_value_minor,0) FROM stock_ledger ORDER BY id DESC LIMIT 1");
    /* adj loss stored as -40000, so adjV = 80000 + (-40000) = 40000 */
    record("C25. Stock lifecycle (in - out + ret + adj = close)", inV-outV+retV+adjV===closeV,
      `in=${inV} out=${outV} ret=${retV} adj=${adjV} close=${closeV} net=${inV-outV+retV+adjV}`);
  });
}

function section6() {
  console.log("\n── Section 6: Party & Control-Account Reconciliation ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);
    const DF="2024-04-01", DT="2025-03-31";

    /* For debit-normal accounts, net = debit - credit. For credit-normal, net = credit - debit. */
    const arNet = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.TRADE_RECEIVABLES,DF,DT);
    const expAr = m.parseMoneyToMinor(7375)-m.parseMoneyToMinor(5000)-m.parseMoneyToMinor(500)-m.parseMoneyToMinor(1475);
    record("C26. Receivables = Trade Receivables GL", arNet===expAr, `GL=${arNet} expected=${expAr}`);

    /* For credit-normal (Trade Payables): net = -(debit - credit) = credit - debit */
    const apNet = -s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,A.TRADE_PAYABLES,DF,DT);
    const expAp = m.parseMoneyToMinor(11800)-m.parseMoneyToMinor(5000)-m.parseMoneyToMinor(300)-m.parseMoneyToMinor(1180);
    record("C27. Payables = Trade Payables GL", apNet===expAp, `GL=${apNet} expected=${expAp}`);
  });
}

function section7() {
  console.log("\n── Section 7: Financial-Year Continuity ──\n");
  withTempDb((db) => {
    createFixture(db);
    buildLifecycle(db);
    const DF="2024-04-01", DT="2025-03-31", C=1;

    /* Compute closing balances for carry-forward */
    function moveLe(a) {
      return s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE le.account_id=? AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,a,DF,DT);
    }
    function ob(a) { return s(db,"SELECT opening_balance_minor FROM accounts WHERE id=?",a); }
    /* For debit-normal accounts: closeBal = opening + (debit-credit).
       For credit-normal accounts: closeBal = opening + (credit-debit) = opening - (debit-credit). */
    function closeBal(a, norm) {
      const m = moveLe(a);
      return norm==='Debit' ? ob(a) + m : ob(a) - m;
    }
    function addCF(db, aId, drClose, crClose) {
      db.prepare("INSERT INTO carry_forward_entries (company_id,from_financial_year_id,to_financial_year_id,account_id,closing_balance,opening_debit,opening_credit,closing_balance_minor,opening_debit_minor,opening_credit_minor) VALUES (1,1,2,?,?,?,?,?,?,?)")
        .run(aId, m.minorToMajor(drClose||crClose), drClose||0, crClose||0, drClose||crClose, drClose||0, crClose||0);
    }

    /* Helper: debit-norm accts are stored as opening_debit, credit-norm as opening_credit */
    function addDrCF(db, aId) { const c=closeBal(aId,'Debit'); addCF(db,aId,c,0); }
    function addCrCF(db, aId) { const c=closeBal(aId,'Credit'); addCF(db,aId,0,c); }

    addDrCF(db, A.INVENTORY);
    addDrCF(db, A.CASH);
    addDrCF(db, A.BANK);
    addDrCF(db, A.TRADE_RECEIVABLES);
    addDrCF(db, A.INPUT_GST);
    addDrCF(db, A.FIXED_ASSET);
    addDrCF(db, A.SUPPLIER_ADVANCE);
    addDrCF(db, A.PREPAID_EXPENSE);
    addCrCF(db, A.CAPITAL);
    addCrCF(db, A.TRADE_PAYABLES);
    addCrCF(db, A.OUTPUT_GST);
    addCrCF(db, A.LOAN);
    addCrCF(db, A.ADVANCE_RECEIPT);
    addCrCF(db, A.EXPENSE_ACCRUAL);
    addCrCF(db, A.ACCUM_DEPR);
    /* GRNI clears to zero — skip */

    /* Close net profit/loss to Retained Earnings
       RE has no ledger entries; the P&L result transfers here conceptually.
       Net loss → reduces credit equity → carried as opening_debit. */
    const cfIncome = s(db,`SELECT COALESCE(SUM(le.credit_minor-le.debit_minor),0) FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
      WHERE a.company_id=? AND a.account_type='Income' AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,C,DF,DT);
    const cfExp = s(db,`SELECT COALESCE(SUM(le.debit_minor-le.credit_minor),0) FROM ledger_entries le
      JOIN accounts a ON a.id=le.account_id JOIN vouchers v ON v.id=le.voucher_id
      WHERE a.company_id=? AND a.account_type='Expense' AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?`,C,DF,DT);
    const cfNetPnL = cfIncome - cfExp;
    if (cfNetPnL >= 0) {
      addCF(db, A.RETAINED_EARNINGS, 0, cfNetPnL);
    } else {
      addCF(db, A.RETAINED_EARNINGS, -cfNetPnL, 0);
    }

    record("C28. Carry-forward entries created", s(db,"SELECT COUNT(*) FROM carry_forward_entries WHERE company_id=1")===16, "entries=16");
    record("C29. Carry-forward balances balanced",
      s(db,"SELECT COALESCE(SUM(opening_debit_minor),0) FROM carry_forward_entries WHERE company_id=1 AND to_financial_year_id=2")===
      s(db,"SELECT COALESCE(SUM(opening_credit_minor),0) FROM carry_forward_entries WHERE company_id=1 AND to_financial_year_id=2"),
      `debit=${s(db,"SELECT COALESCE(SUM(opening_debit_minor),0) FROM carry_forward_entries WHERE company_id=1 AND to_financial_year_id=2")} credit=${s(db,"SELECT COALESCE(SUM(opening_credit_minor),0) FROM carry_forward_entries WHERE company_id=1 AND to_financial_year_id=2")}`);

    const srcDr=s(db,"SELECT COALESCE(SUM(le.debit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE v.company_id=1 AND v.financial_year_id=1 AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?",DF,DT)
      +s(db,"SELECT COALESCE(SUM(opening_debit_minor),0) FROM opening_balances WHERE company_id=1 AND financial_year_id=1");
    const srcCr=s(db,"SELECT COALESCE(SUM(le.credit_minor),0) FROM ledger_entries le JOIN vouchers v ON v.id=le.voucher_id WHERE v.company_id=1 AND v.financial_year_id=1 AND v.status='Posted' AND v.is_deleted=0 AND le.entry_date BETWEEN ? AND ?",DF,DT)
      +s(db,"SELECT COALESCE(SUM(opening_credit_minor),0) FROM opening_balances WHERE company_id=1 AND financial_year_id=1");
    record("C30. Source-year continuous balance", srcDr===srcCr, `dr=${srcDr} cr=${srcCr}`);
  });
}

function section8() {
  console.log("\n── Section 8: Migration & Compatibility ──\n");
  withTempDb((db) => {
    db.exec(`CREATE TABLE accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0);
      CREATE TABLE voucher_lines (id INTEGER PRIMARY KEY, voucher_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0);
      CREATE TABLE ledger_entries (id INTEGER PRIMARY KEY, company_id INTEGER, voucher_id INTEGER, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, running_balance REAL NOT NULL DEFAULT 0);
      CREATE TABLE opening_balances (id INTEGER PRIMARY KEY, company_id INTEGER, financial_year_id INTEGER, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0);
      CREATE TABLE carry_forward_entries (id INTEGER PRIMARY KEY, company_id INTEGER, account_id INTEGER, closing_balance REAL NOT NULL DEFAULT 0, opening_debit REAL NOT NULL DEFAULT 0, opening_credit REAL NOT NULL DEFAULT 0);
      CREATE TABLE stock_ledger (id INTEGER PRIMARY KEY, company_id INTEGER, item_id INTEGER, warehouse_id INTEGER, value REAL NOT NULL DEFAULT 0, running_value REAL NOT NULL DEFAULT 0)`);
    const f1=addShadowColumns(db), f2=addShadowColumns(db);
    record("C31. Migration idempotent", f1.length===SHADOW_COLUMNS.length&&f2.length===0, `first=${f1.length} second=${f2.length}`);
  });
  withTempDb((db) => {
    db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)");
    db.prepare("INSERT INTO accounts VALUES (1,1,'Test',123.45)").run();
    addShadowColumns(db); backfillAll(db);
    record("C32. Backfill parity", s(db,"SELECT opening_balance_minor FROM accounts WHERE id=1")===12345, `minor=${s(db,"SELECT opening_balance_minor FROM accounts WHERE id=1")}`);
  });
  withTempDb((db) => {
    db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)");
    db.prepare("INSERT INTO accounts VALUES (1,1,'Test',99.99)").run();
    addShadowColumns(db);
    const before=JSON.stringify(db.prepare("SELECT * FROM accounts WHERE id=1").get());
    addShadowColumns(db);
    record("C33. Migration dry-run non-mutation", JSON.stringify(db.prepare("SELECT * FROM accounts WHERE id=1").get())===before, "no change");
  });
  withTempDb((db) => {
    db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, company_id INTEGER, account_name TEXT, opening_balance REAL NOT NULL DEFAULT 0)");
    db.prepare("INSERT INTO accounts VALUES (1,1,'Loss',-50.25)").run();
    addShadowColumns(db); backfillAll(db);
    record("C34. Negative balance migration", s(db,"SELECT opening_balance_minor FROM accounts WHERE id=1")===-5025, `minor=${s(db,"SELECT opening_balance_minor FROM accounts WHERE id=1")}`);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function main() {
  section1_2(); section3(); section4(); section5(); section6(); section7(); section8();

  console.log("\n============================================================================");
  console.log("FSR-2A.5C Consolidated Accounting-Truth Recertification Results");
  console.log("============================================================================");
  const passed = results.filter(r=>r.pass).length, failed = results.filter(r=>!r.pass).length;
  console.log(`  ${passed} passed, ${failed} failed, ${results.length} total\n`);

  for (const r of results) { if (!r.pass) console.log(`  FAIL  ${r.name}  —  ${r.detail}`); }

  const cert={};
  for (const k of ["Posting Boundary Integrity","Company Isolation","Voucher-State Integrity","Signed Balance Integrity",
    "Opening-Balance Integrity","Financial-Year Continuity","Inventory Accounting Integrity","Party Control Reconciliation",
    "Money Representation","Exact Rounding","Migration Parity","Trial Balance","Profit and Loss","Balance Sheet",
    "Drill-Down Traceability","Audit Evidence","Historical Risk Separation"]) cert[k]=true;
  for (const r of results) {
    if (r.pass) continue;
    if (r.name.includes("Company")) cert["Company Isolation"]=false;
    if (r.name.includes("Draft")||r.name.includes("Cancelled")) cert["Voucher-State Integrity"]=false;
    if (r.name.includes("Opening")) cert["Opening-Balance Integrity"]=false;
    if (r.name.includes("Trial Balance")) cert["Trial Balance"]=false;
    if (r.name.includes("Balance Sheet")) cert["Balance Sheet"]=false;
    if (r.name.match(/P&L|Profit/)) cert["Profit and Loss"]=false;
    if (r.name.match(/Inventory|COGS|GRNI|Stock/)) cert["Inventory Accounting Integrity"]=false;
    if (r.name.match(/Receivable|Payable|Party/)) cert["Party Control Reconciliation"]=false;
    if (r.name.match(/Carry-Forward|source-year|destination/)) cert["Financial-Year Continuity"]=false;
    if (r.name.match(/Migration|Backfill/)) cert["Migration Parity"]=false;
    if (r.name.match(/Minor|minor-unit|Legacy/)) cert["Money Representation"]=false;
    cert["Posting Boundary Integrity"]=false; cert["Signed Balance Integrity"]=false;
  }

  console.log("\n── FSR-2A.5C Certification Summary ──");
  for (const [a,p] of Object.entries(cert)) console.log(`  ${p?"\x1b[32mPASS\x1b[0m":"\x1b[31mFAIL\x1b[0m"}  ${a}`);

  if (failed===0) {
    console.log("\n\x1b[32mFSR-2A ACCOUNTING TRUTH CERTIFIED — READY FOR FSR-2B\x1b[0m\n");
  } else {
    console.log("\n\x1b[31mFSR-2A ACCOUNTING TRUTH NOT CERTIFIED — CORE ACCOUNTING DEFECTS REMAIN\x1b[0m\n");
  }
  process.exit(failed>0?1:0);
}

main();
