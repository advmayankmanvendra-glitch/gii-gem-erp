# FSR-2A Full Verification Matrix

**Date:** 2026-07-24
**Branch:** `phase-16-enterprise-crm-integration`
**Baseline HEAD:** `ec197bebb7b2c6ad86801bc67060e4638c2eeace`
**Overall technical result:** PASS WITH WARNINGS

## Focused FSR Reproduction

All commands were run sequentially. Fixture databases were created below the
Windows `%TEMP%` directory with the listed unique prefix and removed at
termination. A post-run scan found zero remaining roots for every prefix.

| Command | Exit | Passed | Failed | Duration | Temporary root prefix | Cleanup |
|---|---:|---:|---:|---:|---|---|
| `npm.cmd run verify:fsr2a5c` | 0 | 34 | 0 | 22.387s | `gii-gem-fsr2a5c-*` | PASS |
| `npm.cmd run verify:fsr2a5b` | 0 | 89 | 0 | 6.573s | `gii-gem-fsr2a5b-*` | PASS |
| `npm.cmd run verify:fsr2a5a` | 0 | 81 | 0 | 11.375s | `gii-gem-fsr2a5a-*` | PASS |
| `npm.cmd run verify:fsr2a4` | 0 | 55 | 0 | 8.454s | `gii-gem-fsr2a4*` | PASS, 4 roots removed |
| `npm.cmd run verify:fsr2a3` | 0 | 37 | 0 | 9.047s | `gii-gem-fsr2a3*` | PASS, 5 roots removed |
| `npm.cmd run verify:fsr2a2` | 0 | 25 | 0 | 6.463s | `gii-gem-fsr2a2-*` | PASS |
| `npm.cmd run verify:fsr2a1` | 0 | 22 | 0 | 6.819s | `gii-gem-fsr2a1-*` | PASS |
| `npm.cmd run verify:financial-reports` | 1 | 23 | 2 | about 7.2s | populated temporary fixture | PASS WITH WARNINGS |

`verify:financial-reports` intentionally retains exactly two FSR-2B findings:

1. Check 9: no governed account-group/report-mapping registry.
2. Check 16: renderer assigns financial classifications heuristically.

Check 20 passed the populated authoritative minor-unit contract. No other
financial-report failure remained.

## Complete ERP Regression

| Command | Exit | Result | Duration / evidence |
|---|---:|---|---|
| `npm.cmd run lint:syntax` | 0 | PASS | 6.533s |
| `npm.cmd run build` | 0 | PASS | 13.010s; 259 modules |
| `npm.cmd run verify:knowledge` | 0 | PASS | 5.700s; 167 entries, 0 errors, 0 warnings |
| `npm.cmd run verify:audit` | 0 | PASS | 5.862s; 204 pass |
| `npm.cmd run verify:accounting` | 0 | PASS | 5.750s |
| `npm.cmd run verify:financials` | 0 | PASS | 5.772s |
| `npm.cmd run verify:controls` | 0 | PASS | 6.888s; 12/12 |
| `npm.cmd run verify:voucher-inventory` | 0 | PASS | 6.519s |
| `npm.cmd run verify:flow` | 0 | PASS | 6.533s |
| `npm.cmd run verify:phase10` | 0 | PASS | 6.211s |
| `npm.cmd run verify:operational-stages` | 0 | PASS | 6.491s |
| `npm.cmd run verify:entity-picker` | 0 | PASS | 5.324s; 103/103 |
| `npm.cmd run verify:database-graph` | 0 | PASS | 5.263s; 27 pass |
| `npm.cmd run verify:voucher-accounting-graph` | 0 | PASS | 5.435s |
| `npm.cmd run verify:workflow-graph` | 0 | PASS | 5.292s; 21 pass |
| `npm.cmd run verify:workflow-enforcement` | 0 | PASS | 5.582s; 62 pass |
| `npm.cmd run verify:safe-delete` | 0 | PASS | 6.332s; 26 pass |
| `npm.cmd run verify:fk-constraints` | 0 | PASS | 6.299s; 5 pass |
| `npm.cmd run verify:production-readiness-sql` | 0 | PASS | 6.157s; 15 pass |
| `npm.cmd run verify:erp` | 0 | PASS WITH WARNINGS | 81.9s wall-clock; final summary reached |

The master runner executed 27 steps, returned exit code 0, and generated
`reports/verify-erp-report.md`. The generated report is excluded by the
repository's existing `reports/*` ignore rule. It visibly preserves the two
known FSR-2B warnings and promotes any different FSR-1 failure set to a
blocking failure. It reports `Working Tree Clean: No` and `Safe to Lock: No`.

The graph-validation stack emitted two non-fatal
`unknown format "date-time" ignored` messages. The affected graph verifiers
still returned exit code 0 with no failed checks.

## Environment Boundaries

- Database verifiers used script-owned disposable SQLite fixtures.
- The manual Electron smoke used
  `runtime/fsr2a-lock-smoke-20260724`, not an operational database.
- No production database, backup, installer, or release artifact was modified.
- `npm.cmd run dist:win` was not run.

## Final Matrix

| Required gate | Result |
|---|---|
| Clean Baseline | FAILED |
| FSR-2A.1 Reproduction | PASS |
| FSR-2A.2 Reproduction | PASS |
| FSR-2A.3 Reproduction | PASS |
| FSR-2A.4 Reproduction | PASS |
| FSR-2A.5A Reproduction | PASS |
| FSR-2A.5B Reproduction | PASS |
| FSR-2A.5C Reproduction | PASS |
| Populated Accounting Evidence | PASS |
| Full ERP Regression | PASS |
| Renderer Build | PASS |
| Electron Desktop Smoke Test | PASS |
| Historical Risk Separation | PASS |
| RMD-1 Release Boundary | PASS |
| Source-of-Truth Lock | PASS |
| Restore Plan | PASS |
| Executive Architecture Gate | BLOCKED |

The clean-baseline result is FAILED because the stabilization corrections and
lock documentation have not yet been committed. This is a governance blocker,
not an accounting verification failure.
