# FSR-2A Historical Risk Boundary

**Date:** 2026-07-24
**Assessment mode:** Read-only
**Result:** PASS
**Historical remediation status:** NOT STARTED

## Governing Distinction

FSR-2A certifies prospective application behavior and controlled temporary
migration fixtures. It does not certify that historical production records were
created under those controls or that legacy records reconcile to the new
accounting model.

No production database was opened, changed, backfilled, or certified during
FSR-2A-L1.

## FSR-R18

**Risk:** Historical inventory/General Ledger (GL) and Purchase/Cost of Goods
Sold (COGS) remediation.

| Required assessment | Position |
|---|---|
| Affected legacy data | Stock movements, inventory purchases, supplier invoices, Inventory GL, Goods Received Not Invoiced, COGS, returns, adjustments, and reversals created before the certified FSR-2A.4 paths |
| Read-only assessment | NOT STARTED on production data |
| Migration/backfill | NOT STARTED |
| Production execution | NOT STARTED |
| Approval | Separate owner authorization required |
| Rollback | Verified pre-change backup plus governed reversal/adjustment plan required |
| Release impact | BLOCKED where applicable historical records exist and remain unreconciled |
| FSR-2B impact | Does not block architecture work after the FSR-2A lock; FSR-2B must not remediate this data |
| Production packaging | BLOCKED pending assessed release scope and RMD-1 controls |
| Internal testing | PASS WITH WARNINGS on disposable or approved non-production data |

The prospective inventory paths are certified. FSR-R18 remains OPEN because no
historical reconciliation or governed adjustment pack exists.

## FSR-R19

**Risk:** Historical production money migration and reconciliation.

| Required assessment | Position |
|---|---|
| Affected legacy data | Legacy REAL money in vouchers, ledger entries, openings, carry-forward, accounts, and stock ledger before migration 034 |
| Read-only assessment | NOT STARTED on production data |
| Migration/backfill | Certified only on temporary fixtures; production backfill NOT STARTED |
| Production execution | NOT STARTED |
| Approval | Separate owner authorization required |
| Rollback | Verified pre-migration backup and compatibility manifest required |
| Release impact | BLOCKED until migration and reconciliation are governed |
| FSR-2B impact | Does not block architecture work after the FSR-2A lock; FSR-2B must not run this migration programme |
| Production packaging | BLOCKED by this risk and RMD-1 |
| Internal testing | PASS WITH WARNINGS on fresh/disposable databases |

The prospective INTEGER minor-unit contract is certified. FSR-R19 remains OPEN
because no historical production database has been backfilled and reconciled.

## Required Future Remediation Sequence

```text
Owner authorization
  -> read-only inventory and money assessment
  -> verified external backup
  -> dry-run reconciliation report
  -> exception and disagreement review
  -> approved adjustment/backfill plan
  -> controlled execution on a safe copy
  -> accounting and inventory recertification
  -> rollback exercise
  -> production execution authorization
```

Silent rewriting of historical accounting evidence is prohibited. Corrections
must use governed migration, adjustment, or reversal evidence and retain an
auditable before/after record.

## Boundary Decision

Historical risk separation is PASS because the prospective certification and
historical-data claims are now explicitly separated. FSR-R18 and FSR-R19 remain
OPEN and continue to block production release where applicable.
