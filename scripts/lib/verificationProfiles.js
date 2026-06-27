import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROFILES = {
  development: {
    name: "Development",
    expects: {
      vouchers: true,
      ledgerEntries: true,
      receivables: true,
      payables: true,
      stockMovements: true,
      gstValues: true
    },
    checks: {
      accounts: "atLeast15",
      vouchers: "greaterThanZero",
      ledgerEntries: "greaterThanZero",
      cashBankEntries: "greaterThanZero",
      receivables: "greaterThanZero",
      payables: "greaterThanZero",
      inputGst: "greaterThanZero",
      outputGst: "greaterThanZero"
    },
    description: "Seeded development data — expects vouchers, ledger entries, receivables, payables, stock and GST values to exist."
  },
  testing: {
    name: "Testing",
    expects: {
      vouchers: true,
      ledgerEntries: true,
      receivables: true,
      payables: true,
      stockMovements: true,
      gstValues: true
    },
    checks: "development",
    description: "Testing environment — same expectations as development."
  },
  training: {
    name: "Training",
    expects: {
      vouchers: true,
      ledgerEntries: true,
      receivables: true,
      payables: true,
      stockMovements: true,
      gstValues: true
    },
    checks: "development",
    description: "Training environment — same expectations as development."
  },
  production: {
    name: "Production",
    expects: {
      vouchers: false,
      ledgerEntries: false,
      receivables: false,
      payables: false,
      stockMovements: false,
      gstValues: false
    },
    checks: {
      trialBalance: "mustBeZero",
      gstDifference: "mustBeZero",
      receivablesCount: "mustBeZero",
      payablesCount: "mustBeZero"
    },
    description: "Clean production database — accepts zero operational records provided trial balance and GST are balanced."
  },
  migration: {
    name: "Migration",
    expects: {
      vouchers: false,
      ledgerEntries: false,
      receivables: false,
      payables: false,
      stockMovements: false,
      gstValues: false
    },
    checks: {
      migratedRecords: "any",
      mappingComplete: "mustBeTrue",
      noOrphans: "mustBeTrue",
      accountingBalance: "mustBeZero",
      inventoryBalance: "mustBeZero"
    },
    description: "Post-import/migration verification — validates mapping completeness, no orphans, balanced accounting."
  },
  smoke_test: {
    name: "Smoke Test",
    expects: {
      vouchers: true,
      ledgerEntries: true,
      receivables: true,
      payables: true,
      stockMovements: true,
      gstValues: false
    },
    checks: "development",
    description: "Quick smoke test — expects basic operational records but allows zero GST."
  }
};

export function getProfile(name) {
  const key = (name || "development").toLowerCase().replace(/[\s-]+/g, "_");
  if (PROFILES[key]) return { key, ...PROFILES[key] };
  console.warn(`Unknown profile "${name}", falling back to development`);
  return { key: "development", ...PROFILES.development };
}

export function acceptProductionZeroState(results) {
  return {
    trialBalanceDifference: results.trialBalanceDifference === 0,
    gstDifference: results.gstDifference === 0,
    receivablesZero: results.receivablesCount === 0,
    payablesZero: results.payablesCount === 0,
    passed: results.trialBalanceDifference === 0
  };
}

export function parseProfileArgs() {
  let profile = process.env.VERIFY_PROFILE || "development";
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[i + 1];
      i++;
    }
  }
  return getProfile(profile);
}
