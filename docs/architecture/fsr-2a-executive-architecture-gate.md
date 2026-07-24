# FSR-2A Executive Architecture Gate

**Date:** 2026-07-24
**Decision:** APPROVED WITH CONDITIONS FOR FSR-2B
**Scope:** FSR-1 and FSR-2A.1 through FSR-2A.5C
**Next programme:** FSR-2B Chart of Accounts and Financial-Statement Mapping

## Scope Reviewed

- Original FSR-1 architecture, report, fixture, and risk evidence
- FSR-2A.1 through FSR-2A.5C implementation and focused verifiers
- Populated accounting and migration fixtures
- Trial Balance, Profit and Loss, Balance Sheet, inventory/GL, party-control,
  opening, carry-forward, and minor-unit contracts
- Full ERP verification chain and master verification report
- Electron desktop accounting smoke test
- FSR-R18 and FSR-R19 historical boundaries
- RMD-1 release and migration dependency
- Current Git branch, commit, upstream, stash, and working-tree state

## Findings

### Certified Controls

- Governed balanced posting and exact voucher/ledger equality
- Company and financial-year isolation
- Draft and cancelled voucher exclusion
- Signed balance and contra-account treatment
- Governed openings and financial-year carry-forward
- Inventory subledger and GL reconciliation
- GRNI clearing and single COGS recognition
- Party control-account reconciliation
- INTEGER minor-unit authority and report preference
- Trial Balance, Profit and Loss, and Balance Sheet equality
- Ledger and voucher drill-down
- Manual desktop behavior on a populated disposable database

### Open Architecture Gaps

- FSR-1 Check 9: governed account-group/report mapping is absent.
- FSR-1 Check 16: renderer financial classification remains heuristic.
- These are assigned to FSR-2B and do not invalidate the certified accounting
  amounts.

### Historical Risks

- FSR-R18 remains OPEN for historical inventory/GL and Purchase/COGS data.
- FSR-R19 remains OPEN for historical production money migration.
- No production database was assessed, migrated, backfilled, or certified.

### Release Blockers

- RMD-1 is not implemented and certified.
- Production packaging and release remain BLOCKED.
- Mixed-version and downgrade safety are not certified.

### Non-Blocking Warning

Electron emitted only the standard development Content Security Policy warning.
No fatal runtime error appeared.

## Gate Criteria

| Criterion | Result |
|---|---|
| Focused FSR verification | PASS |
| Full ERP regression | PASS |
| Renderer build | PASS |
| Electron desktop smoke | PASS |
| Only assigned mapping/classification gaps remain | PASS |
| Accounting truth protected from FSR-2B | PASS |
| Final lock commit containing this gate | IN PROGRESS |
| Governed restore-tag activation | IN PROGRESS |

## Decision

**FSR-2A ACCOUNTING TRUTH CERTIFIED AND LOCKED — APPROVED WITH CONDITIONS FOR FSR-2B**

The accounting source-of-truth contract is certified and locked. Approval for
FSR-2B becomes effective only after the annotated restore tag
`fsr-2a-accounting-truth-lock-2026-07-24` points to the lock commit containing
this completed gate and is pushed.

The tag name is the stable restore-point identity. This gate intentionally does
not record the lock commit's own hash.

## Effective Condition

1. Commit the reviewed lock document set.
2. Confirm the working tree is clean and HEAD is that lock commit.
3. Confirm the annotated tag
   `fsr-2a-accounting-truth-lock-2026-07-24` points to that lock commit.
4. Push the branch and annotated tag with owner authorization.
5. Verify the remote branch and annotated tag resolve to that lock commit.

After the effective condition is satisfied, FSR-2B must:

- preserve every FSR-2A source-of-truth contract;
- perform no historical migration;
- perform no production release packaging;
- add no renderer financial arithmetic;
- reintroduce no name-based backend classification; and
- leave release approval blocked until separate RMD-1 certification.

FSR-R18 remains OPEN. FSR-R19 remains OPEN. RMD-1 remains BLOCKED. Production
packaging and release remain BLOCKED. Renderer grouping remains
presentation-only and may not replace the locked accounting authority.

## Executive Recommendation

**FSR-2A ACCOUNTING TRUTH CERTIFIED AND LOCKED — APPROVED WITH CONDITIONS FOR FSR-2B**
