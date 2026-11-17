// Runs a Node command line with Electron's own Node (ELECTRON_RUN_AS_NODE=1), so a
// script that opens the database uses the same better-sqlite3 build as the Electron
// app and the Electron-based verifiers (verify:accounting, verify:financials). Works the
// same on Windows and Linux.
//
// Usage: node scripts/lib/run-as-electron-node.mjs <node arguments...>
//   e.g. node scripts/lib/run-as-electron-node.mjs --test scripts/audit/audit-watch.test.mjs

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const result = spawnSync(electronBinary, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
});
if (result.error) {
  console.error(`Could not start Electron as Node: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 2);
