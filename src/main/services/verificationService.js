import fs from "node:fs";
import path from "node:path";

const VERIFICATION_COMMANDS = [
  {
    key: "verify_accounting",
    title: "Accounting Verification",
    command: "npm.cmd run verify:accounting",
    note: "Confirms vouchers and ledger entries remain balanced."
  },
  {
    key: "verify_financials",
    title: "Financial Verification",
    command: "npm.cmd run verify:financials",
    note: "Confirms GST, receivables, payables, P&L and balance sheet reconciliation."
  },
  {
    key: "verify_controls",
    title: "Controls Verification",
    command: "npm.cmd run verify:controls",
    note: "Checks financial year, controls and protected workflow assumptions."
  },
  {
    key: "verify_voucher_inventory",
    title: "Voucher and Inventory Verification",
    command: "npm.cmd run verify:voucher-inventory",
    note: "Checks voucher dependency and inventory integration verification scripts."
  },
  {
    key: "verify_flow",
    title: "Operational Flow Verification",
    command: "npm.cmd run verify:flow",
    note: "Checks the controlled operational flow verification script."
  },
  {
    key: "verify_phase10",
    title: "Phase 10 Inventory Verification",
    command: "npm.cmd run verify:phase10",
    note: "Checks Phase 10 inventory automation verification script."
  }
];

function nowIso() {
  return new Date().toISOString();
}

function ensureLogsFolder(runtimeDataRoot) {
  const folder = path.join(runtimeDataRoot, "logs");
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function historyFilePath(runtimeDataRoot) {
  return path.join(ensureLogsFolder(runtimeDataRoot), "verification-console-history.json");
}

function readHistory(runtimeDataRoot) {
  try {
    const filePath = historyFilePath(runtimeDataRoot);
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(runtimeDataRoot, history) {
  const filePath = historyFilePath(runtimeDataRoot);
  fs.writeFileSync(filePath, JSON.stringify(history.slice(0, 25), null, 2));
  return filePath;
}

function summarizeChecks(checks = {}) {
  const summary = checks.summary || {};
  const failed = Number(summary.fail || 0);
  const warnings = Number(summary.warn || 0);
  const passed = Number(summary.pass || 0);
  return {
    passed,
    warnings,
    failed,
    status: failed ? "fail" : warnings ? "warn" : "pass"
  };
}

function getVerificationConsoleState(runtimeDataRoot) {
  const history = readHistory(runtimeDataRoot);
  return {
    generatedAt: nowIso(),
    executionMode: "manual-terminal-only",
    safety: {
      shellExecutionAllowed: false,
      message: "The desktop UI does not execute arbitrary shell commands. Run verification commands from PowerShell and use Health Snapshot for read-only ERP state."
    },
    commands: VERIFICATION_COMMANDS.map((command) => ({
      ...command,
      result: "manual",
      lastKnown: history[0]?.generatedAt || ""
    })),
    history
  };
}

function recordVerificationSnapshot(runtimeDataRoot, checks = {}, context = {}) {
  const history = readHistory(runtimeDataRoot);
  const summary = summarizeChecks(checks);
  const entry = {
    id: `health-snapshot-${Date.now()}`,
    type: "health-snapshot",
    generatedAt: nowIso(),
    status: summary.status,
    summary,
    company: {
      id: context.company_id || context.companyId || null,
      name: context.company_name || context.companyName || "",
      scope: context.company_scope || context.companyScope || ""
    },
    user: {
      id: context.user_id || context.userId || null,
      name: context.user_name || context.userName || "",
      role: context.role || ""
    },
    note: "Read-only Health Center snapshot. Verification commands remain terminal-controlled."
  };
  const filePath = writeHistory(runtimeDataRoot, [entry, ...history]);
  return {
    ...getVerificationConsoleState(runtimeDataRoot),
    saved: {
      filePath,
      entry
    }
  };
}

export { getVerificationConsoleState, recordVerificationSnapshot, VERIFICATION_COMMANDS };
