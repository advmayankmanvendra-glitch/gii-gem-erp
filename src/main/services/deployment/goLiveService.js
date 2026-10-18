import fs from "node:fs";
import path from "node:path";
import { previewReset, analyzeDependencies, rebuildZeroState, executeEnhancedReset } from "../operationalResetService.js";
import { calculateReadinessScore } from "./readinessService.js";
import { generateGoLiveCertificate } from "./certificationService.js";
import { getGoLiveHistory, recordGoLiveEntry, updateGoLiveEntry } from "./goLiveHistoryService.js";
import { runProductionVerification } from "./goLiveVerificationService.js";
import { createGoLiveBackup, validateBackup, executeAutoRollback } from "./rollbackService.js";

export function checkGoLivePreconditions(db, runtimeRoot, currentEnv, companyId = null) {
  const issues = [];

  if (String(currentEnv || "").toLowerCase() !== "production") {
    issues.push({ key: "environment", label: "Environment must be Production", passed: false, detail: `Current: ${currentEnv}` });
  } else {
    issues.push({ key: "environment", label: "Environment set to Production", passed: true });
  }

  try {
    const envConfigPath = path.join(runtimeRoot, "environment-config.json");
    if (fs.existsSync(envConfigPath)) {
      const config = JSON.parse(fs.readFileSync(envConfigPath, "utf8"));
      const profile = config.verificationProfile || config.profile || "";
      if (String(profile).toLowerCase() !== "production") {
        issues.push({ key: "profile", label: "Verification profile must be Production", passed: false, detail: `Current: ${profile || "not set"}` });
      } else {
        issues.push({ key: "profile", label: "Verification profile set to Production", passed: true });
      }
    } else {
      issues.push({ key: "profile", label: "Verification profile must be Production", passed: false, detail: "Config file not found" });
    }
  } catch {
    issues.push({ key: "profile", label: "Verification profile must be Production", passed: false, detail: "Config read error" });
  }

  try {
    const readiness = calculateReadinessScore(db, runtimeRoot, companyId);
    if (readiness.status !== "Production Ready") {
      issues.push({ key: "readiness", label: "Readiness status must be Production Ready", passed: false, detail: `Status: ${readiness.status} (${readiness.score}%)${readiness.failedChecks?.length ? `. Still failing: ${readiness.failedChecks.join(", ")}` : ""}` });
    } else {
      issues.push({ key: "readiness", label: "Readiness status is Production Ready", passed: true, detail: `${readiness.score}%` });
    }
  } catch (err) {
    issues.push({ key: "readiness", label: "Readiness status must be Production Ready", passed: false, detail: err.message });
  }

  const allPassed = issues.every(i => i.passed);
  return { allPassed, issues };
}

export function previewGoLiveReset(db, runtimeRoot) {
  const preview = previewReset(db);
  const deps = analyzeDependencies(db);
  return { preview, dependencies: deps };
}

export function executeGoLiveReset(db, runtimeRoot, options = {}) {
  const resetOptions = typeof options === "object" && options ? options : { userId: options };
  const userId = resetOptions.userId || null;
  // The wizard checks these first, but the destructive path must not rely on the screen.
  const preconditions = checkGoLivePreconditions(db, runtimeRoot, resetOptions.currentEnv, Number(resetOptions.companyId || 0) || null);
  if (!preconditions.allPassed) {
    const failing = preconditions.issues.filter((issue) => !issue.passed).map((issue) => `${issue.label}${issue.detail ? ` (${issue.detail})` : ""}`);
    throw new Error(`Go-live reset refused: ${failing.join("; ")}. Fix these in Environment Manager, then retry. Nothing was changed.`);
  }
  const dependencies = analyzeDependencies(db);
  if (dependencies?.total?.blocked > 0) {
    throw new Error(`Go-live reset refused: dependency analysis found ${dependencies.total.blocked} blocked table(s). Open Environment Manager > Dependencies, fix the listed orphan rows, then retry. Nothing was changed.`);
  }
  const backup = createGoLiveBackup(runtimeRoot, db);
  const backupValidation = validateBackup(backup);
  if (!backupValidation?.valid) {
    throw new Error(`Go-live reset refused: the safety backup could not be verified (${backupValidation?.reason || "unknown reason"}). Check free disk space and the backups folder, then retry. Nothing was deleted.`);
  }

  const goLiveEntry = recordGoLiveEntry(runtimeRoot, {
    status: "in_progress",
    backup: {
      fileName: backup.fileName,
      path: backup.path,
      size: backup.size,
      createdAt: backup.createdAt
    },
    backupValidation,
    userId: userId || "system",
    currentEnv: "production"
  });

  const resetResult = executeEnhancedReset(db, runtimeRoot, resetOptions);

  const zeroState = rebuildZeroState(db, resetResult.company?.id || null);
  const zeroStatePassed = zeroState.warnings.length === 0;

  updateGoLiveEntry(runtimeRoot, goLiveEntry.id, {
    companyId: resetResult.company?.id || null,
    resetResult: {
      before: resetResult.before,
      after: resetResult.after,
      zeroState,
      zeroStatePassed,
      auditId: resetResult.auditId
    }
  });

  return {
    goLiveEntry,
    backup,
    backupValidation,
    resetResult,
    zeroState,
    zeroStatePassed
  };
}

export function verifyGoLiveProduction(db, runtimeRoot, userId, goLiveId) {
  const entry = getGoLiveHistory(runtimeRoot).find((item) => item.id === goLiveId);
  const verification = runProductionVerification(db, entry?.companyId || null);
  return { verification, goLiveId };
}

export function completeGoLive(db, runtimeRoot, userId, goLiveId) {
  // Re-run verification here; a result sent by the screen is never trusted.
  const entry = getGoLiveHistory(runtimeRoot).find((item) => item.id === goLiveId);
  if (!entry) throw new Error("Go-live completion refused: this go-live run was not found in the go-live history. Start go-live again from Environment Manager.");
  const verificationResult = runProductionVerification(db, entry.companyId || null);
  const allVerificationPassed = verificationResult.overallPassed === true;

  let certResult = null;
  if (allVerificationPassed) {
    certResult = generateGoLiveCertificate(db, runtimeRoot, userId, entry.companyId || null);
  }

  const updated = updateGoLiveEntry(runtimeRoot, goLiveId, {
    status: allVerificationPassed ? "completed" : "failed",
    verification: verificationResult,
    certificate: certResult?.certificate || null,
    completedAt: new Date().toISOString()
  });

  return {
    success: allVerificationPassed,
    verification: verificationResult,
    certificate: certResult?.certificate || null,
    certificateReportPath: certResult?.reportPath || null,
    goLiveEntry: entry
  };
}

export function failGoLiveWithRollback(runtimeRoot, goLiveId, reason, db, userId) {
  const entry = updateGoLiveEntry(runtimeRoot, goLiveId, { status: "rolling_back" });
  const rollbackResult = executeAutoRollback(runtimeRoot, entry, reason);
  updateGoLiveEntry(runtimeRoot, goLiveId, {
    status: rollbackResult.success ? "rolled_back" : "rollback_failed",
    rollback: rollbackResult,
    failureReason: reason
  });
  return { rollbackResult, reason };
}

export { previewGoLiveReset as previewGoLive };