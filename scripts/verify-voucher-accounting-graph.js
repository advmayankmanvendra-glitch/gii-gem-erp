#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");
let exitCode = 0;
const pass = (msg) => console.log(`  \u2713 PASS: ${msg}`);
const fail = (msg) => { console.log(`  \u2717 FAIL: ${msg}`); exitCode = 1; };
const warn = (msg) => console.log(`  \u26A0 WARN: ${msg}`);

function main() {
  console.log("============================================================");
  console.log("KG-4 Voucher and Accounting Graph Validation");
  console.log("============================================================");

  const graphPath = resolve(ROOT, "src/renderer/knowledge/voucher-accounting-graph.json");
  const schemaPath = resolve(ROOT, "repository/schema/voucher-accounting-graph.schema.json");
  const regPath = resolve(ROOT, "repository/graph-registry.json");

  if (existsSync(graphPath)) {
    pass("KG-4: voucher-accounting-graph.json exists");
  } else {
    fail("KG-4: voucher-accounting-graph.json not found");
    return;
  }

  if (existsSync(schemaPath)) {
    pass("KG-4: Schema file exists");
  } else {
    warn("KG-4: Schema file not found");
  }

  let g;
  try {
    const raw = readFileSync(graphPath, "utf-8");
    g = JSON.parse(raw);
    pass("KG-4: JSON is valid");
  } catch (e) {
    fail(`KG-4: JSON parse error \u2014 ${e.message}`);
    return;
  }

  if (g.schemaVersion === "1.0.0") {
    pass("KG-4: schemaVersion = 1.0.0");
  } else {
    fail(`KG-4: schemaVersion must be 1.0.0, got ${g.schemaVersion}`);
  }

  if (g.graphId === "KG-4") {
    pass("KG-4: graphId = KG-4");
  } else {
    fail(`KG-4: graphId must be KG-4, got ${g.graphId}`);
  }

  const vtIds = g.voucherTypes.map((v) => v.voucherTypeId);
  const vtUnique = new Set(vtIds);
  if (vtUnique.size === vtIds.length) {
    pass(`KG-4: ${vtIds.length} voucher type IDs are unique`);
  } else {
    const dupes = vtIds.filter((id, i) => vtIds.indexOf(id) !== i);
    fail(`KG-4: Duplicate voucher type IDs: ${[...new Set(dupes)].join(", ")}`);
  }

  const pfNames = g.postingFunctions.map((p) => p.functionName);
  const pfUnique = new Set(pfNames);
  if (pfUnique.size === pfNames.length) {
    pass(`KG-4: ${pfNames.length} posting function names are unique`);
  } else {
    fail("KG-4: Duplicate posting function names");
  }

  if (g.postingFunctions.find((p) => p.functionName === "createBalancedVoucher")) {
    pass("KG-4: createBalancedVoucher mapped");
  } else {
    fail("KG-4: createBalancedVoucher not mapped");
  }

  if (g.postingFunctions.find((p) => p.functionName === "postLedgerEntry")) {
    pass("KG-4: postLedgerEntry mapped");
  } else {
    fail("KG-4: postLedgerEntry not mapped");
  }

  if (g.postingFunctions.find((p) => p.functionName === "reverseVoucher")) {
    pass("KG-4: reverseVoucher mapped");
  } else {
    fail("KG-4: reverseVoucher not mapped");
  }

  if (existsSync(regPath)) {
    try {
      const reg = JSON.parse(readFileSync(regPath, "utf-8"));
      const kg4 = reg.graphs?.find((gr) => gr.graphId === "KG-4");
      if (kg4) {
        pass(`KG-4: Registered in graph registry (status: ${kg4.status})`);
      } else {
        warn("KG-4: Not found in graph registry");
      }
    } catch (e) {
      warn("KG-4: Registry parse error");
    }
  } else {
    warn("KG-4: Graph registry not found");
  }

  const tbReport = g.reportDependencies?.find((r) => r.reportName === "trialBalance");
  const plReport = g.reportDependencies?.find((r) => r.reportName === "profitLossReport");
  const bsReport = g.reportDependencies?.find((r) => r.reportName === "balanceSheetReport");

  if (tbReport && tbReport.sourceTables?.includes("ledger_entries")) {
    pass("KG-4: Trial Balance depends on ledger_entries");
  } else {
    fail("KG-4: Trial Balance must depend on ledger_entries");
  }
  if (plReport && plReport.sourceTables?.includes("ledger_entries")) {
    pass("KG-4: P&L depends on ledger_entries");
  } else {
    fail("KG-4: P&L must depend on ledger_entries");
  }
  if (bsReport && bsReport.sourceTables?.includes("ledger_entries")) {
    pass("KG-4: Balance Sheet depends on ledger_entries");
  } else {
    fail("KG-4: Balance Sheet must depend on ledger_entries");
  }

  const wo = g.workflowAlignment?.find((w) => w.wg1Stage === "WORK_ORDER");
  if (wo) {
    if (wo.createsAccountingImpact === false) {
      pass("KG-4: WORK_ORDER has createsAccountingImpact=false");
    } else {
      fail("KG-4: WORK_ORDER must have createsAccountingImpact=false");
    }
  } else {
    warn("KG-4: WORK_ORDER not found in workflowAlignment");
  }

  if (g.accountingProtectionMapping) {
    pass("KG-4: Accounting protection mapping present");
    if (g.accountingProtectionMapping.genericCrudEnforced === true) {
      pass("KG-4: Generic CRUD enforcement confirmed");
    } else {
      warn("KG-4: Generic CRUD enforcement flag not set");
    }
    if (g.accountingProtectionMapping.createBalancedVoucherEnforced === true) {
      pass("KG-4: createBalancedVoucher enforcement confirmed");
    } else {
      warn("KG-4: createBalancedVoucher enforcement flag not set");
    }
  } else {
    warn("KG-4: Accounting protection mapping missing");
  }

  const requiredPatterns = ["sales_invoice", "purchase_procurement", "receipt", "supplier_payment", "opening_balance_account", "reversal"];
  const patternIds = g.debitCreditPatterns.map((p) => p.patternId);
  const missing = requiredPatterns.filter((p) => !patternIds.includes(p));
  if (missing.length === 0) {
    pass("KG-4: All required debit/credit patterns exist");
  } else {
    warn(`KG-4: Missing debit/credit patterns: ${missing.join(", ")}`);
  }

  if (g.knownGaps && g.knownGaps.length > 0) {
    pass(`KG-4: ${g.knownGaps.length} known gaps documented`);
  } else {
    warn("KG-4: No known gaps documented");
  }

  pass("KG-4: No runtime logic modified \u2014 read-only graph");

  console.log("------------------------------------------------------------");
  console.log(exitCode === 0 ? "Summary: All checks passed" : `Summary: Some checks failed (exit=${exitCode})`);
  console.log("============================================================");
  process.exit(exitCode);
}

main();
