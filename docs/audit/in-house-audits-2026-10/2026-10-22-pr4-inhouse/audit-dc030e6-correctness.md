# Correctness audit: 605a873..dc030e6

- Branch: `claude/erp-full-automation-qbhv8k`, head `dc030e6`
- Scope: `git diff 605a873..dc030e6`, not counting the docs/audit archive copies
- Method: I read the code, then ran 12 throwaway probes against a scratch clone at `dc030e6`. The probe file is `/tmp/claude-0/probe-dc030e6/scripts/audit/probe.test.mjs` and is run with `node --test` from the clone root. The six `605a873 round` tests already in the repo pass.
- Left out on purpose (the owner has not decided yet): profitability working posted expenses out again from the formula, and credit-note invoices counted in the expense base.

## Summary

| # | Severity | Area | One line |
|---|----------|------|----------|
| F1 | **High** | init.js / seedData.js | A same-name ledger of the wrong type stops the app from starting. Every start throws inside `seedAccounts`. |
| F2 | Medium | inventoryService.js FIFO | Earlier returns are taken off by value. If the set or order of receipts changes after a return, the return lands on the wrong receipt. This happens with a backdated GRN or a bill posted between returns. |
| F3 | Medium | inventoryService.js order scope | A return with an order ignores earlier returns that had no order, so the same units are cleared twice. |
| F4 | Medium (existed before this diff, interacts with it) | accountingService.js postPurchaseVoucher | A bill clears GRNI for the full receipt even after part of it was returned. Billing is all-or-nothing per receipt. |
| F5 | Medium (existed before this diff, matters more now) | inventoryService.js return voucher | The Trade Payables debit has no supplier party link, so the supplier ledger never shows the return. |
| F6 | Low | inventoryService.js beyond receipts | Value booked "past all receipts" at average cost later uses up billed-receipt capacity at billed prices. |
| F7 | Low | init.js ensurePPV | Case-insensitive reuse can pick a different ledger from the one 605a873 already posted to. verify-fsr-2b1 still matches the exact name. |
| F8 | Low | main.js / supportBundleService.js | An oversized screen context drops the crash list too. The context is written into the bundle twice. Pruning can delete the bundle it just wrote. |
| F9 | Low / Info | init.js backfill | A posted document with a blank approval status is now set to Draft, where it used to be set to Approved. |
| F10 | Info | go-live rollback | The startup `system_ledger_created` audit row changes nothing when the high-water mark is stored. It only matters in the branch where that mark was lost, and there refusing is correct. |

Checked and found correct:
- `backfillPostingStatuses`: reversed invoices, procurements and supplier payments stay Reversed after a restart. Error stays Error. Blank becomes Draft. A supplier payment with a posted voucher and a blank status becomes Posted (probe P12).
- Reversing a return through `reverseStockReturn` is excluded from later returns. GRNI and PPV come out exact (P5).
- Rounding to paise over six odd-rate partial returns nets to exactly 0 on GRNI, Inventory and PPV (P6).
- Every return voucher probed balanced.
- `tallyMasterBudget` gives the same results for normal files (the limits apply only past the cap).
- The `useEntitySearch` timer reset is correct.
- Moving `expenseFormula` keeps the re-export, with no import cycle.

---

## F1 (High): wrong-type "Purchase Price Variance" ledger stops startup

- **Where:**
  - `src/main/database/init.js:813-815`: the throw.
  - `src/main/database/init.js:800`: `seedAccounts` calls it for every company.
  - `src/main/database/seedData.js:481`: `seed(db)` calls `seedAccounts(db)` on every start, through `initializeDatabase` at `init.js:284`.
- **What fails:** a company has a ledger whose name matches "purchase price variance" in any case and is not an Expense ledger. This can come from:
  - a ledger the user created;
  - a Tally ledger imported under Indirect Incomes;
  - a user renaming the system ledger and then adding a new one of another type.

  On the next start `initializeDatabase` throws:

  > The ledger "Purchase Price Variance" exists as Income ... Rename that ledger in Accounting > Ledgers, then post again.

  The app cannot open, so the user cannot reach Accounting > Ledgers to do what the message says. Probe P10 reproduced this: rename the system ledger, insert "Purchase price variance" as Income, restart, and it throws.
- **Fix:** refuse the wrong type only on the posting path. Give `ensurePurchasePriceVarianceAccount` an option such as `{ refuseWrongType: true }` and pass it only from `postStockReturn`. In `seedAccounts`, skip that company and write a warning (audit or health check) instead of throwing. A second option is to create the system ledger under the first free code whatever the name clash, and resolve it by code or provenance rather than by name.

## F2 (Medium): FIFO "already returned" is taken off by value, so it lands on the wrong receipt when the receipts change

- **Where:** `src/main/services/inventoryService.js:368-396`. `earlier()` gives a value. `takeFrom` walks the current lots in `ORDER BY si.inward_date, si.id` (line 364) and skips `skip / lot.rate` units per lot.
- **Why:** this works only while the list of lots and their order are the same as when the earlier returns were posted. Two ordinary events change them.
  1. **Backdated GRN (probe P2).**
     - Steps: R1 10 @ 200 dated 07-05. Return 5 → GRNI Dr 1000. Then enter R0 10 @ 100 dated 07-01. Return 10.
     - What happens: the 1000 already returned is now skipped off R0 (10 units × 100), so the return takes 10 @ 200 = **2000** GRNI.
     - Result: 15 units returned out of 20, and 5 still in stock unbilled, yet GRNI is **0** where it should be 500 or 1000 open. PPV is credited **666.67** for nothing. When the supplier's bill for the 5 kept units comes, GRNI goes into debit.
  2. **Bill posted between returns (probe P1).**
     - Steps: R1 10 @ 100 is linked to a draft bill. Return 4 → GRNI 400. Post the bill, so R1 becomes "billed". R2 10 @ 120 unbilled. Return 8.
     - What happens: the 400 of GRNI is skipped off R2 (3.33 units). That leaves 6.67 @ 120 = 800 GRNI, and 1.33 @ 100 = **133.33 goes to Trade Payables**. All 8 units should have come from R2: GRNI 960, Trade Payables 0.
     - Result: GRNI ends at 0 where it should show R2's 2 units open, 240 against the over-clear in F4. Trade Payables and PPV are misstated.

  The same happens when a receipt is reversed after a return (P9). In that probe the receipt reversal itself also over-reverses, which is a problem from before this diff.
- **Fix:** record what each return took, by receipt and quantity. Add a `stock_return_lots(return_id, stock_inward_id, account, quantity, value)` row set when posting, and on the next return subtract quantities per receipt. A reversal deletes or flags those rows. With per-receipt consumption, a newly billed receipt keeps its earlier GRNI returns attached to it. A cheaper alternative is to replay every earlier posted return in posting order against the current lots by quantity. That still leaves the bill-between-returns case wrong unless the replay knows which pool each return used at the time, so rows that are stored are the robust option.

## F3 (Medium): a return with an order ignores earlier returns without an order

- **Where:** `inventoryService.js:374`, the clause `(? IS NULL OR sr.order_id = ?)`. Line 362 uses the same filter for the lots.
- **What fails (probe P8):**
  - Setup: R1 10 @ 100 and R2 10 @ 200, both on order O.
  - A return with no order of 10 takes all lots → GRNI 1000 (R1).
  - A return of 10 on order O counts only earlier returns on order O (none). It takes R1 again: GRNI 1000 and PPV 500.
  - Result: all 20 units are returned, but GRNI is stuck at **-1000** (R2 never cleared) and PPV holds **+1000** that never happened.
- **Fix:** for a return with an order, also subtract returns with `order_id IS NULL` from the same supplier and item, allocating them first to the order's lots, or across all lots in the same FIFO. The other option is to require `order_id` on a supplier return whenever the supplier's receipts of that item carry one.

## F4 (Medium, existed before this diff): a bill clears GRNI for the whole receipt, ignoring earlier returns; billing is all-or-nothing

- **Where:** `src/main/services/accountingService.js:638-645`. `receivedValue` is the sum of `stock_ledger.value` of the linked receipts. It is not reduced by returns already debited to GRNI.
- **What fails:**
  - P1: R1 10 @ 100 with its bill not yet posted. A return of 4 makes GRNI −600, which is correct. Posting the bill then makes GRNI **+400** (debit, cleared 400 too much).
  - P7, partial bill: a bill of 600 against a receipt of 10 @ 100 clears 1000 of GRNI and credits Purchase −400. A later return of 4 debits Trade Payables 400 and leaves Trade Payables at 200. With bill-level matching, the 4 units still to be billed never show in GRNI.

  The decision CV split depends on GRNI holding exactly the units that have not been billed, so this makes F2's bill-between-returns case worse.
- **Fix:** in `postPurchaseVoucher`, set GRNI cleared = linked receipt value − GRNI already debited by returns against those receipts (once F2 stores per-receipt rows). Longer term, match bill lines to receipt quantities so a part-billed receipt is billed only for the matched units.

## F5 (Medium, existed before this diff, matters more now): the return's Trade Payables line has no supplier link

- **Where:** `inventoryService.js:445`. `{ account_id: Trade Payables, debit: payablesPortion, credit: 0 }` has no `linked_party_type: 'supplier'` and no `linked_party_id`. Compare the bill line at `accountingService.js:658`.
- **What fails:** the party ledger (`reportBuilders.js:212`, filter `vl.linked_party_type IN ('department','supplier')`) leaves the return out. So the supplier ledger still shows the full bill as owed, while the Trade Payables control account has been reduced.

  The voucher-graph note in this same diff says "The return already reduces the payable; no separate Debit Note for the same goods". Users will therefore not post a debit note, and the supplier ledger stays overstated. It will also disagree with the control account.
- **Fix:** add `linked_party_type: "supplier", linked_party_id: row.supplier_id` to that line. Also check that supplier outstanding and allocation (`procurements` balance) take the return into account, or show it as on-account.

## F6 (Low): value "past all receipts" later uses up billed capacity

- **Where:** `inventoryService.js:396-400`, read together with `earlier("Trade Payables")`.
- **What fails (P3):**
  - Supplier 1 has no receipts yet; the stock came from another supplier. A return of 5 → Trade Payables Dr 500 at average cost. That debit is against a supplier who never sent the goods, which was allowed before this diff too.
  - Supplier 1 then sends billed R1 10 @ 200. A return of 10 skips 2.5 units of R1 because of the 500 earlier. Trade Payables = 7.5 × 200 + 2.5 × 166.67 = **1916.67** where it should be 2000, and PPV −250.
- **Fix:** keep the beyond-receipts amount apart (falls out of the per-receipt rows in F2), or refuse or warn when a supplier return is larger than that supplier's open receipts of the item.

## F7 (Low): case-insensitive reuse can pick a different ledger

- **Where:** `init.js:812` (`LOWER(TRIM(account_name)) = LOWER(?) ... ORDER BY id LIMIT 1`).
- **What fails:** a company already had a user ledger "purchase price variance" (Expense) before 605a873. The 605a873 exact-name lookup missed it and created "Purchase Price Variance" (5065), which may already hold variance postings. Now the older user ledger wins, so later variances go to a different ledger from the earlier ones.
  - `NOT EXISTS (assignment)` leaves the user ledger in its current group, which may not be Purchases.
  - `scripts/verify-fsr-2b1.js` still matches the exact name and expects one mapped ledger per company, so it reports a failure for such a company.
- **Fix:** prefer an exact-name match, then fall back to case-insensitive; or resolve by `provenance = 'SYSTEM_SEED'` or by code. Make the verify script use the same rule.

## F8 (Low): support bundle edges

- **Where:** `main.js:216-225` (`boundedScreenContext`), `healthService.js:266`, `supportBundleService.js:47-51`.
- **What fails:**
  1. If the screen context is over 1 MB, the whole of it is replaced by `{ omitted }`, and that includes Safe Mode's `crashes`. In practice the Safe Mode context is small (diagnostics + checks ≈ 7 KB on the demo database), so the risk is a long crash list with big stack traces.
  2. `getHealthDiagnostics` writes `context: safeJson(context)`, and the context now includes `screenContext`. The screen's data is therefore in the bundle twice, so a context just under 1 MB gives a file of about 2 MB. Bounded at about 40 MB for 20 bundles, but wasteful.
  3. Pruning orders by file name, which is an ISO timestamp. If the system clock goes back, the bundle just written can sort below 20 older ones and be deleted, yet `createSupportBundle` still returns its path and size, which `statSync` read before pruning.
  4. User fields are removed only at the top level. A nested `diagnostics.context.user_name` from the screen is kept. It is clearly labelled under `screenContext`, so this is informational.
- **Fix:**
  - Keep `crashes` and `source` first and drop `diagnostics` and `checks` first when over the limit (main recomputes both anyway).
  - Pass `getHealthDiagnostics` the context without `screenContext`.
  - Leave `fileName` out of the delete list, or sort by `mtime`.

## F9 (Low / Info): backfill sets blank approval to Draft on a posted document

- **Where:** `init.js:761-762` and `779`.
- **What fails:** a document with `posting_status = 'Posted'` and `approval_status = ''` is not "unset" for the first UPDATE, so the second UPDATE sets its approval to **Draft**. The old code set Approved whenever a voucher existed. The columns are `NOT NULL DEFAULT 'Draft'`, so a blank value comes only from imports or manual edits. The impact is low.
- **Fix:** `UPDATE ... SET approval_status = CASE WHEN posting_status = 'Posted' THEN 'Approved' ELSE 'Draft' END WHERE COALESCE(approval_status,'') = ''`.

## F10 (Info): does the startup audit row affect go-live rollback?

The go-live reset keeps `accounts` (`operationalResetService.js:7`), and `seedAccounts` creates the ledger at every start before any go-live. So the `system_ledger_created` row appears after a go-live starts only in these cases:
- the ledger was renamed or deleted, which is itself an audited accounts change that already blocks rollback;
- the app was upgraded and restarted while a go-live was in progress.

With a stored `highWater`, the new accounts row already raises `accounts` MAX(id), so the audit row changes nothing. In the branch where `highWater` was lost (`compared = []`, only audit rows count), the row now makes rollback refuse with "accounts changed". That is correct: a ledger was added after the reset, and restoring would remove it. No change needed. Do **not** add it to `READ_ONLY_AUDIT_ACTIONS`.

## Other changed areas reviewed (no defect found)

- **tallyImportService `tallyMasterBudget`:** for files under the cap, `take` and `count` return the same blocks as before (`namedTallyBlocks` with a limit is identical below it, and `uniqueByName` is the same filter).
  - Behaviour change: the stock preview now also counts units, godowns and stock groups, so a file of about 100,000 items plus a few units is now refused. This is intended and matches the migration preview.
  - In the migration preview, `parseTallyStockItemsXml` is still called without the budget and reparses the tags. Its size is already bounded by the `take` and `count` calls just before it.
- **useEntitySearch:** clearing `debounceTimer.current` after `clearTimeout` makes `loadMore` work again after an explicit search had cancelled a pending typed search. Before, it stayed blocked by a timer handle that would never fire. Correct.
- **guarded / recordGrant:** the grant row now takes its company from the first argument only, but `enforcePermission` still uses `firstPayload(args)` across all arguments. The two can name different companies when the first argument is not a plain object. For the security audit, not a correctness defect.
