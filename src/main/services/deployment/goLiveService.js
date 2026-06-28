import fs from "node:fs";
import path from "node:path";
import { previewReset, analyzeDependencies, rebuildZeroState, executeEnhancedReset } from "../operationalResetService.js";
import { calculateReadinessScore } from "./readinessService.js";
import { generateGoLiveCertificate } from "./certificationService.js";
import { recordGoLiveEntry, updateGoLiveEntry } from "./goLiveHistoryService.js";
import { runProductionVerification } from "./goLiveVerificationService.js";
import { createGoLiveBackup, validateBackup, executeAutoRollback } from "./rollbackService.js";

export function checkGoLivePreconditions(db, runtimeRoot, currentEnv) {
  const issues = [];

  if (currentEnv !== "production") {
    issues.push({ key: "environment", label: "Environment must be Production", passed: false, detail: `Current: ${currentEnv}` });
  } else {
    issues.push({ key: "environment", label: "Environment set to Production", passed: true });
  }

  try {
    const envConfigPath = path.join(runtimeRoot, "environment-config.json");
    if (fs.existsSync(envConfigPath)) {
      const config = JSON.parse(fs.readFileSync(envConfigPath, "utf8"));
      if (config.profile !== "Production") {
        issues.push({ key: "profile", label: "Verification profile must be Production", passed: false, detail: `Current: ${config.profile}` });
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
    const readiness = calculateReadinessScore(db, runtimeRoot);
    if (readiness.status !== "Production Ready") {
      issues.push({ key: "readiness", label: "Readiness status must be Production Ready", passed: false, detail: `Status: ${readiness.status} (${readiness.score}%)` });
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

export function executeGoLiveReset(db, runtimeRoot, userId) {
  const backup = createGoLiveBackup(runtimeRoot);
  const backupValidation = validateBackup(backup);

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

  const resetResult = executeEnhancedReset(db, runtimeRoot, userId);

  const zeroState = rebuildZeroState(db);
  const zeroStatePassed = zeroState.warnings.length === 0;

  updateGoLiveEntry(runtimeRoot, goLiveEntry.id, {
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
  const verification = runProductionVerification(db, "production");
  return { verification, goLiveId };
}

export function completeGoLive(db, runtimeRoot, userId, goLiveId, verificationResult) {
  const allVerificationPassed = verificationResult?.overallPassed === true;

  let certResult = null;
  if (allVerificationPassed) {
    certResult = generateGoLiveCertificate(db, runtimeRoot, userId);
  }

  const entry = updateGoLiveEntry(runtimeRoot, goLiveId, {
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
    status: "rolled_back",
    rollback: rollbackResult,
    failureReason: reason
  });
  return { rollbackResult, reason };
}

export { previewGoLiveReset as previewGoLive };