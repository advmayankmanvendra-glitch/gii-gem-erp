/**
 * GII GeM ERP — Master Verification Runner (VA-2)
 *
 * Sequentially runs every available verification command and generates
 * reports/verify-erp-report.md with timing, exit codes, and conclusions.
 *
 * Master process exit codes:
 *   0 = PASS       — all commands passed, or only governed warnings remain
 *   2 = FAIL       — at least one command failed
 *   3 = CRITICAL   — at least one command was critical (data-integrity risk)
 *
 * Stop-on-fail policy:
 *   - WARNING (exit 1)       → continue
 *   - FAIL    (exit 2)       → stop
 *   - CRITICAL (exit 3)      → stop
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { LOCK_BLOCKING_STEPS, evaluateMasterLockGate } from "./lib/masterVerificationPolicy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "reports", "verify-erp-report.md");

const NPM = /^win/.test(process.platform) ? "npm.cmd" : "npm";

const EXIT = { PASS: 0, WARNING: 1, FAIL: 2, CRITICAL: 3 };
const EXIT_LABEL = { 0: "PASS", 1: "WARNING", 2: "FAIL", 3: "CRITICAL" };

function validateFinancialReportKnownGaps(stdout) {
  const failureLines = String(stdout || "")
    .split(/\r?\n/)
    .filter((line) => line.startsWith("FAIL:"));
  const expectedFailures = [
    "FAIL: 9. Group totals equal ledger totals",
    "FAIL: 16. Renderer does not bypass trusted financial classification"
  ];
  const hasExpectedFailures = expectedFailures.every((expected) => (
    failureLines.some((line) => line.startsWith(expected))
  ));
  const hasExpectedSummary = String(stdout || "").includes("Summary: 23 passed, 2 failed, 25 total");
  const check20Passes = String(stdout || "").includes("PASS: 20. Governed money representation is consistent");
  const exactKnownGapSet = failureLines.length === expectedFailures.length && hasExpectedFailures;
  return {
    valid: exactKnownGapSet && hasExpectedSummary && check20Passes,
    detail: exactKnownGapSet && hasExpectedSummary && check20Passes
      ? "Only FSR-1 Checks 9 and 16 remain as assigned FSR-2B gaps."
      : `Unexpected FSR-1 result: ${failureLines.join(" | ") || "no failure lines"}`
  };
}

/* ─── Pipeline definition ─── */
const PIPELINE = [
  { name: "lint:syntax",       cmd: `${NPM} run lint:syntax`,        continueOn: [0, 1] },
  { name: "build",             cmd: `${NPM} run build`,              continueOn: [0, 1] },
  { name: "verify:master-policy", cmd: `${NPM} run verify:master-policy`, continueOn: [0, 1] },
  { name: "verify:screen-actions", cmd: `${NPM} run verify:screen-actions`, continueOn: [0, 1] },
  { name: "verify:dashboard-wiring", cmd: `${NPM} run verify:dashboard-wiring`, continueOn: [0, 1] },
  { name: "verify:knowledge",  cmd: `${NPM} run verify:knowledge`,   continueOn: [0, 1] },
  { name: "verify:audit",      cmd: `${NPM} run verify:audit`,       continueOn: [0, 1] },
  { name: "verify:accounting", cmd: `${NPM} run verify:accounting`,  continueOn: [0, 1] },
  { name: "verify:financials", cmd: `${NPM} run verify:financials`,  continueOn: [0, 1] },
  { name: "verify:controls",   cmd: `${NPM} run verify:controls`,    continueOn: [0, 1] },
  { name: "verify:voucher-inventory", cmd: `${NPM} run verify:voucher-inventory`, continueOn: [0, 1] },
  { name: "verify:flow",       cmd: `${NPM} run verify:flow`,        continueOn: [0, 1] },
  { name: "verify:phase10",    cmd: `${NPM} run verify:phase10`,     continueOn: [0, 1] },
  { name: "verify:entity-picker", cmd: `${NPM} run verify:entity-picker`, continueOn: [0, 1] },
  { name: "verify:operational-stages", cmd: `${NPM} run verify:operational-stages`, continueOn: [0, 1] },
  { name: "verify:database-graph", cmd: `${NPM} run verify:database-graph`, continueOn: [0, 1] },
  { name: "verify:voucher-accounting-graph", cmd: `${NPM} run verify:voucher-accounting-graph`, continueOn: [0, 1] },
  { name: "verify:workflow-graph", cmd: `${NPM} run verify:workflow-graph`, continueOn: [0, 1] },
  { name: "verify:workflow-enforcement", cmd: `${NPM} run verify:workflow-enforcement`, continueOn: [0, 1] },
  { name: "verify:safe-delete", cmd: `${NPM} run verify:safe-delete`, continueOn: [0, 1] },
  { name: "verify:fk-constraints", cmd: `${NPM} run verify:fk-constraints`, continueOn: [0, 1] },
  { name: "verify:production-readiness-sql", cmd: `${NPM} run verify:production-readiness-sql`, continueOn: [0, 1] },
  { name: "verify:fsr2a1", cmd: `${NPM} run verify:fsr2a1`, continueOn: [0, 1] },
  { name: "verify:fsr2a2", cmd: `${NPM} run verify:fsr2a2`, continueOn: [0, 1] },
  { name: "verify:fsr2a3", cmd: `${NPM} run verify:fsr2a3`, continueOn: [0, 1] },
  { name: "verify:fsr2a4", cmd: `${NPM} run verify:fsr2a4`, continueOn: [0, 1] },
  { name: "verify:fsr2a5a", cmd: `${NPM} run verify:fsr2a5a`, continueOn: [0, 1] },
  { name: "verify:fsr2a5b", cmd: `${NPM} run verify:fsr2a5b`, continueOn: [0, 1] },
  { name: "verify:fsr2a5c", cmd: `${NPM} run verify:fsr2a5c`, continueOn: [0, 1] },
  { name: "verify:fsr2b1", cmd: `${NPM} run verify:fsr2b1`, continueOn: [0, 1] },
  { name: "verify:fsr2b2a", cmd: `${NPM} run verify:fsr2b2a`, continueOn: [0, 1] },
  { name: "verify:fsr2b2b", cmd: `${NPM} run verify:fsr2b2b`, continueOn: [0, 1] },
  {
    name: "verify:financial-reports",
    cmd: `${NPM} run verify:financial-reports`,
    continueOn: [0, 1],
    warningValidator: validateFinancialReportKnownGaps
  },
];

/* ─── Helpers ─── */
function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function run(cmd) {
  const start = Date.now();
  try {
    const stdout = execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 600000 });
    return { exitCode: 0, stdout, stderr: "", duration: Date.now() - start };
  } catch (e) {
    const exitCode = e.status != null ? e.status : 3;
    return {
      exitCode,
      stdout: e.stdout || "",
      stderr: e.stderr || e.message,
      duration: Date.now() - start,
    };
  }
}

/* ─── Main ─── */
function gitWorkingTreeStatus() {
  try {
    return execSync("git status --porcelain --untracked-files=all", {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30000
    }).trim();
  } catch (error) {
    return `git status unavailable: ${error?.message || error}`;
  }
}

function main() {
  console.log("GII GeM ERP — Master Verification Runner");
  console.log(`Started: ${timestamp()}`);
  console.log("=".repeat(60));

  const steps = [];
  let summaryExit = EXIT.PASS;

  for (const step of PIPELINE) {
    console.log(`\n── ${step.name} ──`);
    const result = run(step.cmd);
    let warningDetail = "";
    if (result.exitCode === EXIT.WARNING && step.warningValidator) {
      const validation = step.warningValidator(result.stdout);
      warningDetail = validation.detail;
      if (!validation.valid) {
        result.exitCode = EXIT.FAIL;
        result.stderr = [result.stderr, validation.detail].filter(Boolean).join("\n");
      }
    }
    const label = EXIT_LABEL[result.exitCode] || `UNKNOWN(${result.exitCode})`;
    const durationSec = (result.duration / 1000).toFixed(1);

    console.log(`  → exit ${result.exitCode} (${label})  [${durationSec}s]`);

    if (result.stdout) {
      const lines = result.stdout.trim().split("\n");
      const summary = lines.slice(-8).join("\n").trim();
      if (summary) console.log(`  ── last output ──\n${summary}\n  ──`);
    }
    if (result.stderr) {
      const lines = result.stderr.trim().split("\n").slice(-5).join("\n");
      if (lines) console.log(`  ── stderr ──\n${lines}\n  ──`);
    }

    steps.push({
      name: step.name,
      exitCode: result.exitCode,
      label,
      durationMs: result.duration,
      durationSec,
      stdout: result.stdout,
      stderr: result.stderr,
      warningDetail,
    });

    if (result.exitCode >= 2) {
      console.log(`\n  ⛔ STOP: ${step.name} returned ${label}. Halting pipeline.`);
      summaryExit = Math.max(summaryExit, result.exitCode);
      break;
    }
    summaryExit = Math.max(summaryExit, result.exitCode);
  }

  /* ─── Determine final result ─── */
  let finalLabel, finalExit, processExit;
  if (summaryExit >= 3) {
    finalLabel = "CRITICAL";
    finalExit = EXIT.CRITICAL;
    processExit = EXIT.CRITICAL;
  } else if (summaryExit >= 2) {
    finalLabel = "FAIL";
    finalExit = EXIT.FAIL;
    processExit = EXIT.FAIL;
  } else if (summaryExit >= 1) {
    finalLabel = "PASS WITH WARNINGS";
    finalExit = EXIT.WARNING;
    processExit = EXIT.PASS;
  } else {
    finalLabel = "PASS";
    finalExit = EXIT.PASS;
    processExit = EXIT.PASS;
  }

  /* ─── Determine safe-to-commit ─── */
  const safeToCommit = finalExit <= EXIT.WARNING;

  /*
   * Safe-to-Lock Policy (Governance v2):
   *
   * Functional integrity and a clean versioned baseline are required.
   * Architecture observations about known programme targets do not block the
   * functional gate by themselves.
   *
   * Blocking steps:  accounting, financials, controls, voucher-inventory, flow, phase10
   * Non-blocking:    lint, build, knowledge (observations), audit (architecture warnings)
   */
  const workingTreeStatus = gitWorkingTreeStatus();
  const lockGate = evaluateMasterLockGate(steps, workingTreeStatus);
  const { safeToLock, workingTreeClean } = lockGate;

  /* ─── Generate report ─── */
  const report = [
    `# GII GeM ERP — Master Verification Report`,
    ``,
    `**Generated:** ${timestamp()}`,
    `**Runner:** scripts/verify-erp.js`,
    ``,
    `## Pipeline Results`,
    ``,
    `| Step | Exit Code | Status | Duration | Blocking |`,
    `|------|-----------|--------|----------|----------|`,
    ...steps.map((s) => {
      const isBlocking = LOCK_BLOCKING_STEPS.has(s.name);
      const blocks = isBlocking && s.exitCode >= EXIT.WARNING ? "Yes" : "No";
      return `| ${s.name} | ${s.exitCode} | ${s.label} | ${s.durationSec}s | ${blocks} |`;
    }),
    ``,
    `## Summary`,
    ``,
    `| Field | Value |`,
    `|-------|-------|`,
    `| Steps Executed | ${steps.length} |`,
    `| Highest Exit Code | ${summaryExit} (${finalLabel}) |`,
    `| Final Result | **${finalLabel}** |`,
    `| Process Exit Code | **${processExit}** |`,
    `| Safe to Commit | **${safeToCommit ? "Yes" : "No"}** |`,
    `| Working Tree Clean | **${workingTreeClean ? "Yes" : "No"}** |`,
    `| Mandatory Lock Checks Complete | **${lockGate.missingBlockingSteps.length === 0 ? "Yes" : "No"}** |`,
    `| Safe to Lock | **${safeToLock ? "Yes" : "No"}** |`,
    ``,
    `## Safe-to-Lock Governance Policy`,
    ``,
    `Locking requires functional integrity and a clean committed baseline:`,
    ``,
    `| Domain | Blocks Locking? |`,
    `|--------|:-:|`,
    `| Accounting mismatch | Yes |`,
    `| Financials mismatch | Yes |`,
    `| Controls failure | Yes |`,
    `| Voucher/Inventory integrity | Yes |`,
    `| Workflow integrity | Yes |`,
    `| Phase 10 flow integrity | Yes |`,
    `| FSR-2A accounting-truth certification | Yes |`,
    `| FSR-2B.1 / 2A / 2B mapping verification | Yes |`,
    `| Dirty or unversioned working tree | **Yes** |`,
    `| Known FSR-2B mapping/classification gaps | **No** |`,
    `| Audit observations (architecture) | **No** |`,
    `| Knowledge graph observations | **No** |`,
    `| Syntax / build warnings | **No** |`,
    ``,
    `Architecture warnings about known program targets (e.g. \`App.jsx high risk\``,
    `tracked for Phase 18) are **non-blocking** — they document ongoing work`,
    `rather than indicating a regression.`,
    ``,
    `## Known FSR-2B Gaps`,
    ``,
    `The populated FSR-1 verifier is accepted as a non-blocking warning only when`,
    `it reports exactly 23 passes and these two failures:`,
    ``,
    `1. Check 9 — no governed account-group/report-mapping registry.`,
    `2. Check 16 — renderer assigns financial classifications heuristically.`,
    ``,
    `Any different FSR-1 failure set is promoted to a blocking verification failure.`,
    ``,
    `## Git Baseline`,
    ``,
    workingTreeClean
      ? `Working tree is clean.`
      : `Working tree is not clean; formal locking remains blocked until the intended change set is reviewed and committed.`,
    !workingTreeClean
      ? `\`\`\`\n${workingTreeStatus.slice(0, 4000)}\n\`\`\``
      : ``,
    lockGate.missingBlockingSteps.length
      ? `Missing mandatory lock checks: ${lockGate.missingBlockingSteps.join(", ")}`
      : `All mandatory lock checks executed.`,
    ``,
    `## Details`,
    ``,
    ...steps.flatMap((s) => [
      `### ${s.name} (exit ${s.exitCode} — ${s.label}, ${s.durationSec}s)`,
      ``,
      s.stdout ? `\`\`\`\n${s.stdout.trim().slice(-2000)}\n\`\`\`\n` : `_No stdout._`,
      s.warningDetail ? `**Governed warning:** ${s.warningDetail}` : ``,
      s.stderr ? `**stderr:**\n\`\`\`\n${s.stderr.trim().slice(-1000)}\n\`\`\`` : ``,
    ]),
    ``,
    `## Exit Code Policy`,
    ``,
    `| Code | Meaning | Action |`,
    `|------|---------|--------|`,
    `| 0 | PASS | All checks passed |`,
    `| 1 | WARNING | Governed non-blocking issue; master continues |`,
    `| 2 | FAIL | Blocking issues (stops pipeline) |`,
    `| 3 | CRITICAL | Data integrity or security risk (stops pipeline) |`,
    ``,
    `The master process returns exit code 0 for PASS or PASS WITH WARNINGS, and`,
    `returns 2 or 3 only for blocking failures. Governed warnings remain visible`,
    `in this report and are never converted into silent passes.`,
    ``,
    `## Recommendation`,
    ``,
    `- **Safe to Commit:** ${safeToCommit ? "Yes — no blocking failures." : "No — resolve failures first."}`,
    `- **Safe to Lock:** ${safeToLock ? "Yes — functional integrity passes and the working tree is clean." : "No — a functional failure or uncommitted working tree still blocks the formal lock."}`,
    ``,
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Final:  ${finalLabel}`);
  console.log(`Safe to Commit: ${safeToCommit ? "Yes" : "No"}`);
  console.log(`Safe to Lock:   ${safeToLock ? "Yes" : "No"}`);
  console.log(`${"=".repeat(60)}`);

  process.exit(processExit);
}

main();
