#!/usr/bin/env node
import { LOCK_BLOCKING_STEPS, STRICT_STEPS, evaluateMasterLockGate, strictExitCode } from "./lib/masterVerificationPolicy.js";

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS: ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL: ${name}`);
  }
}

function passingBlockingSteps() {
  return [...LOCK_BLOCKING_STEPS].map((name) => ({ name, exitCode: 0 }));
}

check("FSR-2B.2B is a mandatory lock-blocking verification", LOCK_BLOCKING_STEPS.has("verify:fsr2b2b"));
check("Syntax and build are mandatory lock-blocking verifications", LOCK_BLOCKING_STEPS.has("lint:syntax") && LOCK_BLOCKING_STEPS.has("build"));
check("Dashboard wiring is a mandatory lock-blocking verification", LOCK_BLOCKING_STEPS.has("verify:dashboard-wiring"));

const cleanPass = evaluateMasterLockGate(passingBlockingSteps(), "");
check("A clean baseline with every mandatory check passing can be locked", cleanPass.safeToLock);

const fsr2b2bWarning = evaluateMasterLockGate(
  passingBlockingSteps().map((step) => step.name === "verify:fsr2b2b" ? { ...step, exitCode: 1 } : step),
  ""
);
check("An FSR-2B.2B warning blocks locking", !fsr2b2bWarning.safeToLock && fsr2b2bWarning.functionalFailures.some((step) => step.name === "verify:fsr2b2b"));

const buildWarning = evaluateMasterLockGate(
  passingBlockingSteps().map((step) => step.name === "build" ? { ...step, exitCode: 1 } : step),
  ""
);
check("A build warning or failure blocks locking", !buildWarning.safeToLock);

const missingCheck = evaluateMasterLockGate(
  passingBlockingSteps().filter((step) => step.name !== "verify:controls"),
  ""
);
check("A missing mandatory verification blocks locking", !missingCheck.safeToLock && missingCheck.missingBlockingSteps.includes("verify:controls"));

const dirtyBaseline = evaluateMasterLockGate(passingBlockingSteps(), " M src/renderer/App.jsx");
check("An uncommitted working tree blocks locking", !dirtyBaseline.safeToLock && !dirtyBaseline.workingTreeClean);

const governedFinancialReportWarning = evaluateMasterLockGate(
  [...passingBlockingSteps(), { name: "verify:financial-reports", exitCode: 1 }],
  ""
);
check("The governed FSR-1 warning does not independently block locking", governedFinancialReportWarning.safeToLock);

check("The Audit Watch steps are strict and lock-blocking", ["verify:audit-watch", "test:audit-watch"].every((name) => STRICT_STEPS.has(name) && LOCK_BLOCKING_STEPS.has(name)));
check("A strict step's warning becomes a FAIL; its pass and failures stay", strictExitCode("verify:audit-watch", 1) === 2 && strictExitCode("test:audit-watch", 0) === 0 && strictExitCode("test:audit-watch", 3) === 3);
check("A non-strict step's warning stays a warning", strictExitCode("verify:knowledge", 1) === 1);

console.log(JSON.stringify({ passed, failed, total: passed + failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
