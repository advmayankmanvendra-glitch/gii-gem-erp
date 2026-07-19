#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { sortOptions, sortRecordsBy } from "../src/renderer/utils/optionSorting.js";

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${label}`);
  }
}

const labels = [
  "Directorate of Fisheries",
  "AGRICULTURE DIRECTOR BIHAR PATNA(CRA)",
  "Chief Engineer - 1, RWD",
  "Bihar Tourism",
  "Department of Chemistry IIT Patna"
];

check(
  "dynamic labels use case-insensitive natural alphabetical order",
  JSON.stringify(sortOptions(labels)) === JSON.stringify([
    "AGRICULTURE DIRECTOR BIHAR PATNA(CRA)",
    "Bihar Tourism",
    "Chief Engineer - 1, RWD",
    "Department of Chemistry IIT Patna",
    "Directorate of Fisheries"
  ])
);

check(
  "numeric suffixes use natural order",
  JSON.stringify(sortOptions(["Item 10", "Item 2", "Item 1"])) === JSON.stringify(["Item 1", "Item 2", "Item 10"])
);

check(
  "tuple options sort by visible label",
  JSON.stringify(sortOptions([[3, "Zulu"], [1, "Alpha"], [2, "Bravo"]]).map(([id]) => id)) === JSON.stringify([1, 2, 3])
);

check(
  "record options sort by supplied visible label",
  JSON.stringify(sortRecordsBy([{ id: 3, name: "Zulu" }, { id: 1, name: "alpha" }, { id: 2, name: "Bravo" }], (row) => row.name).map((row) => row.id)) === JSON.stringify([1, 2, 3])
);

const transactionSource = readFileSync("src/renderer/features/transactions/TransactionScreen.jsx", "utf8");
const formSource = readFileSync("src/renderer/components/forms/index.jsx", "utf8");
const gridSource = readFileSync("src/renderer/features/operations/supplyOrders/SupplyOrderItemsGrid.jsx", "utf8");
const bankSource = readFileSync("src/renderer/features/accounting/BankStatementScreen.jsx", "utf8");
const tallySource = readFileSync("src/renderer/features/importExport/TallyMasterMigrationAssistantScreen.jsx", "utf8");

check("Transaction reference options use shared sorting", transactionSource.includes("return sortOptions(map[type] || []);"));
check(
  "Shared form controls import shared sorting",
  formSource.includes('from "../../utils/optionSorting.js";') && formSource.includes("sortOptions") && formSource.includes("sortRecordsBy")
);
check("Supply Order item choices use shared sorting", gridSource.includes("sortRecordsBy(references?.items || []"));
check("Bank import source choices use shared sorting", bankSource.includes("sortRecordsBy(data?.imports || []"));
check("Tally company choices use shared sorting", tallySource.includes("sortRecordsBy(existingCompanies"));
check("Controlled transaction statuses retain declared order", transactionSource.includes('return selectField(["Draft", "Received"'));

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed ? 1 : 0);
