# FSR-2A.4V Verifier Termination Correction Report

Date: 2026-07-24  
Tester: Codex  
Status: PASS  

## Objective

Correct the Financial Statement Reporting (FSR) 2A.4 verifier lifecycle so
that all assertions complete, all SQLite database and temporary fixture
resources are released, Electron terminates without an external kill or
timeout, and the correct child exit status reaches both standalone callers and
the master Enterprise Resource Planning (ERP) verifier.

## Classification

- Primary category: Architecture
- Secondary categories: Verification, Accounting, Inventory
- Product maturity: Release Candidate verification control
- Dependencies satisfied: Yes
- Enterprise Intelligence Layer impact: None; no graph structure or registry
  changed

## Original Symptom

The reported failure state printed all 55 FSR-2A.4 assertions but did not
return control to the calling process. This caused the master `verify:erp`
runner to wait until its 600-second timeout even though the assertion output
looked complete.

The current working tree already contained an uncommitted partial cleanup
correction when this phase began, so the historical hang did not reproduce
during the pre-change audit. The baseline Git diff nevertheless showed the
resource ownership defect directly.

## Lifecycle Diagnosis

The verifier creates four isolated SQLite fixtures through
`initializeDatabase`:

- primary perpetual-inventory fixture
- Goods Received Not Invoiced (GRNI) clearing fixture
- zero-value inward rejection fixture
- supplier-return-after-invoice fixture

In the repository baseline, the second, third, and fourth database handles
were function-local constants and no `finally` block closed any of the four
handles or removed their temporary roots. Those native SQLite resources could
keep the Electron child alive after the final assertion had printed.

The package command also launched Electron directly, while the master runner
executed the JavaScript verifier through Node.js. That gave standalone and
master execution different entry paths and weakened exit-code ownership.

## Correction

### Database and temporary resources

- Retain all four database handles in the verifier lifecycle scope.
- Track all four temporary fixture roots.
- Close database handles in reverse order in `finally`.
- Remove fixture roots in reverse order after database closure.
- Convert every cleanup error into a failed verifier exit.

### Parent and Electron child

- Make `npm run verify:fsr2a4` start the Node.js parent.
- Let the parent synchronously launch the existing Electron child with an
  explicit `--electron-child` marker.
- Reject an Electron invocation that lacks the marker.
- Report spawn errors and signal termination.
- Propagate the Electron child status to the Node.js parent unchanged.
- Call `app.exit(finalExitCode)` only after `run()` completes its `finally`
  cleanup.

### Result contract

Successful completion prints exactly:

`FSR-2A.4 CERTIFIED — PERPETUAL INVENTORY ACCOUNTING CONTROLS PASS`

Failed completion prints exactly:

`FSR-2A.4 NOT CERTIFIED — INVENTORY ACCOUNTING DEFECTS REMAIN`

## Files Changed

- `scripts/verify-fsr-2a4.js`
- `package.json`
- `docs/architecture/fsr-2a4-verifier-termination-correction-report.md`

No production accounting, inventory, GRNI, Cost of Goods Sold (COGS),
reversal, renderer, Inter-Process Communication (IPC), preload, migration, or
database-schema behavior changed.

## Verification Evidence

### Standalone success

| Run | Assertions | Exit | Duration | Residual Node/Electron | Residual fixture roots |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 55 passed, 0 failed | 0 | 3,276 ms | 0 | 0 |
| 2 | 55 passed, 0 failed | 0 | 6,697 ms | 0 | 0 |
| Ordered regression rerun | 55 passed, 0 failed | 0 | completed | 0 | 0 |

Each run reported removal of all four temporary database roots and returned
control without a timeout or forced process termination.

### Controlled failure

A temporary verifier-only environment-gated assertion was introduced for one
test run and then removed.

- Result: 55 passed, 1 deliberately failed, 56 total
- Child and parent exit code: 1
- Duration: 3,813 ms
- Required NOT CERTIFIED message: present
- Database and temporary-root cleanup: PASS
- Residual Node.js or Electron processes: 0
- Residual fixture roots: 0
- Temporary failure code remaining in source: No

This proves the failure path returns nonzero, cleans resources, and does not
hang.

### Ordered FSR regression

| Command | Result |
| --- | --- |
| `npm.cmd run verify:fsr2a5c` | PASS - 34/34 |
| `npm.cmd run verify:fsr2a5b` | PASS - 89/89 |
| `npm.cmd run verify:fsr2a5a` | PASS - 81/81 |
| `npm.cmd run verify:fsr2a4` | PASS - 55/55 |
| `npm.cmd run verify:fsr2a3` | PASS - 37/37 |
| `npm.cmd run verify:fsr2a2` | PASS - 25/25 |
| `npm.cmd run verify:fsr2a1` | PASS - 22/22 |

### FSR-1 governed boundary

`npm.cmd run verify:financial-reports` produced the expected governed result:
23 passed, 2 failed, 25 total.

Only these assigned FSR-2B findings remain:

- Check 9: no governed account-group/report-mapping registry
- Check 16: renderer assigns financial classifications heuristically

No other FSR-1 check failed.

### Master runner, syntax, and build

| Command | Result |
| --- | --- |
| `npm.cmd run verify:erp` | PASS WITH WARNINGS - exit 0 in 85,540 ms |
| Master residual Node.js/Electron processes | PASS - 0 |
| `npm.cmd run lint:syntax` | PASS |
| `npm.cmd run build` | PASS - 259 modules transformed |

The master warning is the governed FSR-1 Checks 9 and 16 boundary. Two
non-fatal JSON schema messages about the `date-time` format were also printed;
they did not change the master result.

## Control Results

| Control | Result |
| --- | --- |
| Assertions | PASS |
| Database cleanup | PASS |
| Temporary-file cleanup | PASS |
| Electron shutdown without external termination | PASS |
| Parent exit propagation | PASS |
| Failure path | PASS |
| Master completion | PASS |
| FSR-1 | PASS WITH WARNINGS |
| Full FSR regression | PASS |
| Syntax | PASS |
| Build | PASS |

## Impact Assessment

- Services added or changed: None
- Components added or changed: None
- Reports or financial queries changed: None
- IPC/preload impact: None
- Route/view-key impact: None
- Database/schema/migration impact: None
- Accounting and inventory business logic preserved: Yes
- Desktop smoke test: Not applicable; this phase changes headless verifier
  process ownership only

## Known Limitations

- FSR-1 Checks 9 and 16 remain intentionally assigned to FSR-2B.
- The wider working tree contains uncommitted FSR-2A lock and integration work
  that predates this correction. It was preserved and was not staged.
- This phase did not commit, push, tag, package, or begin FSR-2B.

## Lock Decision

- Production readiness gate: PASS WITH WARNINGS
- FSR-2A.4 verifier safe to lock: Yes
- Wider ERP release safe to lock: No; use the existing formal programme gate
  and resolve its assigned release conditions

## Final Recommendation

FSR-2A AUTOMATED CERTIFICATION LOCK READY — PROCEED TO FORMAL STABILIZATION AND EXECUTIVE ARCHITECTURE GATE
