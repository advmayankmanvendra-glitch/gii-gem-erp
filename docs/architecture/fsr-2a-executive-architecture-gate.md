# FSR-2A Executive Architecture Gate

**Date:** 2026-07-24
**Decision:** BLOCKED
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
| Clean reviewed lock commit | FAILED |
| Governed restore tag | NOT STARTED |

## Decision

**BLOCKED FROM FSR-2B**

The technical evidence satisfies the criteria for `APPROVED WITH CONDITIONS FOR
FSR-2B`, but Permanent Architecture Rule 27 also requires a completed lock
report, clean lock baseline, and restore point. The evidence pack and
stabilization corrections are presently uncommitted, and the work order
requires separate authorization before commit, push, or tag.

## Conditions Required To Lift The Block

1. Independently review the final diff.
2. Commit only the intended stabilization and lock-document files.
3. Confirm the working tree is clean and HEAD is the lock commit.
4. Create and verify the annotated tag
   `fsr-2a-accounting-truth-lock-2026-07-24`.
5. Push the branch and tag only with owner authorization.
6. Update this decision to `APPROVED WITH CONDITIONS FOR FSR-2B`.

After those steps, FSR-2B must:

- preserve every FSR-2A source-of-truth contract;
- perform no historical migration;
- perform no production release packaging;
- add no renderer financial arithmetic;
- reintroduce no name-based backend classification; and
- leave release approval blocked until separate RMD-1 certification.

## Executive Recommendation

**FSR-2A LOCK NOT APPROVED — STABILIZATION OR RELEASE-BOUNDARY DEFECTS REMAIN**
