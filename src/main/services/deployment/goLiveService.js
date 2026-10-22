import fs from "node:fs";
import path from "node:path";
import { previewReset, analyzeDependencies, rebuildZeroState, executeEnhancedReset, GO_LIVE_RESET_MODULE } from "../operationalResetService.js";
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
  // The person must have typed GO-LIVE themselves; the screen cannot supply it for them.
  if (String(resetOptions.confirmText || "").trim() !== "GO-LIVE") {
    throw new Error("Go-live reset refused: type GO-LIVE in the confirmation box of the Go-Live wizard, then retry. Nothing was changed.");
  }
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
    currentEnv: "production",
    // Where this run starts in the audit trail; the rollback guard finds this run's own
    // reset row after it even if the later history update is lost.
    auditIdAtStart: Number(db.prepare("SELECT COALESCE(MAX(id), 0) id FROM audit_log").get().id || 0),
    companyId: Number(resetOptions.companyId || 0) || null
  });

  let resetResult;
  try {
    resetResult = executeEnhancedReset(db, runtimeRoot, { ...resetOptions, confirmText: "RESET" });
  } catch (error) {
    // Leave a truthful history entry; the reset runs in one transaction, so the books are unchanged.
    // resetFailed marks "the books were not touched", so rollback has nothing to undo.
    updateGoLiveEntry(runtimeRoot, goLiveEntry.id, { status: "failed", resetFailed: true, failureReason: error.message, completedAt: new Date().toISOString() });
    throw error;
  }

  const zeroState = rebuildZeroState(db, resetResult.company?.id || null);
  const zeroStatePassed = zeroState.warnings.length === 0;

  updateGoLiveEntry(runtimeRoot, goLiveEntry.id, {
    companyId: resetResult.company?.id || null,
    highWater: bookHighWater(db),
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

const ROLLBACK_ALLOWED_STATUSES = new Set(["in_progress", "failed", "rollback_failed"]);

// Tables whose rows are not books: logs, review trails and schema bookkeeping. A new
// row in any other table, or an audited change to one, means real work was entered
// after the go-live reset.
const NOT_BOOK_TABLES = new Set(["audit_log", "schema_migrations", "feedback_log", "allocation_audit", "voucher_proposal_audit", "sqlite_sequence"]);

// Audit rows that record a look or a refusal, not a change; they must not block rollback.
const READ_ONLY_AUDIT_ACTIONS = ["voucher drilldown access", "document view", "document download", "master_data_export", "master_data_template_download", "permission_denied", "bank_statement_direct_post_blocked"];

function bookTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    .map((row) => row.name)
    .filter((name) => !NOT_BOOK_TABLES.has(name) && db.prepare(`PRAGMA table_info(${name})`).all().some((column) => column.name === "id"));
}

export function bookHighWater(db) {
  const tables = Object.fromEntries(bookTables(db).map((table) => [table, Number(db.prepare(`SELECT COALESCE(MAX(id), 0) id FROM ${table}`).get().id || 0)]));
  const auditId = Number(db.prepare("SELECT COALESCE(MAX(id), 0) id FROM audit_log").get().id || 0);
  return { tables, auditId };
}

// The id of this go-live run's own reset audit row (the first go-live reset of its company
// after the run started), or null when the books show no such reset.
function resetAuditIdFor(db, entry) {
  const companyId = Number(entry.companyId || 0) || null;
  if (Number.isInteger(entry.auditIdAtStart)) {
    return db.prepare(`
      SELECT id FROM audit_log
      WHERE id > ? AND action = 'operational_reset' AND module = ? AND (? IS NULL OR company_id = ?)
      ORDER BY id LIMIT 1
    `).get(entry.auditIdAtStart, GO_LIVE_RESET_MODULE, companyId, companyId)?.id || null;
  }
  // Entries written before 2026-10-23 have no audit position; fall back to the start time.
  const since = String(entry.generatedAt || "").slice(0, 19).replace("T", " ");
  if (!since) return null;
  return db.prepare(`
    SELECT id FROM audit_log
    WHERE created_at >= ? AND action = 'operational_reset' AND module = ? AND (? IS NULL OR company_id = ?)
    ORDER BY id LIMIT 1
  `).get(since, GO_LIVE_RESET_MODULE, companyId, companyId)?.id || null;
}

// Called with the live database open, before the rollback closes it. Restoring the
// pre-go-live backup would erase anything entered after the reset, so that is refused.
export function assertGoLiveRollbackSafe(db, runtimeRoot, goLiveId) {
  const history = getGoLiveHistory(runtimeRoot);
  // The history checks come first, so a completed or unknown run gets its own reason.
  const refusal = rollbackRefusalReason(history, goLiveId);
  if (refusal) throw new Error(refusal);
  const entry = history.find((item) => item.id === goLiveId);
  let mark;
  let compared;
  const now = bookHighWater(db);
  if (entry.highWater?.tables) {
    mark = entry.highWater;
    compared = Object.keys(now.tables);
  } else if (entry.highWater) {
    // Entries written before 2026-10-23 hold a flat { table: maxId } map of five tables,
    // so only those can be compared.
    // Audited edits after the reset's own audit row are checked as well.
    mark = { tables: entry.highWater, auditId: resetAuditIdFor(db, entry) };
    compared = Object.keys(mark.tables).filter((table) => table in now.tables);
  } else {
    // The history update that stores the mark was lost (for example to a locked file).
    // The reset's own audit row in the database is the mark instead: any audited record
    // write after it is work the rollback would erase.
    const reset = resetAuditIdFor(db, entry);
    if (!reset) {
      throw new Error(`Rollback refused: go-live ${entry.goliveNumber || goLiveId} has no record of a reset in the books, so there is nothing to roll back. Nothing was changed.`);
    }
    // Count from where the run started, not from the reset row: another reset that writes
    // the same kind of row must not hide work entered before it.
    mark = { tables: {}, auditId: Number.isInteger(entry.auditIdAtStart) ? entry.auditIdAtStart : reset };
    compared = [];
  }
  const grown = new Set(compared.filter((table) => now.tables[table] > Number(mark.tables[table] || 0)));
  if (mark.auditId) {
    // Edits and deletes add no rows, but every record write leaves an audit row naming its table.
    const tables = new Set(Object.keys(now.tables));
    db.prepare(`
      SELECT DISTINCT table_name FROM audit_log
      WHERE id > ? AND table_name IS NOT NULL AND action NOT LIKE 'ui:%'
        AND action NOT IN (${READ_ONLY_AUDIT_ACTIONS.map(() => "?").join(", ")})
    `).all(Number(mark.auditId || 0), ...READ_ONLY_AUDIT_ACTIONS)
      .forEach((row) => { if (tables.has(row.table_name) && row.table_name !== "users") grown.add(row.table_name); });
  }
  if (grown.size) {
    throw new Error(`Rollback refused: ${[...grown].sort().join(", ").replaceAll("_", " ")} changed after go-live ${entry.goliveNumber || goLiveId}. Restoring the pre-go-live backup would erase that work. To return to an older state anyway, use Backup & Restore, which keeps a safety copy. Nothing was changed.`);
  }
}

// Why a rollback of this run is refused by its history entry alone, or null.
function rollbackRefusalReason(history, goLiveId) {
  const current = history.find((item) => item.id === goLiveId);
  if (!current) return "Rollback refused: this go-live run was not found in the go-live history. Nothing was changed.";
  // A completed or superseded go-live has live books on top of it; restoring its
  // pre-go-live backup would silently erase them.
  if (!ROLLBACK_ALLOWED_STATUSES.has(current.status)) {
    return `Rollback refused: go-live ${current.goliveNumber || goLiveId} is ${current.status}. Only a go-live that is still in progress or failed can be rolled back. To return to an older state, use Backup & Restore. Nothing was changed.`;
  }
  // Only a run known to have stopped before or inside the (single-transaction) reset is
  // refused. A run whose reset finished but whose history update was lost, for example
  // to a locked file, has no resetResult yet still needs its rollback.
  if (!current.resetResult && (current.resetFailed || current.status === "failed")) {
    return `Rollback refused: go-live ${current.goliveNumber || goLiveId} never reset the books (${current.failureReason || "it stopped before the reset"}), so there is nothing to roll back. Nothing was changed.`;
  }
  if (history[0]?.id !== goLiveId) {
    return `Rollback refused: go-live ${current.goliveNumber || goLiveId} is not the latest go-live run. Nothing was changed.`;
  }
  return null;
}

export function failGoLiveWithRollback(runtimeRoot, goLiveId, reason, db, userId) {
  const refusal = rollbackRefusalReason(getGoLiveHistory(runtimeRoot), goLiveId);
  if (refusal) return { rollbackResult: { success: false, reason: refusal }, reason };
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