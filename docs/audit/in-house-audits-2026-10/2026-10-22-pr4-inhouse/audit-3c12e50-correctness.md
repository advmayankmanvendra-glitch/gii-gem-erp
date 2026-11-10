# Correctness audit of commit 3c12e50

- Repo: gii-gem-erp, HEAD `3c12e50` ("Preserve the a97daf4 audits and update the audit manifest"), branch `claude/erp-full-automation-qbhv8k` (PR #4).
- Range reviewed: `git log a97daf4..3c12e50` (8 commits). The source changes are in `0dd9a61` (SEC-1), `a7a31b1` (Profit Simulator), `c68d74b` (a97 architecture fixes), `4acb571` (order picker scope, order closure) and `ce1d30b` (a97 correctness and security fixes). The other commits only change docs and audit files.
- Date: 2026-11-10.
- I worked in a separate worktree, `/tmp/audit3c1-correctness` (detached at 3c12e50). For before/after runs, `srcA97/` is a `git archive` of a97daf4. I did not edit, commit or push anything in `/home/claude/gii-gem-erp`. The probe scripts and their outputs were copied to `/tmp/audit3c1-scratch/` before the worktree was removed:
  - `tally-diff.mjs`: a differential fuzz of the old regex helpers against `tallyTagBlocks`.
  - `probe-tally-eq.mjs` (`teq-a97.json`, `teq-3c1.json`): a Tally master and stock preview, a97 against 3c1.
  - `probe-tally2.mjs`: single UTF-16 master files of 27, 48 and 53 MiB.
  - `probe-closure.mjs` (`closure.out`): S1–S16, order closure on real posting flows.
  - `probe-sim.mjs`: the old renderer calculation against `profitSimulatorService`, on 100,000 random cases.
  - `probe-simcost.mjs`: the cost of one simulate call.
  - `ipc-probe.test.mjs`: `accounting:data` by role, and `profitability:simulate` through real IPC.
  - `probe-import.mjs` (`imp-a97.json`, `imp-3c1.json`) and `probe-import2.mjs` (`import2-3c1.out`): real-shaped imports, plus the a97 R/H cases.
  - `probe-bool.mjs`: booleans by column type.
  - `probe-timing.mjs`: the timing of the flaky suite case.

## Overall rating: Low, with two Medium regressions

- `npm run lint:syntax` exits 0.
- The first full run of `npm run test:integrity` **failed: 103/104 node tests passed**. Test 72 ("a97daf4 round: entity-heavy xlsx text…") took 2,770 ms against a 2,500 ms limit, while the machine load was 3.7. Because the script joins its two parts with `&&`, the IPC suite did not run at all. Run on their own, test 72 passes (5 runs: 1.42–1.63 s), and the IPC suite passes **22/22**. See L2.

**Most of the work is correct.**
- `tallyTagBlocks` returns exactly what the old regexes returned: 0 differences in 2.8M fuzz cases, and the a97 and 3c1 previews are byte-identical on a real-shaped export.
- The Profit Simulator gives the same figures as the old screen for every input in the normal range.
- The proposal change keeps the maker/checker flow working.
- Booleans, xlsx limits, the single-file Tally budget and the one-column late header are fixed.

**Two Medium regressions:**
- **M1.** Order closure now refuses orders settled by a **credit note**. The bill-wise receivables report shows the same invoice as "Fully Paid".
- **M2.** The SEC-1 filter on `accounting:data` uses `view_reports`, which the **`admin` role does not have**. The seeded `admin` user (and every admin-role user) now gets an empty audit trail in Accounting, while a viewer still sees it.

| Severity | Count |
|---|---|
| High | 0 |
| Medium | 2 |
| Low | 3 |
| Info | 6 |

| ID | Severity | Area | Evidence | Fix |
|---|---|---|---|---|
| M1 | **Medium** | Order closure: credit notes are not counted as settlement (new) | **Code.** `orderClosureService.js:21-24, 33` checks each posted invoice with `receivableOutstandingBeforeAdjustment` (`init.js:1443-1451`). That is the invoice amount less allocations and advance adjustments. A credit note is not part of it, in either form the app offers: (a) a billing voucher of type "Credit Note" is posted as its **own** receivable row with a negative amount (`accountingService.js:617-619`), and nothing links it to the original invoice; (b) a guided "Credit Note" voucher with `linked_invoice_id` touches only the ledger. The bill-wise report subtracts it (`reportBuilders.js:244, 259-260`), but closure does not. **Probe** (`closure.out`): **S9** posts invoice 1,000, a credit-note invoice of 100 and a receipt of 900. The department's books net to zero, yet closure says "Still to receive on …INV-00010" (receivables 1,000/bal 100 and −100). **S10** posts invoice 1,000, a guided credit note of 118 linked to it, and a receipt of 882. The bill-wise report shows **INV-00012 balance 0, "Fully Paid", credit_note_adjusted 118**, but closure says "Still to receive on …INV-00012". At a97daf4 both orders could be closed (any receipt was enough). Now they can never be closed. The only workaround is to record the credit as an "other deduction" on a receipt, which credits Trade Receivables a second time. | Use one settlement figure for the report and for closure. For example, add a `receivableOutstandingAfterNotes(db, invoiceId)` that subtracts posted guided credit notes linked to the invoice (the same `postedGuidedNoteAdjustments` the report uses). Then judge settlement **per order**: the sum over posted invoices of the order, so a negative credit-note receivable nets against the invoice it corrects. Add S9 and S10 as tests. |
| M2 | **Medium** | `accounting:data` hides the audit trail from the `admin` role (new, SEC-1) | **Code.** `main.js:850-855` returns `auditLog: []` unless `roleCan(actor.role, "view_reports")`. In `authService.js:7`, `admin` has no `view_reports`. Only `super_admin` (`*`), `accountant`, `manager` and `viewer` have it. The seeded default user is `role: "admin"` (`seedData.js:370`). **Probe** (`ipc-probe.test.mjs`, real IPC): auditLog rows: **admin 0**, super_admin 67, accountant 68, viewer 69. The renderer reads `data.auditLog` for the Accounting audit trail (`accountingTableConfig.js:52`), the reversal audit evidence (`AccountingScreen.jsx:353, 368`) and the operations audit trail (`operationsIntelligence.js:198, 635`). So the main admin user now sees those panels empty, and a read-only viewer sees them full. | Test a permission admin actually holds, or add `view_reports` to `admin` (admin already has `approve`, `post`, `system_reset` and more). Add an IPC test for `admin` and `data_entry_operator`. |
| L1 | Low | Profit Simulator recalculates the whole profitability report on every keystroke (new) | `ProfitSimulatorScreen.jsx:38-45` calls `simulateProfit` whenever `params` changes. `main.js:849` runs `orderProfitability(db, filters)` in full each time, on the main process. Before, the screen fetched the rows once and recalculated locally. **Probe** (`probe-simcost.mjs`): with 2,001 orders, one call takes **455–535 ms**, about 0.25 ms per order. Typing "12.5" sends 4 calls, and the whole app is blocked for each one. The figures are correct: `probe-sim.mjs` gives **0 differences in 80,406 in-range cases**. The 19,594 out-of-range cases differ only by design: the new clamps hold billing, cost and expense to −100…1000 %, and incentive and GST to 0…100 %. The IPC result matches. | Load the baseline once (`profitability:list`, or a `simulate` call that returns the baseline) and send only the baseline and params on later calls. Or debounce the params by about 300 ms. Show the clamped value when a percentage is outside its range. |
| L2 | Low | Timing test is flaky, and a failure hides the IPC suite | `audit2-regressions.test.mjs:672` allows 2,500 ms. The entity-heavy shared-string case takes 1.42–1.63 s on an idle 4-CPU box (`probe-timing.mjs`), and it took 2,770 ms at load 3.7. That failed the integrity run, and the `&&` in `package.json:22` then skipped all 22 IPC tests. | Raise the limit (for example 5 s), or measure against a calibration loop. Run the two suites with `;` (or as separate scripts), so one failure does not hide the other. |
| L3 | Low | Late-header rule, one-column sheets: new false refusal | `importParserService.js:413-415`. When no row has two filled cells, one title cell is enough for a late header. This closes a97 L3/H4 (a one-column header at row 56/61 is now refused with the guided message). But in a one-column list, any **data** cell after row 50 that reads "Company Name", "Supplier Name", "Item Name" or "Order Number" now refuses the import. `imp-3c1.json`: a one-column narration sheet with "Company Name" at row 60 was 59 rows at a97 and is now **refused** ("the header row … is Excel row 60"). This is the H2 case, reintroduced for one-column sheets. H1 (two-column bank data row) is still refused, as at a97. | As suggested at a97: count a late row as a header only when it holds two or more known column names, or one known name **and** the first 50 rows hold no known name at all. |
| I1 | Info | Closure fails open when the receivable row is missing | `init.js:1445` returns 0 when there is no receivable, so S15 (row deleted) and S16 (row soft-deleted) count a posted invoice as settled. I found no app path that posts an invoice without a receivable: `createRecord` forces `Draft` (`crudHelpers.js:427`), and `postSalesVoucher` always upserts. Only a damaged or migrated database could reach this. S5 (an advance received but not yet adjusted) correctly blocks closure, but the detail says only "Still to receive", not "adjust the advance". | Treat a missing receivable as unsettled, and name it in the detail. When the order holds an unadjusted advance, say "adjust advance …". |
| I2 | Info | Row number in "more than 16,384 cells" counts filled rows, not file lines | `importParserService.js:100, 136, 171` use `rows.length + 1`, and blank lines are skipped. CSV/TSV with a header, three blank lines and a wide row says "row 2", but it is line 5. | Count physical lines, or say "the 2nd filled row". |
| I3 | Info | New refusals that are by design | (a) `previewTallyStockXml` now has a 50 MB cap (`tallyImportService.js:429-434`); before, it had none. (b) `bank:preview-import` now needs `import`, so a `manager` can no longer preview a statement (they already could not import it). (c) `simulateProfit` is desktop-only (`client.js:108`), so the screen shows an error in browser preview, where `getProfitability` worked before. | None needed. Mention (a) in the import help. |
| I4 | Info | `permission_granted` rows | `main.js:309-311` writes the row before the handler runs, outside its transaction. For `backup:restore` the row is in the database that the restore replaces, so it disappears. Read-only `settings` channels (`alerts:get-settings`, `alerts:preview`) write a row every time the screen opens. The rows use `table_name 'system'`, so they do not affect the go-live rollback guard (checked: `goLiveService.js:254-261` counts only real tables). | Write the grant row for restore after the restore, or into the history file. Leave read-only channels out of `AUDITED_GRANTS`. |
| I5 | Info | Proposal edits: browser fallback differs, and an edit can lift a rejection | The desktop service always sets `Needs Review` (`bankReconciliationService.js:657-659`). The browser fallback still honours `payload.status` (`browserFallbackApi.js:798`). An edit (the `edit` permission) of a **Rejected** proposal moves it to `Needs Review`, where `approve` accepts it. This was the same at a97, because the screen never sends `status`. | Mirror the rule in the fallback. Decide whether a Rejected proposal can be edited. |
| I6 | Info | Carried over | Phonetic runs (`<rPh><t>`) are joined into the text ("漢字カンジ"), at a97 and at 3c1. a97 I1: 200,000 rows plus 200,000 blank lines are still refused (only the message changed). a97 I5: `go_live_rollback_refused` still has no `company_id` (`main.js:1332`). | As in the a97 report. Skip `<rPh>` bodies in `parseSharedStrings`. |

---

## Checks asked for

### `tallyTagBlocks` against the old regexes

- **Fuzz** (`tally-diff.mjs`). I copied the a97 regex helpers (`tallyTagValue`, `tallyNestedTagValue`, `tallyRepeatedTagValues`, `namedTallyBlocks` and the `RATEDETAILS.LIST` loop) and ran them against the new ones on 200,000 random documents × 14 tag names. The documents include:
  - nested same-name tags (`LEDGER` inside `LEDGER.LIST` inside `LEDGER`);
  - upper, lower and mixed case, with a closing tag in a different case;
  - self-closing tags with attributes;
  - unclosed opens and stray closes;
  - `</TAG >`;
  - a `>` inside an attribute value;
  - `&#4;`, Devanagari text and prefix names (`LEDGER` / `LEDGERNAME` / `LEDGER.LIST`).

  Result: **2,800,000 cases, 0 differences.** The only difference by construction is that the old repeated and named helpers did not escape `.` in the tag name, so `<ADDRESSXLIST` would have matched `ADDRESS.LIST`. No Tally tag looks like that.
- **Real-shaped export** (`probe-tally-eq.mjs`). 300 ledgers and 300 stock items, with:
  - CGST/SGST/IGST rate details, one in lower case;
  - a self-closing `HSNDETAILS.LIST`;
  - two `BATCHALLOCATIONS.LIST`;
  - nested `LEDGER.LIST`;
  - Indian-language names and entities.

  The file was saved once as UTF-8 and once as UTF-16 LE with a BOM. `previewTallyMasterMigration` and `previewTallyStockXml` give **byte-identical JSON** at a97 and 3c1 (1,361,570 bytes each).
- Self-closing tags behave as before (the open tag still swallows up to the next close). This was already the case at a97 (I6 territory), so it is not a regression.

### Order closure

`closure.out`, using the real posting services (`postSalesVoucher`, `postReceiptVoucher`, `createAdvanceReceipt`/`adjustAdvanceReceipt`, `reverseVoucher`, guided vouchers).

**Correct:**

| Case | Result |
|---|---|
| S1 full receipt | Settled |
| S2 receipt 900 + TDS 20 + GST TDS 20 + other 60 | Settled |
| S3 partial receipt | Not settled, invoice named |
| S4 advance adjusted | Settled |
| S6 receipt reversed | Not settled (allocations are soft-deleted on reversal) |
| S7 only invoice, reversed | Not ready (no posted invoice) |
| S8 reversed, re-billed and paid | Settled |
| S11 overpaid | Settled |
| S12 two invoices, one paid | Not settled |
| S13 1 paisa left | Not settled |
| S14 draft receipt | "1 receipt(s) are saved but not posted" |

**Wrong:** S9 and S10 (M1). **Fails open:** S15 and S16 (I1).

The new "Invoice Posted" / "Payment Settled" labels keep their old keys. No renderer code matches the old labels, and both screens show the new `detail`.

### Real-shaped imports

`imp-a97.json` against `imp-3c1.json`. These are **identical**:
- CSV with quoted commas, doubled quotes and a newline inside a quoted cell, plus Devanagari, Tamil and ₹ values;
- UTF-8 BOM with a Bengali header row;
- CSV trailing empty columns;
- TSV `.xls`;
- HTML `.xls` with `TR`/`Tr`/`tR`/`TD`/`Th` tags, `&nbsp;` and inline `<b>`;
- xlsx with rich-text runs (`<r><rPr>…`), Telugu-city text, inline strings, `t="str"` formula results and numbers.

The only differences are the two late-header cases (L3, and a97 L3 closed). The single-pass `decodeXml` changes only double-encoded text such as `&amp;lt;`. That text now decodes once (correctly) instead of twice.

### Profit Simulator

- **0 differences** in range (see L1).
- The baseline uses `inventoryCostBasis ?? purchaseValue`, as before. The old `inventoryCostBasis || …` in the scenario was dead code, because the baseline totals never held that key.
- `profitability:simulate` works through IPC with `params` set to `null`.
- The route in `App.jsx:1335` is the only place the screen is rendered, so it is not drawn twice.

### Proposal review edits (maker/checker)

- `VoucherProposalScreen.jsx:44-58, 76` never sends `status`. "Save" moves the proposal to `Needs Review`. Approve (`bankReconciliationService.js:691`) accepts `Needs Review`. Draft and post still require `Approved`.
- The new "Already Booked" edit refusal matches the approve refusal.
- The suite test (`audit2-regressions.test.mjs:700-708`) shows that sending `status: "Approved"` stays `Needs Review`, and that draft creation is refused.
- The flow is not broken. See I5 for the fallback and the rejection gap.

### Other changes checked

- **Session-bound actor.** `actorId()` now reads the AsyncLocalStorage actor that `handle()` sets for every signed-in call (`main.js:785`), and `guarded()` overrides it with the fresh user record from the database. `withActor` passes `Uint8Array`/`Buffer` through unchanged, so `imports:parse-buffer` bytes reach the parser intact (it is now guarded).
- **`ROLLBACK_REFUSED`.** Every guard refusal carries the code (`goLiveService.js:213-266`). The suite test passes.
- **Order picker.** `entitySearchService.js:32` (the scope flag; the filter is at `:117-120`) applies by `company_id` only when one is given, so consolidated scope (`company_id` 0) still lists all orders. The suite test passes.

---

## Earlier findings (a97daf4 correctness report)

| ID | Status | Evidence |
|---|---|---|
| M1 Tally single file over 25 MB refused | **Closed** | `tallyImportService.js:439, 462-470`. The budget is now 50 MB, and a single oversized file gets its own message ("export the masters in parts, for example ledgers and stock items separately"). `probe-tally2.mjs`, UTF-16 with BOM: **27.0 MiB, 12,000 ledgers, previewed in 1,485 ms** (refused at a97). 48.4 MiB, 21,500 ledgers, in 2,942 ms. 52.9 MiB refused in 1 ms with the per-file message. |
| L1 xlsx limits tightened | **Closed** (the residue is by design) | Cells are back to 2M (`importParserService.js:280`). R2 (20 × 60,000 = 1.2M cells) and R3b now import (`import2-3c1.out`). The 16M-character, 2M-cell and 67M-character messages now add "or save it as CSV". R4 (18M shared characters) and R6 (CSV with 40-character titles) are still refused, and R6's message does not mention CSV because it already is CSV. |
| L2 booleans stored as `"0.0"`/`"1.0"` | **Closed** | `crudHelpers.js:146`. `probe-bool.mjs`: `remarks:false` gives `'0'` (text), `track_serial_number:true` gives `1` (integer), and `gst_rate:true` gives `1` (real). No flag-like column is declared as text, and no column (apart from `sqlite_sequence`) has no declared type. The suite now asserts the stored `"0"`. |
| L3 late header, one-column case parsed as junk | **Closed**, with a new side effect (L3 above) | H4 (one-column header at row 61) is now refused with the guided message. H2 still parses 69 rows in a two-column sheet. H1 is still refused. |
| I1 TSV line cap counts blank lines | Open (only the message changed) | R12 is still refused. |
| I5 rollback refusal has no company | Open | `main.js:1332`. |

---

## Recommended order

1. **M2.** A one-line fix: admin must see the audit trail. Add an IPC test per role.
2. **M1.** Count credit notes, the same way the bill-wise report does, and judge settlement per order. Add S9 and S10 as tests.
3. **L2.** Make the integrity script run both suites even when one fails, and relax the timing limit.
4. **L1.** Load the simulator baseline once.
5. Then L3 and I1–I6.

None of these needs a schema or preload change. M1 needs no IPC change.
