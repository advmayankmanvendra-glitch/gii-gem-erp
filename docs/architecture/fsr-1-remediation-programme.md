# FSR-1 Remediation Programme

**Audit date:** 2026-07-20  
**Implementation status:** Proposed only  
**FSR-2 started:** No

## Governing sequence

```text
FSR-1 audit lock
  -> clean financial-reporting baseline and external backup
  -> FSR-2A Accounting Truth Corrections
  -> stabilization and populated certification
  -> FSR-2B Chart of Accounts and Mapping Registry
  -> stabilization and mapping certification
  -> FSR-2C Financial Statement Engine
  -> stabilization and calculation certification
  -> FSR-2D Operational Reporting UX
  -> FSR-2E Statutory Profiles
  -> FSR-2F Advanced Reports
```

No phase may skip stabilization, certification, lock report or Executive Architecture Gate.

## FSR-2A - Accounting Truth Corrections

**Scope:** Posting defects, statement source policy, Balance Sheet signs, company/status filtering, inventory/GL bridge, year-end continuity, opening balance control and money policy.

- Dependencies: FSR-1 lock, clean Git baseline, DB backup, accountant-approved inventory policy.
- Likely files: `accountingService.js`, `inventoryService.js`, `reportBuilders.js`, schema/migrations, accounting verification scripts.
- Migration/backfill: validate account ownership, identify non-posted voucher ledger effects, reconcile direct openings, stock-to-GL variance pack, repair carry-forward history only under approved scripts.
- Risks: historical totals, duplicate COGS/purchase correction, closed periods, tax and party subledgers.
- Verification: populated 30-class fixture, per-voucher/day/month/FY/company equality, status exclusion, company isolation, inventory reconciliation, reversal and year close.
- Rollback: named baseline tag plus offline DB copy; reversible migrations; no destructive historical rewrite without signed mapping.
- Certification gate: all FSR verifier checks 1-25 pass and no unresolved CRITICAL accounting risk.

## FSR-2B - Chart of Accounts and Mapping Registry

**Scope:** Stable account groups, hierarchy, normal/contra behavior, management/statutory mappings, current/non-current and cash-flow classifications.

- Dependencies: FSR-2A certified source-of-truth contract.
- Likely files: new database mapping service/schema, account master UI module, mapping verifier, graph updates.
- Migration/backfill: map every active/historical ledger; unresolved mappings remain explicit blockers, never default silently.
- Risks: misclassification, changing historical presentation, user-renamed default accounts.
- Verification: child-to-parent totals, mapping completeness, version/effective-date behavior, protected system groups, entity-profile compatibility.
- Rollback: retain old account IDs; mappings additive/versioned; deactivate mapping version rather than delete.
- Certification gate: 100% ledger mapping or approved disclosed exceptions; no name-based renderer classification.

## FSR-2C - Financial Statement Engine

**Scope:** Common backend calculation engine for Trial Balance, Trading/P&L, Balance Sheet, periods, comparisons and drill-down contracts.

- Dependencies: FSR-2A and FSR-2B locked.
- Likely files: new main-process financial statement service, report adapters, IPC/preload read APIs, report verifier.
- Migration/backfill: generally none beyond mapping data; optional certified snapshots must be reproducible from postings.
- Risks: duplicate calculations between legacy and new reports; period boundary differences.
- Verification: independent fixtures for profit, loss, zero result, contra balances, prior periods, closing stock, depreciation, tax and year continuity.
- Rollback: keep legacy read-only reports behind an internal feature flag until certification, with clear uncertified label.
- Certification gate: exact independent results and stable drill-down evidence for every statement total.

## FSR-2D - Operational Tally-Style Reporting

**Scope:** Hierarchical operational UX, horizontal/vertical views, detailed/condensed modes, keyboard navigation, comparisons and governed exports.

- Dependencies: FSR-2C calculation contract; Global UX Governance review.
- Likely files: renderer report feature modules, shared table/tree components, export/print services, shortcut registry.
- Migration/backfill: none.
- Risks: UI totals diverging from backend; inaccessible keyboard interactions; print/export mismatch.
- Verification: Electron visual test across reports and roles; exported totals equal API totals; no renderer financial math.
- Rollback: component-level revert to certified backend flat view.
- Certification gate: visual, accessibility, navigation, print and export lock.

## FSR-2E - Statutory Reporting Profiles

**Scope:** Entity-specific corporate/non-corporate profiles, applicable Schedule III division, notes, comparatives and current/non-current presentation.

- Dependencies: certified FSR-2C engine; legal-entity profile data; CA/company-secretarial approval.
- Likely files: profile/mapping registries, statutory adapters, disclosure metadata, statement export templates.
- Migration/backfill: company reporting profiles with evidence, effective dates and approvals.
- Risks: wrong legal applicability, stale regulation mapping, misleading “statutory” labels.
- Verification: authoritative-source review, CA/UAT sign-off, comparison against approved specimen statements.
- Rollback: disable statutory profile and retain operational reporting; never silently substitute another profile.
- Certification gate: legal applicability and accounting mapping formally approved.

## FSR-2F - Cash Flow and Advanced Reports

**Scope:** Cash flow, fund flow, working capital, ratios, consolidation and segment/project reporting.

- Dependencies: FSR-2A through FSR-2E certified and locked.
- Likely files: advanced report services, mapping extensions, elimination/consolidation modules where approved.
- Migration/backfill: cash-flow classifications; opening comparatives; intercompany mappings for consolidation.
- Risks: classification and elimination errors; false management conclusions.
- Verification: independent direct/indirect cash-flow fixtures, working-capital ties, consolidation eliminations.
- Rollback: keep advanced reports disabled until each subprogramme is certified.
- Certification gate: separate accounting and management approval for each advanced report family.

## Immediate FSR-2A work order priorities

1. Fix company ownership and posted-status selection at the accounting source boundary.
2. Reject empty/substantively invalid vouchers and remove direct opening-balance bypass.
3. Correct signed/contra balance aggregation.
4. Correct Balance Sheet financial-year-to-date profit semantics.
5. Fix year-end close call and design real opening/carry-forward behavior.
6. Approve and implement one inventory accounting model.
7. Establish a governed money/rounding contract.
8. Re-run populated verification before any UI redesign.

## Architecture gate recommendation

**Proceed to a controlled FSR-2A design/audit:** Yes  
**Proceed directly to report redesign, statutory profiles or packaging:** No  
**Safe to lock FSR-1 as evidence of gaps:** Yes

