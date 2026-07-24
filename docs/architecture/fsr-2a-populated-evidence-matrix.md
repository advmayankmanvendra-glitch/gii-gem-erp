# FSR-2A Populated Accounting Evidence Matrix

**Date:** 2026-07-24
**Result:** PASS

## Evidence Boundary

The generic `verify:accounting` and `verify:financials` commands use the
Development profile and may encounter an empty database. They are useful for
schema, service, no-data, query, and renderer regression, but they are not
treated as evidence of populated financial correctness.

FSR-2A certification instead relies on deterministic, disposable, populated
SQLite fixtures with independently expected values.

## Populated Evidence By Domain

| Certified domain | Primary verifier | Populated evidence |
|---|---|---|
| Balanced posting | FSR-2A.1, FSR-2A.5C | Non-empty balanced vouchers; empty and unbalanced posting rejected |
| Company isolation | FSR-2A.1, FSR-2A.5C | Independent companies and cross-company contamination probes |
| Voucher-state exclusion | FSR-2A.1, FSR-2A.5C | Draft and cancelled rows injected and excluded |
| Signed balances | FSR-2A.2, FSR-2A.5C | Debit-normal, credit-normal, and contra-account expected values |
| Current profit | FSR-2A.2, FSR-2A.5C | Income and expense transactions with independent net-profit expectation |
| Financial-year close | FSR-2A.3, FSR-2A.5C | Source and target years, close status, overlap, and continuity probes |
| Carry-forward | FSR-2A.3, FSR-2A.5C | Account-type decomposition and balanced target-year openings |
| Inventory lifecycle | FSR-2A.4, FSR-2A.5C | Inward, outward, return, adjustment, reversal, and locked-year scenarios |
| Inventory/GL equality | FSR-2A.4, FSR-2A.5C | Stock value equals Inventory GL movement |
| GRNI clearing | FSR-2A.4, FSR-2A.5C | Receipt and supplier invoice clear Goods Received Not Invoiced exactly |
| COGS recognition | FSR-2A.4, FSR-2A.5C | Outward movement recognizes Cost of Goods Sold once |
| Opening balances | FSR-2A.5A, FSR-2A.5C | Governed ledger and party openings; direct bypass blocked |
| Minor-unit arithmetic | FSR-2A.5B, FSR-2A.5C | Paise-scale parse, addition, allocation, tax, and reversal expectations |
| Migration 034 | FSR-2A.5B, FSR-2A.5C | Fresh, idempotent, backfill parity, disagreement, and negative-value cases |
| Voucher/ledger parity | FSR-2A.5B, FSR-2A.5C, FSR-1 Check 20 | Per-voucher debit/credit and voucher-line/ledger totals equal in minor units |
| Report minor authority | FSR-2A.5B, FSR-1 Check 20 | Legacy-only mutation leaves Trial Balance, Profit and Loss, and Balance Sheet unchanged |
| Trial Balance | FSR-2A.5C | Exact debit/credit equality on populated lifecycle data |
| Profit and Loss | FSR-2A.5C | Expected income, expense, and net profit |
| Balance Sheet | FSR-2A.2, FSR-2A.5C | Assets equal liabilities plus equity, including contra assets |
| Party controls | FSR-2A.5C | Receivable and payable subledgers reconcile to control accounts |
| Report drill-down | FSR-2A.5C plus Electron smoke | Report row traces to ledger and posted voucher evidence |

## Exact Money Evidence

The fixture verifies that:

- every financially eligible voucher line has populated debit and credit minor
  values;
- every ledger entry has populated debit and credit minor values;
- voucher debit minor equals voucher credit minor;
- voucher-line totals equal ledger-entry totals;
- legacy mirrors reconcile through `parseMoneyToMinor`;
- a deliberate mismatch is detected; and
- reports remain unchanged when only a legacy compatibility value is altered.

## Isolation And Cleanup

Each verifier creates a unique temporary database root. All roots were removed
after the final run, and a post-run `%TEMP%` scan found zero FSR fixture
directories. No operational database was used.

## Limitation

These populated fixtures certify the prospective accounting implementation and
migration behavior on controlled copies. They do not certify the contents of
any historical production database. FSR-R18 and FSR-R19 remain OPEN.
