import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  accountingData,
  createRecord,
  dashboardCounts,
  DB_NAME,
  initializeDatabase,
  inventoryData,
  listDocuments,
  listRecords,
  referenceData
} from "../src/main/database/init.js";

process.on("uncaughtException", (error) => {
  console.error(error.message || error);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  console.error(error?.message || error);
  process.exit(1);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch (error) {
    if (message && !String(error.message || error).includes(message)) {
      throw new Error(`Expected error containing "${message}", got "${error.message || error}"`);
    }
    return true;
  }
  throw new Error("Expected operation to throw, but it completed successfully");
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function safeResetTempRoot(appRoot, tempRoot) {
  const resolvedAppRoot = path.resolve(appRoot);
  const resolvedTempRoot = path.resolve(tempRoot);
  assert(
    resolvedTempRoot.startsWith(`${resolvedAppRoot}${path.sep}`) &&
      path.basename(resolvedTempRoot) === "phase-h7-company-context-isolation-db",
    `Refusing to remove unexpected path: ${resolvedTempRoot}`
  );
  fs.rmSync(resolvedTempRoot, { recursive: true, force: true });
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const sourceDbPath = path.join(appRoot, "database", DB_NAME);
const tempRoot = path.join(appRoot, "phase-h7-company-context-isolation-db");
const tempDbDir = path.join(tempRoot, "database");
const tempDbPath = path.join(tempDbDir, DB_NAME);

assert(fs.existsSync(sourceDbPath), `Source database not found: ${sourceDbPath}`);
safeResetTempRoot(appRoot, tempRoot);
fs.mkdirSync(tempDbDir, { recursive: true });
fs.copyFileSync(sourceDbPath, tempDbPath);

const db = initializeDatabase(tempRoot);

try {
  const companyA = db.prepare("SELECT * FROM companies WHERE status = 'active' ORDER BY id LIMIT 1").get();
  assert(companyA?.id, "No active source company found for isolation test");

  const uniqueSuffix = Date.now();
  const companyB = createRecord(db, "companies", {
    company_name: `H7 Isolation Test Company ${uniqueSuffix}`,
    gstin: "",
    pan: "",
    address: "Temporary company context isolation certification only",
    bank_name: "",
    account_number: "",
    ifsc: "",
    status: "active"
  });

  assert(companyB?.id && companyB.id !== companyA.id, "Unable to create second company for isolation test");

  const dashboardBeforeBank = dashboardCounts(db, { company_id: companyA.id });

  assertThrows(
    () => createRecord(db, "warehouses", {
      warehouse_name: `H7 Missing Company Warehouse ${uniqueSuffix}`,
      location: "Temporary",
      status: "active"
    }),
    "Company context is required"
  );

  assertThrows(
    () => createRecord(db, "banks", {
      bank_account_name: `H7 Missing Company Bank ${uniqueSuffix}`,
      bank_name: "Temporary Bank",
      account_number: "0001",
      ifsc: "",
      status: "active"
    }),
    "Company context is required"
  );

  const warehouseB = createRecord(db, "warehouses", {
    company_id: companyB.id,
    warehouse_name: `H7 Isolation Warehouse ${uniqueSuffix}`,
    location: "Temporary",
    warehouse_type: "Main",
    responsible_person: "H7 verifier",
    status: "active"
  });

  const bankB = createRecord(db, "banks", {
    company_id: companyB.id,
    bank_account_name: `H7 Isolation Bank ${uniqueSuffix}`,
    bank_name: "Temporary Bank",
    account_number: `H7${uniqueSuffix}`,
    ifsc: "",
    opening_balance: 0,
    status: "active"
  });

  db.prepare(`
    INSERT INTO documents (
      company_id, linked_module, linked_record_id, document_type, original_file_name,
      stored_file_name, file_path, file_extension, file_size, file_hash, remarks, status
    ) VALUES (?, 'H7', ?, 'Isolation Test', 'h7-test.pdf', 'h7-test.pdf', 'documents/h7-test.pdf', '.pdf', 1, ?, 'Temporary H7 verifier row', 'active')
  `).run(companyB.id, warehouseB.id, `h7-${uniqueSuffix}`);

  const companyAWarehouses = listRecords(db, "warehouses", { company_id: companyA.id, status: "all" });
  const companyBWarehouses = listRecords(db, "warehouses", { company_id: companyB.id, status: "all" });
  assert(!companyAWarehouses.some((row) => row.id === warehouseB.id), "Company B warehouse leaked into Company A warehouse list");
  assert(companyBWarehouses.some((row) => row.id === warehouseB.id), "Company B warehouse did not appear in Company B warehouse list");

  const companyABanks = listRecords(db, "banks", { company_id: companyA.id, status: "all" });
  const companyBBanks = listRecords(db, "banks", { company_id: companyB.id, status: "all" });
  assert(!companyABanks.some((row) => row.id === bankB.id), "Company B bank leaked into Company A bank list");
  assert(companyBBanks.some((row) => row.id === bankB.id), "Company B bank did not appear in Company B bank list");

  const dashboardAfterBank = dashboardCounts(db, { company_id: companyA.id });
  const dashboardB = dashboardCounts(db, { company_id: companyB.id });
  assert(
    dashboardAfterBank.banks === dashboardBeforeBank.banks,
    "Company A dashboard bank count changed after creating a Company B bank"
  );
  assert(dashboardB.totalOrders === 0, "Company B dashboard shows orders from another company");
  assert(round(dashboardB.totalOrderValue) === 0, "Company B dashboard shows billing value from another company");
  assert(round(dashboardB.amountReceived) === 0, "Company B dashboard shows receipts from another company");

  const refsB = referenceData(db, { company_id: companyB.id });
  assert(refsB.orders.length === 0, "Company B references show orders from another company");
  assert(refsB.warehouses.some((row) => row.id === warehouseB.id), "Company B references do not include Company B warehouse");
  assert(refsB.banks.some((row) => row.id === bankB.id), "Company B references do not include Company B bank");

  const accountingB = accountingData(db, { company_id: companyB.id });
  assert(accountingB.vouchers.length === 0, "Company B accounting data shows vouchers from another company");
  assert(accountingB.ledger.length === 0, "Company B accounting data shows ledger entries from another company");
  assert(accountingB.cashBank.length === 0, "Company B accounting data shows cash/bank entries from another company");

  const inventoryB = inventoryData(db, { company_id: companyB.id });
  const stockValueB = inventoryB.stockSummary.reduce((sum, row) => sum + Number(row.closing_value || 0), 0);
  assert(round(stockValueB) === 0, "Company B inventory stock summary shows value from another company");
  assert(inventoryB.stockLedger.length === 0, "Company B inventory ledger shows movements from another company");

  const documentsA = listDocuments(db, { company_id: companyA.id });
  const documentsB = listDocuments(db, { company_id: companyB.id });
  assert(!documentsA.some((row) => row.file_hash === `h7-${uniqueSuffix}`), "Company B document leaked into Company A documents");
  assert(documentsB.some((row) => row.file_hash === `h7-${uniqueSuffix}`), "Company B document did not appear in Company B documents");

  const result = {
    sourceCompany: { id: companyA.id, name: companyA.company_name },
    isolatedCompany: { id: companyB.id, name: companyB.company_name },
    missingCompanyGuards: {
      warehouses: "passed",
      banks: "passed"
    },
    companyA: {
      warehouses: companyAWarehouses.length,
      banksBefore: dashboardBeforeBank.banks,
      banksAfterCompanyBBank: dashboardAfterBank.banks,
      documents: documentsA.length
    },
    companyB: {
      warehouses: companyBWarehouses.length,
      banks: companyBBanks.length,
      orders: dashboardB.totalOrders,
      orderValue: dashboardB.totalOrderValue,
      amountReceived: dashboardB.amountReceived,
      vouchers: accountingB.vouchers.length,
      ledgerEntries: accountingB.ledger.length,
      stockLedgerRows: inventoryB.stockLedger.length,
      stockValue: round(stockValueB),
      documents: documentsB.length
    },
    status: "passed"
  };

  console.log(JSON.stringify(result, null, 2));
} finally {
  db.close();
  safeResetTempRoot(appRoot, tempRoot);
}

process.exit(0);
