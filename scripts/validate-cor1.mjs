import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const registryDir = path.resolve(__dirname, "../src/renderer/componentRegistry/ownership");

const files = [
  "shared.json", "masters.json", "operations.json", "inventory.json",
  "accounting.json", "gst.json", "reports.json", "dashboards.json",
  "help.json", "utilities.json", "deployment.json"
];

let all = [];
let total = 0;
for (const f of files) {
  const arr = require(path.join(registryDir, f));
  all = all.concat(arr);
  total += arr.length;
  console.log(`${f}: ${arr.length} components`);
}

console.log(`\nTotal components: ${total}`);

// Simple validation
const ids = new Set();
const errors = [];
for (const entry of all) {
  if (!entry.componentId) errors.push(`Missing componentId`);
  else if (ids.has(entry.componentId)) errors.push(`Duplicate: ${entry.componentId}`);
  else ids.add(entry.componentId);
}

if (errors.length) {
  console.log("\nERRORS:");
  errors.forEach(e => console.log(`  - ${e}`));
} else {
  console.log("No duplicate IDs found ✓");
}

// Owner summary
const owners = {};
for (const entry of all) {
  const o = entry.ownerModule || "Unknown";
  owners[o] = (owners[o] || 0) + 1;
}
console.log("\nOwners:");
for (const [k, v] of Object.entries(owners).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// Extraction status
const extraction = {};
for (const entry of all) {
  const s = entry.extractionStatus || "Unknown";
  extraction[s] = (extraction[s] || 0) + 1;
}
console.log("\nExtraction Status:");
for (const [k, v] of Object.entries(extraction)) {
  console.log(`  ${k}: ${v}`);
}

// Shared levels
const shared = {};
for (const entry of all) {
  const s = entry.sharedLevel || "Unknown";
  shared[s] = (shared[s] || 0) + 1;
}
console.log("\nShared Levels:");
for (const [k, v] of Object.entries(shared)) {
  console.log(`  ${k}: ${v}`);
}

// Risk levels
const risk = { "Critical": 0, "High": 0, "Medium": 0, "Low": 0 };
for (const entry of all) {
  const r = entry.riskLevel || "Low";
  risk[r] = (risk[r] || 0) + 1;
}
console.log("\nRisk Levels:");
for (const [k, v] of Object.entries(risk)) {
  console.log(`  ${k}: ${v}`);
}

console.log("\n✓ COR-1 validation complete");
