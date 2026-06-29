import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "database", "gii_gem_erp.db");
console.log("DB path:", dbPath);

const db = new Database(dbPath);

// Check cash_bank_ledger columns
const cols = db.pragma("table_info('cash_bank_ledger')");
console.log("cash_bank_ledger columns:", cols.map(c => c.name));
console.log("has is_deleted:", cols.some(c => c.name === "is_deleted"));

// Count before
const before = db.prepare("SELECT COUNT(*) AS c FROM cash_bank_ledger").get().c;
console.log("Rows before:", before);

// Test PRAGMA foreign_keys
console.log("FK before:", JSON.stringify(db.pragma("foreign_keys")));
db.pragma("foreign_keys = OFF");
console.log("FK after set OFF:", JSON.stringify(db.pragma("foreign_keys")));

// Try DELETE
try {
  const info = db.prepare("DELETE FROM cash_bank_ledger").run();
  console.log("DELETE result:", JSON.stringify(info));
} catch (e) {
  console.log("DELETE error:", e.message);
}

// Count after
const after = db.prepare("SELECT COUNT(*) AS c FROM cash_bank_ledger").get().c;
console.log("Rows after:", after);

// Verify voucher_lines and ledger_entries
console.log("voucher_lines count:", db.prepare("SELECT COUNT(*) AS c FROM voucher_lines").get().c);
console.log("ledger_entries count:", db.prepare("SELECT COUNT(*) AS c FROM ledger_entries").get().c);
console.log("vouchers (is_deleted=0):", db.prepare("SELECT COUNT(*) AS c FROM vouchers WHERE COALESCE(is_deleted,0)=0").get().c);
console.log("vouchers (is_deleted=1):", db.prepare("SELECT COUNT(*) AS c FROM vouchers WHERE COALESCE(is_deleted,0)=1").get().c);

db.pragma("foreign_keys = ON");
db.close();

// Also check if there's a different database file being used
import fs from "fs";
const runtimeDir = path.join(__dirname, "runtime");
if (fs.existsSync(runtimeDir)) {
  const files = fs.readdirSync(runtimeDir).filter(f => f.endsWith(".db") || f.endsWith(".sqlite"));
  console.log("Other db files in runtime:", files);
}
