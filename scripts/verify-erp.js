/**
 * GII GeM ERP — Master Verification Runner (VA-2)
 *
 * Sequentially runs every available verification command and generates
 * reports/verify-erp-report.md with timing, exit codes, and conclusions.
 *
 * Exit codes (summary):
 *   0 = PASS       — all commands passed (or only warnings)
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "reports", "verify-erp-report.md");

const NPM = /^win/.test(process.platform) ? "npm.cmd" : "npm";

const EXIT = { PASS: 0, WARNING: 1, FAIL: 2, CRITICAL: 3 };
const EXIT_LABEL = { 0: "PASS", 1: "WARNING", 2: "FAIL", 3: "CRITICAL" };

/* ─── Pipeline definition ─── */
const PIPELINE = [
  { name: "lint:syntax",       cmd: `${NPM} run lint:syntax`,        continueOn: [0, 1] },
  { name: "build",             cmd: `${NPM} run build`,              continueOn: [0, 1] },
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
];

/* ─── Helpers ─── */
function timestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function run(cmd) {
  const start = Date.now();
  try {
    const stdout = execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 300000 });
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
function main() {
  console.log("GII GeM ERP — Master Verification Runner");
  console.log(`Started: ${timestamp()}`);
  console.log("=".repeat(60));

  const steps = [];
  let summaryExit = EXIT.PASS;

  for (const step of PIPELINE) {
    console.log(`\n── ${step.name} ──`);
    const result = run(step.cmd);
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
    });

    if (result.exitCode >= 2) {
      console.log(`\n  ⛔ STOP: ${step.name} returned ${label}. Halting pipeline.`);
      summaryExit = Math.max(summaryExit, result.exitCode);
      break;
    }
    summaryExit = Math.max(summaryExit, result.exitCode);
  }

  /* ─── Determine final result ─── */
  let finalLabel, finalExit;
  if (summaryExit >= 3) { finalLabel = "CRITICAL"; finalExit = EXIT.CRITICAL; }
  else if (summaryExit >= 2) { finalLabel = "FAIL"; finalExit = EXIT.FAIL; }
  else if (summaryExit >= 1) { finalLabel = "WARNING"; finalExit = EXIT.WARNING; }
  else { finalLabel = "PASS"; finalExit = EXIT.PASS; }

  /* ─── Determine safe-to-commit ─── */
  const safeToCommit = finalExit <= EXIT.WARNING;

  /*
   * Safe-to-Lock Policy (Governance v2):
   *
   * Only FUNCTIONAL steps block locking — architecture observations about
   * known program targets (e.g. "App.jsx is high risk" tracked for Phase 18)
   * must NOT prevent sub-phase locking during active stabilization programs.
   *
   * Blocking steps:  accounting, financials, controls, voucher-inventory, flow, phase10
   * Non-blocking:    lint, build, knowledge (observations), audit (architecture warnings)
   */
  const LOCK_BLOCKING_STEPS = new Set([
    "verify:accounting",
    "verify:financials",
    "verify:controls",
    "verify:voucher-inventory",
    "verify:flow",
    "verify:phase10",
  ]);

  const hasFunctionalFailure = steps.some(
    (s) => LOCK_BLOCKING_STEPS.has(s.name) && s.exitCode >= EXIT.WARNING
  );
  const hasBlockingFailure = steps.some((s) => s.exitCode >= EXIT.FAIL);
  const safeToLock = !hasFunctionalFailure && !hasBlockingFailure;

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
    `| Safe to Commit | **${safeToCommit ? "Yes" : "No"}** |`,
    `| Safe to Lock | **${safeToLock ? "Yes" : "No"}** |`,
    ``,
    `## Safe-to-Lock Governance Policy`,
    ``,
    `Locking is blocked only by **functional integrity** failures:`,
    ``,
    `| Domain | Blocks Locking? |`,
    `|--------|:-:|`,
    `| Accounting mismatch | Yes |`,
    `| Financials mismatch | Yes |`,
    `| Controls failure | Yes |`,
    `| Voucher/Inventory integrity | Yes |`,
    `| Workflow integrity | Yes |`,
    `| Phase 10 flow integrity | Yes |`,
    `| Audit observations (architecture) | **No** |`,
    `| Knowledge graph observations | **No** |`,
    `| Syntax / build warnings | **No** |`,
    ``,
    `Architecture warnings about known program targets (e.g. \`App.jsx high risk\``,
    `tracked for Phase 18) are **non-blocking** — they document ongoing work`,
    `rather than indicating a regression.`,
    ``,
    `## Details`,
    ``,
    ...steps.flatMap((s) => [
      `### ${s.name} (exit ${s.exitCode} — ${s.label}, ${s.durationSec}s)`,
      ``,
      s.stdout ? `\`\`\`\n${s.stdout.trim().slice(-2000)}\n\`\`\`\n` : `_No stdout._`,
      s.stderr ? `**stderr:**\n\`\`\`\n${s.stderr.trim().slice(-1000)}\n\`\`\`` : ``,
    ]),
    ``,
    `## Exit Code Policy`,
    ``,
    `| Code | Meaning | Action |`,
    `|------|---------|--------|`,
    `| 0 | PASS | All checks passed |`,
    `| 1 | WARNING | Non-blocking issues (continues) |`,
    `| 2 | FAIL | Blocking issues (stops pipeline) |`,
    `| 3 | CRITICAL | Data integrity or security risk (stops pipeline) |`,
    ``,
    `## Recommendation`,
    ``,
    `- **Safe to Commit:** ${safeToCommit ? "Yes — no blocking failures." : "No — resolve failures first."}`,
    `- **Safe to Lock:** ${safeToLock ? "Yes — no functional integrity failures." : "No — one or more functional checks show warnings or failures."}`,
    ``,
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`Final:  ${finalLabel}`);
  console.log(`Safe to Commit: ${safeToCommit ? "Yes" : "No"}`);
  console.log(`Safe to Lock:   ${safeToLock ? "Yes" : "No"}`);
  console.log(`${"=".repeat(60)}`);

  process.exit(finalExit);
}

main();
