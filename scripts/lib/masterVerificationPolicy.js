export const LOCK_BLOCKING_STEPS = new Set([
  "lint:syntax",
  "build",
  "verify:master-policy",
  "verify:screen-actions",
  "verify:dashboard-wiring",
  "verify:audit-watch",
  "test:audit-watch",
  "verify:accounting",
  "verify:financials",
  "verify:controls",
  "verify:voucher-inventory",
  "verify:flow",
  "verify:phase10",
  "verify:fsr2a1",
  "verify:fsr2a2",
  "verify:fsr2a3",
  "verify:fsr2a4",
  "verify:fsr2a5a",
  "verify:fsr2a5b",
  "verify:fsr2a5c",
  "verify:fsr2b1",
  "verify:fsr2b2a",
  "verify:fsr2b2b"
]);

// Strict steps have no warning state: any non-zero exit is at least a FAIL, so the
// pipeline stops. Strictness is keyed on the step's name, so nothing a runner does to its
// step objects can loosen it.
export const STRICT_STEPS = new Set([
  "verify:audit-watch",
  "test:audit-watch"
]);

export function strictExitCode(name, exitCode) {
  // A step object or nothing passed by mistake must not quietly read as "not strict".
  if (typeof name !== "string") throw new TypeError("strictExitCode(name, exitCode) needs the step's name");
  if (!STRICT_STEPS.has(name)) return exitCode;
  if (!Number.isInteger(exitCode) || exitCode < 0) return 3;
  return exitCode === 0 ? 0 : Math.max(exitCode, 2);
}

// The command each strict step must have run (npm or npm.cmd), checked when the run ends,
// so a strict step whose command was swapped at run time cannot count towards locking.
export function expectedStrictCommand(name, cmd) {
  return STRICT_STEPS.has(name) && new RegExp(`^npm(\\.cmd)? run ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:electron$`).test(String(cmd ?? ""));
}

// What each strict step must have printed, so a step that exited 0 without running its
// suite (a dry run, a skipped step, an empty command) cannot count towards locking:
// the test runner's own summary with at least one pass and no failure, and the
// verifier's own summary with at least one pass, no warning and no failure.
export function strictStepProof(name, stdout) {
  if (!STRICT_STEPS.has(name)) return true;
  const text = String(stdout ?? "");
  if (name === "test:audit-watch") {
    const pass = text.match(/^# pass (\d+)$/m);
    const fail = text.match(/^# fail (\d+)$/m);
    return Boolean(pass && fail && Number(pass[1]) > 0 && Number(fail[1]) === 0);
  }
  if (name === "verify:audit-watch") {
    const summary = text.match(/^Audit Watch: (\d+) passed, 0 warnings, 0 failed$/m);
    return Boolean(summary && Number(summary[1]) > 0);
  }
  return false;
}

export function evaluateMasterLockGate(steps, workingTreeStatus) {
  const executedSteps = new Set(steps.map((step) => step.name));
  const missingBlockingSteps = [...LOCK_BLOCKING_STEPS].filter((name) => !executedSteps.has(name));
  // An exit code that is not a whole number (undefined, NaN, a string) never counts as a pass.
  const failedCode = (code, from) => !Number.isInteger(code) || code >= from;
  const commandMismatches = steps.filter((step) => STRICT_STEPS.has(step.name) && !expectedStrictCommand(step.name, step.cmd));
  const missingProof = steps.filter((step) => STRICT_STEPS.has(step.name) && !strictStepProof(step.name, step.stdout));
  const functionalFailures = steps.filter(
    (step) => LOCK_BLOCKING_STEPS.has(step.name) && failedCode(step.exitCode, 1)
  );
  const blockingFailures = steps.filter((step) => failedCode(step.exitCode, 2));
  const workingTreeClean = String(workingTreeStatus || "").trim().length === 0;

  return {
    safeToLock: workingTreeClean
      && missingBlockingSteps.length === 0
      && functionalFailures.length === 0
      && blockingFailures.length === 0
      && commandMismatches.length === 0
      && missingProof.length === 0,
    workingTreeClean,
    missingBlockingSteps,
    functionalFailures,
    blockingFailures,
    commandMismatches,
    missingProof
  };
}
