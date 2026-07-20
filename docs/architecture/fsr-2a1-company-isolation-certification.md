# FSR-2A.1 Company Isolation Certification

## Prior Evidence (FSR-1 Check 12)

A Company B posting using Company A account IDs contaminated Company A Bank by 777.00. The `createBalancedVoucher` function did not validate that account IDs belong to the voucher's company.

## Code Correction

In `src/main/services/accountingService.js`, `createBalancedVoucher()` now validates every line's `account_id`:

```js
const account = db.prepare("SELECT * FROM accounts WHERE id = ? AND is_deleted = 0").get(line.account_id);
if (!account) throw new Error(`Account ${line.account_id} not found or is deleted`);
if (Number(account.company_id) !== companyId) throw new Error(`Account ${line.account_id} belongs to a different company`);
if (account.status !== "active") throw new Error(`Account ${line.account_id} is not active`);
```

The validation occurs **before** the database transaction begins. If any account fails validation, no records are created (voucher header, voucher lines, ledger entries, audit log, dependents).

## Test Evidence

1. FSR-2A.1 verifier check 9: Company isolation enforced — PASS
2. FSR-2A.1 verifier check 10: Cross-company atomic failure — PASS (zero vouchers, zero ledger entries for Company B after rejection)
3. FSR-2A.1 verifier check 11: Company consistency enforced — PASS
4. FSR-1 verifier check 12: Changed from FAIL to PASS

## Closure Recommendation

**CLOSED.** Company isolation is enforced at the core posting boundary. Cross-company account reference is rejected before any data is written.

## Remaining Limitations

- Renderer-side company selection could be improved to prevent accidental company context switches, but rendering is outside this subphase scope.
- No database-level foreign-key redesign was implemented (deferred to later hardening).
