import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function projectRoot() {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function runScript(scriptName, profile) {
  const scriptPath = path.join(projectRoot(), "scripts", scriptName);
  if (!fs.existsSync(scriptPath)) {
    return { passed: false, name: scriptName, error: `Script not found: ${scriptPath}` };
  }
  try {
    const extraArgs = profile === "production" ? ["--profile=production"] : [];
    const result = execSync(`node "${scriptPath}" ${extraArgs.join(" ")}`, {
      cwd: projectRoot(),
      encoding: "utf8",
      timeout: 60000
    });
    return { passed: true, name: scriptName, output: result.trim() };
  } catch (err) {
    return { passed: false, name: scriptName, error: err.message, stderr: err.stderr };
  }
}

export function runProductionVerification(db, profile = "production") {
  const results = [];
  const scripts = [
    "verify-accounting.js",
    "verify-financials.js",
    "verify-controls.js"
  ];

  for (const script of scripts) {
    results.push(runScript(script, profile));
  }

  const allPassed = results.every(r => r.passed);

  const additionalChecks = [];

  try {
    const tbRow = db.prepare("SELECT COALESCE(SUM(debit),0) debit, COALESCE(SUM(credit),0) credit FROM ledger_entries").get();
    const tbDiff = Math.abs(Number(tbRow?.debit || 0) - Number(tbRow?.credit || 0));
    additionalChecks.push({ key: "trialBalance", label: "Trial Balance balanced", passed: tbDiff < 0.01, detail: `diff=${tbDiff.toFixed(2)}` });
  } catch { additionalChecks.push({ key: "trialBalance", label: "Trial Balance balanced", passed: false, detail: "query failed" }); }

  try {
    const voucherCount = db.prepare("SELECT COUNT(*) count FROM vouchers").get()?.count || 0;
    additionalChecks.push({ key: "zeroVouchers", label: "No operational vouchers", passed: Number(voucherCount) === 0, detail: `vouchers=${voucherCount}` });
  } catch { additionalChecks.push({ key: "zeroVouchers", label: "No operational vouchers", passed: false, detail: "query failed" }); }

  try {
    const stockCount = db.prepare("SELECT COUNT(*) count FROM stock_ledger").get()?.count || 0;
    additionalChecks.push({ key: "zeroStock", label: "No stock movements", passed: Number(stockCount) === 0, detail: `stock_ledger=${stockCount}` });
  } catch { additionalChecks.push({ key: "zeroStock", label: "No stock movements", passed: false, detail: "query failed" }); }

  const additionalPassed = additionalChecks.every(c => c.passed);

  return {
    scriptResults: results,
    additionalChecks,
    scriptPassed: allPassed,
    additionalPassed,
    overallPassed: allPassed && additionalPassed
  };
}