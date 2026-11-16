# In-house audit, pass 7: architecture, commit 2dd78bc (return-receipts fix round 5)

- Date: 16 Nov 2026 IST
- Branch: `claude/erp-full-automation-qbhv8k`, commit `2dd78bc`
- Scope:
  - `git diff c524fb7..2dd78bc`, read against `audit-c524fb7-architecture.md` and `responses-c524fb7.md`.
  - The new module `src/main/database/returnReceiptLocks.js`, the `moneyIntegrityService.js` fold, and the `MoneyIntegrityPanel.jsx` line.
- Method:
  - Code reading. AGENTS.md rules 2, 3, 7 and 25.5.
  - A script checking the 23 KG-4 line numbers: 0 stale.
  - Searches of every knowledge graph for the module, the report field and the comparable ledger-guard items.
  - Verifiers, all passing:

| Verifier | Result |
|---|---|
| `verify-database-graph.js` | 32 passed, 0 failed |
| `verify-voucher-accounting-graph.js` | All checks passed |
| `verify-governance-graph-registry.js` | 53 PASS, 0 FAIL |
| `verify-audit-graph.js` | 27 passed, 0 failed |
| `verify-feature-function-graph.js` | 32 passed, 0 failed |

- Read-only.

## Verdict

- My c524fb7 findings L-1, L-2, I-1 and I-2 are all closed.
- **No High, Medium or Low findings.**
- **Two Info findings:**
  - I-1: DG-1 could point at the new module and the Health Center screen, as it does for `ledger_maintenance`.
  - I-2: the module repeats `migrationApplied` inline.
- Module placement, the panel and the graphs agree with AGENTS.md and with the ledger-guard precedent.

## Closure of c524fb7 findings

| Finding | Status | Evidence |
|---|---|---|
| L-1: problem states not surfaced to the owner | Closed | `moneyIntegrityService.js:175` runs `returnReceiptLockProblems(db)` live. `:193` folds `returnReceiptLocksOk` into `ok`. `:202` returns `return_receipt_locks` (null when all is in place). `MoneyIntegrityPanel.jsx:145-151` shows one line naming the problem and the next step. This is the same shape as `missing_guards` and `unexpected_triggers`. |
| L-2: `table_missing` written every start | Closed | `returnReceiptLocks.js:93-97` writes it through `logStateChange` (`:81-85`). It is written once when the problem appears and once when it clears (`{found: "table"}`), never on an unchanged start. Policy §6 `:83` now says "when it appears, changes or clears", which matches. |
| I-1: no "cleared" record | Closed | `logStateChange` treats "no entry yet" as the clear value. A cleared problem writes the empty lists (`:123`), so a returning problem differs from the last entry and is logged again. |
| I-2: single-name allow-list | Closed | `RETURN_RECEIPTS_TRIGGERS` (`returnReceiptLocks.js:11-12`) is an exported list next to the definitions, with the comment "Every trigger the app defines on or naming the table". This is the `LEDGER_GUARD_TRIGGERS` pattern. |

## Module placement and layering

- **Placement and the single definition.**
  - `src/main/database/returnReceiptLocks.js` sits next to `ledgerGuards.js` and follows its shape: definitions, a read-only problems function, and an `ensure*` start-up step.
  - The migration (`init.js:722`, `createReturnReceiptLocks`), the start-up step (`init.js:297`) and the service (`moneyIntegrityService.js:3`) import one definition. This closes the "two definitions could drift" concern from fc8a413 and c524fb7.
- **Import direction.** The service imports from the database layer, as it already does for `ledgerGuards.js`. `auditLog` is passed in, which avoids a cycle with `init.js`.
- **The panel only displays (AGENTS.md rule 7).**
  - It reads `report.return_receipt_locks` and picks one of four fixed sentences from fields the service computed.
  - It runs no SQL, makes no rule decision and adds no API call.
  - No IPC channel, preload method or route key changed. The field rides on the existing money integrity report.
  - `browserFallbackApi.js:1000` omits the field. The panel defaults it to `null`, so preview mode is unaffected.
- **`init.js`.** It loses 86 lines of lock logic. The KG-4 line numbers that moved (-74) are all refreshed and correct.
- **`backupBeforePendingMigration` suffix (`init.js:777-779`).** Small, scoped, and covered by the new replay test. It stays in `init.js` beside its caller.

## Graph, policy and code agreement

- **Policy §6 `:83`.** It matches the code on each point:
  - the comparison with the app's definitions;
  - the stray-trigger sweep;
  - the duplicate and table-name conflict exceptions;
  - the state log ("appears, changes or clears");
  - the missing table;
  - the Health Center line;
  - the module path.
- **DG-1 note (`:7615`).**
  - It matches the code: the unique index stays off for duplicates or a conflicting name, and this is reported in the audit log and the Health Center.
  - It does not mention the replaced-view repair, but that is an ordinary repair, which the note covers as "puts them back".
- **KG-4.**
  - `postStockReturn` is unchanged and correct.
  - The audit-event list already carries "stock return receipts backfilled".
  - The start-up actions are not posting events and correctly stay out.
- **Should a graph know the new module or the report field?**

| Graph | Needs the module or field? | Why |
|---|---|---|
| KG-4 | No | It maps posting functions. |
| FF-1 | No | It has no money integrity or ledger-guard entries. Its verifier passes. |
| RG-1 | No | It does not list `MoneyIntegrityPanel` or the report fields of any panel. |
| AG-1 | No | It does not catalogue the ledger start-up events either. |
| `repository/graph-registry.json` | No | DG-1's `sourceDirectories` already covers `src/main/database/`. |
| DG-1 `sourceFiles` | Optional | It does not list `ledgerGuards.js` either. |

- **DG-1 `relatedScreen`.** The one place a graph could reasonably know the change is DG-1's `relatedScreen` and note (I-1). This is optional and in line with how `ledger_maintenance` is described.

## Findings

### I-1 (Info): DG-1 could point at the new module and the Health Center screen, as it does for `ledger_maintenance`

- **Where:** `database-graph.json`, entry `stock_return_receipts`: `relatedScreen: null` (around `:7480`), and the note at `:7615`.
- **Precedent.** `ledger_maintenance` (`:11060-11083`) is the other table whose state the Money integrity panel reports. Its entry has:
  - `sourceFile: "src/main/database/ledgerGuards.js"`;
  - `relatedScreen: "screens/HealthCenter/MoneyIntegrityPanel.jsx"`;
  - a note that names the module.
- **This entry.** The table is still created in `init.js`, so `sourceFile` stays correct. The note names `ensureReturnReceiptLocks` but not the file it now lives in, and `relatedScreen` is null.
- **Suggested (values only):**
  - Set `relatedScreen` to `"screens/HealthCenter/MoneyIntegrityPanel.jsx"`.
  - Write "(ensureReturnReceiptLocks in returnReceiptLocks.js ...)" in the note.
- **Why only Info.** Nothing reads these fields as a constraint, and the function name can be searched for. No version bump is needed: these are values, not shape.

### I-2 (Info): `returnReceiptLocks.js` repeats `migrationApplied` inline

- **Where:** `returnReceiptLocks.js:50-51`, compared with `init.js:763-766` (`migrationApplied`).
- **Observation.** The module re-implements "has migration 039 run". This is presumably to avoid importing from `init.js`, which imports the module. The two copies are identical today. A later change to how applied migrations are read would have to be made twice.
- **Suggested, when either is next touched:** move `migrationApplied` into a small shared database helper, for example next to `runMigration`'s table helpers, or into `crudHelpers.js`, and import it in both places.

## Counts

- High: 0
- Medium: 0
- Low: 0
- Info: 2
