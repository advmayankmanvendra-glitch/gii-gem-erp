# In-house security audit: 605a873..dc030e6

- Repository: gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `dc030e6`
- Range: `git diff 605a873..dc030e6` (archived copies under docs/audit were not reviewed)
- Method: code read, then probes run in a scratch clone (`/tmp/claude-0/audit-dc030e6`) against the real modules. The IPC probes import `src/main/main.js` with the repo's electron stub (`scripts/audit/lib/electron-register.mjs`) and call the registered handlers as a signed-in window would. The checkout under /home/claude was not modified.
- Date: 2026-11-10

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| S1 | Medium | Support bundle: the 1 MB cap measures compact JSON, but the file is written pretty-printed. Deep nesting makes it about 500x larger | Claimed fix bypassed |
| S2 | Medium | `ensurePurchasePriceVarianceAccount` throws during start-up seeding. One non-Expense ledger with that name stops the app from opening, and a backup restore containing one leaves `db` null | New in this range |
| S3 | Low | Audit manifest: a manifest of `{}` or `{"entries":[]}` passes the refusal, and every edited report is then accepted | Claimed fix partly bypassed |
| S4 | Low / Info | Support bundle `screenContext` keeps user-like fields that are nested or use variant names (`USER_ID`, `actor`, `nested.user_id`) and an own `__proto__` key | Residual, labelled as screen data |
| S5 | Info | `guarded()` denial rows still take their company from any argument | Inconsistency only |

Verified as fixed, with probes:
- `guarded()` grant company: the grant row now takes its company from the first argument only.
- Support-bundle retention: no more than 20 bundles are kept.
- User-field stripping at the top level of the support-bundle context.
- The Tally stock-XML master budget.
- The entity-search timer reset.
- The `--init` refusal when the manifest is missing.
- `backfillPostingStatuses`: no abuse path found.

## Findings

### S1 (Medium): support-bundle cap measured on compact JSON, file written pretty-printed

- `src/main/main.js:217-226` (`boundedScreenContext`) measures `JSON.stringify(rest)` against 1 MB.
- `src/main/main.js:1195` attaches the result as `screenContext`.
- `src/main/services/healthService.js:266` copies the whole context again into `diagnostics.context` (`safeJson(context)`), so the screen data is written twice.
- `src/main/services/supportBundleService.js:45` writes `JSON.stringify(payload, null, 2)`.

Pretty-printing adds a newline plus 2 spaces per nesting level to every value. A compact payload of nested arrays (`[[[...[[],[],[],...]...]]]`) costs 3 bytes per leaf. When written at depth d, each leaf costs about 2d bytes.

**Exploit path.** A signed-in renderer, of any role, calls `window.api.exportSupportBundle(ctx)` (preload `health:support-bundle`). `ctx` is `{ crashes: <350 nested arrays around ~349k empty arrays> }`. It is 1,048,xxx bytes compact, so the cap check passes. The channel only checks sign-in; it has no permission guard.

**Probe results** (real handler, context round-tripped through `v8.serialize`/`deserialize` as IPC does):
- depth 350: **499 MB bundle file written** in 2.9 s, main thread blocked.
- depth 500 or more: `JSON.stringify` builds about 536 MB and then throws `Invalid string length`. Nothing is written, but the main process takes the memory spike every call.
- With `createSupportBundle` alone (one copy of the context), depth 760 gave a 536 MB file.
- Retention keeps 20 files, so the disk bound is about **20 x 536 MB ≈ 10.7 GB** in the folder next to the books. The claim of "1 MB, a call cannot fill the disk" does not hold.

**Suggested fix (any one is enough; the first is simplest):**
1. Write the bundle compact (`JSON.stringify(payload)`), and keep `screenContext` as the compact JSON *string* `text`, not a re-parsed object. Pretty-printing then cannot amplify it.
2. Or cap the final serialized bundle: build the string, check `Buffer.byteLength`, and drop `screenContext` (and `diagnostics.context`) when it is over the limit.
3. Also reject nesting deeper than a small limit (for example 16) in `boundedScreenContext`. Pass the bounded context, not the raw one, to `getHealthDiagnostics` so the screen data is not copied twice.

Add a regression test with the nested-array payload above that asserts `result.ok.size < 2 MB`.

### S2 (Medium): start-up seeding throws on a non-Expense "Purchase Price Variance" ledger

- `src/main/database/init.js:812-815` now throws when the first ledger matching `LOWER(TRIM(account_name)) = 'purchase price variance'` is not of type Expense.
- The same function runs on **every start**: `initializeDatabase` → `seed` (`seedData.js:481`) → `seedAccounts(db)` → `init.js:800` → `ensurePurchasePriceVarianceAccount(db, company.id)` for every company.
- Nothing catches the throw, so `initializeDatabase` fails and the app cannot open its database.
- The message tells the user to "Rename that ledger in Accounting > Ledgers". There is no rename or retype channel: `accounts` is in `WRITE_POLICY.accountingReadOnly`, and `createLedgerAccount` only inserts. The user has no in-app way out.

**Exploit / trigger path**
- **Upgrade.** A database where a user created a ledger such as "purchase price variance" (any case) as Asset or Liability with `createLedgerAccount` before `1eff0c4`. At 605a873 the exact-name lookup missed it, and a second Expense ledger with a higher id was created. At dc030e6 the case-insensitive `ORDER BY id LIMIT 1` picks the user's older ledger and throws on start. An exact-name ledger of non-Expense type that 605a873 reused fails the same way.
- **Restore.** `backup:restore` (`main.js:1168-1180`) runs `initializeDatabase` after the file swap. When that throws, the catch block calls `initializeDatabase` again on the same file, which throws again, so `db` stays null. Every later start fails too.
- **Probe.** Fresh database, then an Asset ledger `purchase price variance` inserted with a lower id (standing in for a pre-1eff0c4 user ledger), then a restart. `initializeDatabase` failed with *"The ledger "Purchase Price Variance" exists as Asset … Rename that ledger in Accounting > Ledgers, then post again."*

In-app creation of a conflicting ledger is blocked once the system ledger exists: `createLedgerAccount` refuses the duplicate case-insensitively, and the system ledger has the lowest id. So the realistic triggers are upgrades and restores. The impact is that the app stops opening (availability).

**Suggested fix**
- Do not throw from the seeding path. Give `ensurePurchasePriceVarianceAccount` a mode, or split it, so that seeding only creates the ledger when none exists and never refuses.
- Keep the refusal only in the posting path (`inventoryService.js:432`).
- In the lookup, prefer an Expense match (`ORDER BY account_type = 'Expense' DESC, id`). When only a non-Expense match exists, either create the system ledger under a distinct name or refuse at posting with a message that points to a real fix path. A rename channel does not exist yet; add one, or name the right support step.

### S3 (Low): audit manifest refusal bypassed by an empty or entry-less manifest

- `scripts/update-audit-manifest.js:28`: `JSON.parse(...).entries || []`. A manifest of `{}` (or `{"entries": []}`) parses without error, so `previous` is `[]`. Every report then looks new, and `--init` is not needed.

**Probe**
- Appending one line to `2026-10-17-erp-automation/audit-1-current-build.md` was refused (exit 1), as intended.
- After `echo '{}' > manifest.json`, the script exited 0 and wrote a fresh manifest of 51 entries, blessing the edited report.
- A missing manifest was refused (exit 1), as claimed.

**Suggested fix.** Unless `--init` is given, refuse when `!Array.isArray(parsed.entries) || parsed.entries.length === 0`, or when `parsed.count !== parsed.entries.length`. For tamper evidence that does not depend on the file itself, have CI compare the manifest against the version at the merge base (`git show <base>:…/manifest.json`).

### S4 (Low / Info): user-like fields survive in `screenContext`

`src/main/main.js:220` removes only the exact top-level keys `user_id, userId, user_name, userName, role, userRole`.

Probe input:

```json
{"__proto__":{"isAdmin":true},"USER_ID":7,"actor":"ceo","nested":{"user_id":99,"role":"admin"}}
```

All of it was written to the bundle under `context.screenContext` (and again in `diagnostics.context`). The signed-in `context.user_id` was correct (1). `company_scope: "all"` is kept on purpose. A `company_id` given as an object was dropped, as intended.

The data sits under a separate key, so it cannot replace the real actor fields, and nothing in the app reads bundles back (only the browser fallback writes its own). A support reader could still be misled, and the own `__proto__` key would pollute any downstream tool that merges the JSON with `Object.assign` or a spread.

**Suggested fix.** Store `screenContext` as an opaque string (see S1), or drop keys case-insensitively and recursively, along with `__proto__`, `constructor` and `prototype`.

### S5 (Info): denial rows still take their company from any argument

`src/main/main.js:342-349`: `enforcePermission` receives `firstPayload(args)`, which scans every argument. So a `permission_denied` row can carry a company taken from a second argument, while grant rows (`main.js:351`) now use the first argument only.

There is no per-company access model (`enforcePermission` checks role only), so this is a labelling inconsistency, not a bypass. For a uniform audit trail, use `firstPayload(args.slice(0, 1))` for the company field passed to `enforcePermission` as well.

## Claimed fixes verified

- **`guarded()` grant company** (`main.js:351`). Probe: `financial-years:status(999999, {company_id: 77})` and `alerts:get-settings("x", {company_id: 77})` as admin. Both `permission_granted` rows have `company_id = null`. Fixed.
- **Support bundle, signed-in user fields and retention** (`main.js:196-213`, `supportBundleService.js:47-51`).
  - `context.user_id` and `user_name` are always the session user.
  - `company_id` is accepted only as a primitive.
  - Thirty-two consecutive calls left exactly 20 bundles in the folder.
  - Same-millisecond calls overwrite each other, so they do not grow the folder.
  - The size bound is broken by S1.
- **Tally stock-XML master budget** (`tallyImportService.js:366-381`, `466-467`). Probes against `previewTallyStockXml` with crafted 3-50 MB files:

  | Crafted file | Result |
  |---|---|
  | 40k units + 40k godowns + 40k items (split across kinds) | Refused, `TALLY_PREVIEW_TOO_LARGE`, 151 ms |
  | 100,001 `<UNIT.LIST>` blocks (the `(?!\w)` lookahead counts them as UNIT) | Refused, 92 ms |
  | 100k items, 42 MB, 5 RATEDETAILS each | 3.4 s |
  | One item holding 1.2M `RATEDETAILS.LIST` blocks | 3.4 s |
  | One 40 MB body nested under all four kinds at once | 0.5 s |
  | 60k items full of opening tags with no closing tag | 1.4 s |
  | 45 MB `NAME="` with no closing quote | 0.26 s |

  Work stays linear in file size. The migration preview's second, unbudgeted `parseTallyStockItemsXml` call re-reads only kinds the shared budget has already counted for that file, so it is bounded by the same limit. No worse bound than the known deflate residual was found.
- **Entity search timer** (`useEntitySearch.js:22-23`). `debounceTimer.current` is now cleared on a direct search, so `loadMore` is no longer blocked by a stale handle. This is a renderer correctness fix with no security impact.
- **Manifest `--init` refusal.** A missing or unparseable manifest is refused without `--init`. Bypass via an empty manifest: see S3.
- **`backfillPostingStatuses`** (`init.js:744-782`).
  - The table and module names are constants, so there is no injection.
  - It now promotes only blank or Draft documents, and only those with a non-deleted voucher whose `status = 'Posted'`. Reversed and Error documents are left alone.
  - Vouchers cannot be pointed at an arbitrary document from a screen: `createManualVoucher` fixes `source_module = 'manual_voucher'` and `source_id = null`, and `expense_entries.voucher_id` is not in the writable field list (`init.js:157`).
  - No code path resets a posted document to Draft while it still has a posted voucher.
  - The only way to feed it crafted rows is a restored backup, which needs `restore_backup`.
  - No abuse path found.
- **`ensurePurchasePriceVarianceAccount`**. The posting-time refusal and the audit row for the created ledger are fine. Its start-up behaviour is S2.

## Out of scope, noted only

`inventoryService.js:286-302` (`takeFrom`): if a stock inward has a negative value, `lot.rate < 0` makes `skipped` negative, which *increases* `available`. The resulting negative GRNI amount is then refused by the voucher validator ("cannot be negative"), so the return cannot post. Inward values do not appear to be validated as non-negative (`crudHelpers.js` has no check). This is an accounting robustness issue, not security; consider `if (lot.rate <= 0) continue` for the skip step, or reject negative inward rates.
