export const LOCK_BLOCKING_STEPS = new Set([
  "lint:syntax",
  "build",
  "verify:master-policy",
  "verify:screen-actions",
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

export function evaluateMasterLockGate(steps, workingTreeStatus) {
  const executedSteps = new Set(steps.map((step) => step.name));
  const missingBlockingSteps = [...LOCK_BLOCKING_STEPS].filter((name) => !executedSteps.has(name));
  const functionalFailures = steps.filter(
    (step) => LOCK_BLOCKING_STEPS.has(step.name) && step.exitCode >= 1
  );
  const blockingFailures = steps.filter((step) => step.exitCode >= 2);
  const workingTreeClean = String(workingTreeStatus || "").trim().length === 0;

  return {
    safeToLock: workingTreeClean
      && missingBlockingSteps.length === 0
      && functionalFailures.length === 0
      && blockingFailures.length === 0,
    workingTreeClean,
    missingBlockingSteps,
    functionalFailures,
    blockingFailures
  };
}
