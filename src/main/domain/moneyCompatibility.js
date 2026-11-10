import { hasAllShadowColumns, reconcileAll } from "../database/moneyMigration.js";

export const MIGRATION_STATES = {
  NOT_MIGRATED: "not_migrated",
  MIGRATED_NO_DATA: "migrated_no_data",
  MIGRATED_AGREES: "migrated_agrees",
  MIGRATED_DISAGREES: "migrated_disagrees",
};

export function getMigrationState(db) {
  const hasColumns = hasAllShadowColumns(db);
  if (!hasColumns) return MIGRATION_STATES.NOT_MIGRATED;
  const disagreements = reconcileAll(db);
  const total = disagreements.reduce((sum, d) => sum + d.disagreements.length, 0);
  if (total === 0) return MIGRATION_STATES.MIGRATED_AGREES;
  return MIGRATION_STATES.MIGRATED_DISAGREES;
}

export function isMinorAuthoritative(state) {
  return state === MIGRATION_STATES.MIGRATED_AGREES || state === MIGRATION_STATES.MIGRATED_NO_DATA;
}

export function getDisagreementPolicy(disagreements) {
  const total = disagreements.reduce((sum, d) => sum + d.disagreements.length, 0);
  if (total === 0) return { severity: "none", action: "pass", details: [] };
  return {
    severity: total > 0 ? "high" : "none",
    action: total === 0 ? "pass" : total <= 10 ? "warn" : "block",
    details: disagreements,
    message: total > 0
      ? `${total} legacy/minor disagreement(s) found. Open Health Center > Error Console > Money integrity for the rows.`
      : undefined
  };
}

export function checkMoneyIntegrity(db) {
  const state = getMigrationState(db);
  const hasColumns = state !== MIGRATION_STATES.NOT_MIGRATED;
  const disagreements = hasColumns ? reconcileAll(db) : [];
  const policy = getDisagreementPolicy(disagreements);
  return {
    migrationState: state,
    shadowColumnsPresent: hasColumns,
    disagreementCount: disagreements.reduce((sum, d) => sum + d.disagreements.length, 0),
    disagreements,
    policy,
    isAuthoritative: isMinorAuthoritative(state),
    recommendation: isMinorAuthoritative(state) ? "trust_minor" : "trust_legacy_with_warning",
  };
}
