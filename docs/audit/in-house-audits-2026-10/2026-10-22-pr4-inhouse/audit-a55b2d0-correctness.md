# Correctness audit of commit a55b2d0

- Repo: gii-gem-erp, HEAD `a55b2d0` ("Close the 219b2d3 audit findings"), branch `claude/erp-full-automation-qbhv8k` (PR #4)
- Diff reviewed: `git diff 219b2d3 a55b2d0` (14 files, +339/-104). I also read the callers of the changed code: `createRecord`/`updateRecord`/`withStoredFields`, `guardBankDetailWrite`, `bulkImportRecords`, the CRAC and closure IPC handlers, `assertSelectedFile`, the voucher-proposal service, `executeAutoRollback` and the Go-Live wizard.
- Baseline: `audit-219b2d3-correctness.md` (findings 1–10), `audit-219b2d3-security.md` (N9–N12) and `audit-219b2d3-architecture.md` (N1–N4, M1).
- Date: 2026-11-10
- Scratch work is in `/tmp/audita55-correctness/`. `src219/` is a `git archive` of 219b2d3, used for before/after runs (`REPO=/tmp/audita55-correctness/src219 node <probe>`). Outputs are saved as `*-a55.out` and `*-219.out`.
  - `probe-bank.mjs`: supplier, company and bank writes with numbers, blanks, aliases and invisible characters, as admin and as data_entry_operator (cases U1–U21, C1–C4).
  - `probe-golive.mjs` (G1–G7) and `probe-golive-lost.mjs` (L1–L3): the rollback guard with full, lost and 219b2d3-shaped marks, with the real `executeEnhancedReset`, `rebuildZeroState`, `verifyGoLiveProduction`, allocation and voucher-proposal services, and an app restart.
  - `ipc.test.mjs`: `go-live:rollback`, `crac:*` and `voucher-proposals:update` through real IPC. Run it with `cd /home/claude/gii-gem-erp && node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/audita55-correctness/ipc.test.mjs`.
  - `probe-crac.mjs` (K0–K5): CRAC and closure services with a failing audit writer.
  - `probe-import.mjs [hdr|ss|rows|search]` (I1–I9) and `probe-tsv.mjs`: import caps, header search, shared strings and TSV blank lines.
  - `probe-tally.mjs` (T1–T2): the Tally migration preview with a repeated file and with 20 distinct files.
- I did not edit the repo. During the audit, `git status` showed `src/renderer/features/dashboards/drilldowns/StockDrilldown.jsx` as modified, with mtime 16:12 UTC. My probes do not write there: it is a renderer file, and every probe uses temp databases. It comes from another session working in the same checkout. It is outside this diff, and I left it untouched.

## Overall rating: Low

`npm run test:integrity` passes: **93/93 node tests and 19/19 IPC tests** (`/tmp/audita55-correctness/integrity.log`). The six new tests are included. `npm run lint:syntax` exits 0, and it now covers the changed service files. No rebuild was needed.

Every claimed fix reproduces. The commit closes security **N9, N10 and N11**, architecture **N1 and N2**, and correctness findings **1, 3, 5, 7 and 10 (wizard text)**. N12 and arch N3/N4 are closed in part. I found **no High or Medium** regression.

Five Low items remain:
- Correctness finding 4 / security N4 was not addressed. A blank column, or a second alias that disagrees, still wipes a verified `bank_details` for an admin and falsely refuses a data-entry user (L1).
- Three new Lows come from the parser changes: the TSV blank-line fix costs about 3 s of main-thread CPU (L2); the new key-size cap refuses a CSV that is inside the row and value caps, with an unguided message (L3); and N12 still has a residue (L4).
- The non-bank part of correctness finding 2 remains (L5).

| ID | Severity | Area | Evidence | Fix |
|---|---|---|---|---|
| L1 | Low | crudHelpers `withStoredFields` (finding 4 / security N4, **unchanged**) | `crudHelpers.js:91-95`: when the column is sent, `partChanged` compares it raw, so `""` or `null` counts as a change. When the column is not sent, it fires on *any* alias that differs, while the normalizer (`:118-120`) takes the *first* alias that has a value. `probe-bank.mjs` U1–U5 (U1 `{supplier_account_number:"", account_number:<stored>}`, U2 null column, U3 blank branch, U4 `{beneficiary_ifsc_code:<stored>, ifsc:"HDFC0000001"}`, U5 blank bank plus beneficiary = stored plus a different `bank_name`): as **admin**, every column is unchanged but `bank_details` = `""` and one `bank_details_changed` row is logged. As **DEO**: "Permission denied: settings". The output is identical at 219b2d3 (`bank-219.out`). | Decide `partChanged` on the normalized parts: compare `normalizePayloadForTable(…, {composeBankText:false})[field]` against `oldRecord[field]` with `sameBankValue`, which is `supplierBankPartsChanged`'s rule. Do not use the raw keys. Add U1–U5 as tests. |
| L2 | Low | importParserService `parseDelimited` (new) | `importParserService.js:95-100` splits every line and maps every cell **before** it skips blank lines. A 25 MB tab `.xls` of blank lines is now **accepted after 3.0–3.1 s** (0 rows, 0.8 GB RSS). At 219b2d3 it was refused in 1.1–1.5 s. `"\t\t\n"` × 8.3M takes 2.0–3.5 s, against 0.35 s before (`probe-tsv.mjs`, `tsv-a55.out` / `tsv-219.out`). The false refusal is fixed: I6c, 200,000 rows plus blank lines, is accepted (`import-a55.out`). | `if (!line.trim()) continue;` before `split` (the delimiter is always `\t`, which `trim` removes), and walk the text with `indexOf("\n")` instead of `split`. |
| L3 | Low | `toRecords` key-size cap (new) | `:29`, `:51-53`: `keyChars * rows > 128 Mi` shares the generic message "more than one import can read safely". Probe I3b: an 11.4 MB CSV of 30 columns with 25-character headers and 190,000 rows (5.7M values, under both the 200k-row and the 6M-value caps) is **refused**. 219b2d3 accepted it in 1.0 s. A 40 × 30-character × 50,000-row CSV still imports (I3, 0.46 s). | Give the key cap its own message ("the column titles are long; shorten them or split the file"), or raise it to the point the 6M-value cap already implies (for example 6M × 32 characters). Add a test at the boundary. |
| L4 | Low | N12 residue (shared-string text, Tally preview) | Fixed: 12M `<si/>` is refused in 1.3 s (5.3 s before, I4); the header search over "A A A" cells takes 0.27 s (5.4 s before, I5); one file listed 10 times in the Tally preview takes **2.5 s** (23.5 s before, T1). Still open: one *unreferenced* 60M-character shared string still costs 1.8 s and 0.7 GB (I4c), because `parseSharedStrings` (`:174-184`) counts entries but not decoded characters. **20 distinct picked copies** of that file block the Tally preview for **48.8 s** (T2). Each copy must be picked in the file dialog (`main.js:267-271`), so this needs a user who picks 20 crafted files. | Stop `parseSharedStrings` once the decoded characters pass `MAX_SHEET_CHARS`. Longer term, move parsing to a worker (security N11/N12 note). |
| L5 | Low | Non-bank supplier fields (rest of finding 2) | `normalizeBankFields` (`bankDetailsPolicy.js:57-65`) covers only the bank fields. U13 `{contact:false}` and C4 (create) still throw the raw "SQLite3 can only bind numbers, strings, bigints, buffers, and null". U14 `{supplier_code:0}` stores `"0.0"`. This is unchanged from 219b2d3. | Coerce or refuse non-string values for all supplier text fields in `normalizePayloadForTable`, reusing `normalizeBankValue`'s rule and message. |
| I1 | Info | XLSX header search scans every row | `:317-323`: `findIndex` now runs over the whole matrix. A generic sheet with no title in its header (for example a bank statement: `Date, Narration`) that has a data cell equal to a title ("Company Name") at row 70 is now **refused**: "the header row … is row 70" (I8). 219b2d3 parsed it as 69 rows. | Only refuse when the matching row is also a plausible header (for example at least two non-empty cells that are not numbers), or search only the first 50 rows and refuse when a title is found below them *and* row 0 has none of the titles. |
| I2 | Info | Arch N4 remainder | A sheet whose header has none of the five titles still falls back to row 0 with no message (I7: 60 title rows give 61 junk rows). This matches the old behaviour, and generic sheets need the fallback. The commit only refuses titles found beyond row 50. | Keep the fallback for generic imports. For master imports, require the title. |
| I3 | Info | Long first-row titles in CSV/HTML | I1b and I1c: a CSV or HTML `.xls` whose first row is a title of more than 100 characters is now refused ("column 1 has a header of 121 characters"). Before, it produced junk keys. This is an improvement, but the advice to "shorten the column titles in the first row" does not fit a title line. | Add "or delete the title rows above the header". |
| I4 | Info | New audit rows: wording and volume | G4: action `voucher proposal proposal approved` (the word is doubled; `bankReconciliationService.js:403` prefixes "voucher proposal" to "Proposal Approved"). The guard's refusal names "allocation audit" and "voucher proposal audit" rather than the business tables (G2, G4). Generate writes one `audit_log` row per proposal plus a summary (`:587`, `:591`). Post now writes two rows (`:769-770`). | Use `action: payload.action.toLowerCase()`. Map `allocation_audit` and `voucher_proposal_audit` to readable names in the refusal. Skip the general row for the post, which is already audited. |
| I5 | Info | CRAC services | C3 (IPC): `crac:update id {}` writes a `crac_updated` row with no change, and that row blocks a go-live rollback. K4: `noAudit` is the default (`cracService.js:9`, `orderClosureService.js:37`), so a direct caller still writes no audit row. Today only `main.js:1366-1374` calls these services. K5 (pre-existing, not in this diff): a CRAC with `company_id` 2 on an order of company 1 is accepted, and the audit row takes the payload's company. | Skip the audit when `updates` is empty. Make `audit` a required parameter. Check the CRAC's company against its order. |
| I6 | Info | Carried over, not addressed | Finding 6: `{supplier_name:"   "}` still renames to the account name (`f6.out`). Finding 9: one CSV row of 12.5M commas still takes 2.9 s (I6e). The "64 million" message (`:305`) is still there. The lost-mark test still writes the reset row by hand (`audit2-regressions.test.mjs:110`). `failGoLiveWithRollback(…, db, userId)` still has unused parameters (`goLiveService.js:282`). U+2060 is not stripped (U16 stores `111122223333⁠`, as before). The limits are not gathered into one `IMPORT_LIMITS` object. | As in the 219b2d3 reports. |

---

## Verification of the claimed fixes

| Claim (commit message) | Prior finding | Status | Evidence |
|---|---|---|---|
| The guard counts allocation and bank-proposal work | Security N9 (Medium) | **Fixed** | `goLiveService.js:173` drops `allocation_audit` and `voucher_proposal_audit` from `NOT_BOOK_TABLES`. G2, G2c (full mark): receipt and supplier unallocate are refused. At 219b2d3 both were ALLOWED. G2b: a mark written by 219b2d3, which has no keys for those tables, still refuses through the `audit_log` row (`table_name = allocation_audit`). L1 (lost mark): unallocate is refused (ALLOWED before). |
| Proposal writes leave `audit_log` rows | Security N9 | **Fixed** | `bankReconciliationService.js:403`. G4: approve, update and reject under a full mark are each refused (ALLOWED before). The row has `company_id 1`, `user_id 1`, `table_name voucher_proposals` and the correct `record_id`. L3 (lost mark): approve is refused. IPC P1: `reviewed_by` comes from the session (1), not from the payload's `user_id: 4242` (`main.js:879`). |
| No false refusal after a normal go-live | Regression check | **Holds** | G1 runs the real reset, `rebuildZeroState`, the mark and `verifyGoLiveProduction`. It is **ALLOWED**, and still ALLOWED after closing and re-running `initializeDatabase` (an app restart). There are 0 audit rows after the reset row. The new mark holds `allocation_audit: 0` and `voucher_proposal_audit: 0`. |
| A mark at audit position 0 is checked | Correctness 1 | **Fixed** | `:246` `mark.auditId != null`. G5: an empty `audit_log`, a lost mark and the real reset are ALLOWED right after the reset. After a supplier is created: **refused** "suppliers changed" (ALLOWED at 219b2d3). Legacy marks without an `auditId` still skip the check (G7). No current writer produces one. |
| Bank values normalized at the start of `cleanPayload`; whole numbers kept as digits; other non-text refused with a guided message; one `sameBankValue` rule; the guard only checks | Arch N1 (Medium), security N10, correctness 2 (bank part) and 5 | **Fixed** | `crudHelpers.js:145`, `bankDetailsPolicy.js:35-65`, `init.js:1753-1754` (the trim is gone from the guard). `bank-a55.out` against `bank-219.out`: U8 `111122223333` (number) is stored as `"111122223333"` (was `"…3333.0"`) with no bank row, for admin and DEO. U9/U10 `0` gives `"0"` and the text "Account Number: 0" (was `"0.0"` / "-"). U6/U7: a ZWSP resend keeps the stored text, with 0 bank rows, and is allowed for DEO (before, the text was rebuilt and DEO was refused). C1: the padded create builds the text from clean parts ("Account Number: 77; … IFSC: IFSC1"). U11/U12/U20/U21 (−5, NaN, 2^53, BigInt) are refused with "must be entered as text". Companies `999000111` gives `"999000111"`. The banks create with no actor is trimmed (the guard is not needed for this). The caller's payload is not mutated. The only path to `guardSensitiveWrite` is through `cleanPayload` (`crudHelpers.js:406/412, 459/468`). See L1 and L5 for what is left. |
| Supplier bank text built from clean parts | Correctness 5, arch S11 | **Fixed** | U7 and C1 above. `hasValue`-based `part()` (`crudHelpers.js:126`). |
| CRAC create/update/delete and the closure mark audited inside their transaction, with `company_id`; the `main.js` wrappers are gone | Arch N2, correctness 7 | **Fixed** | IPC C1–C4: `company_id 1`, `user_id 1`, `record_id 1`. Update and delete carry `old_value`. `created_by` comes from the session (1, not the payload's 999). C5: an unknown id adds 0 rows. K1: the closure row has `company_id 1`. K2: a throwing audit writer leaves `operationally_closed = 0`. K3: a throwing audit writer rolls back both the CRAC update and the `supply_orders.crac_number` change. See I5. |
| Rollback refusals return the same shape as failed rollbacks | Arch M1(2) | **Fixed** | `main.js:1313-1319`. IPC R1: work after the mark gives `{rollbackResult:{success:false, reason:"Rollback refused: suppliers changed…"}}`, no throw, 0 audit rows, and the history stays `in_progress`. R2 (unknown id): the same shape. The only renderer caller is `GoLiveWizard.jsx:171`, which reads `rollbackResult`. |
| No doubled "Rollback failed:"; pending-restore message guided | Correctness 10, arch M1(6) | **Fixed** | `GoLiveWizard.jsx:174-176` shows a failed outcome's own reason as it is. `rollbackService.js:52` is guided. Every failure reason from `executeAutoRollback` and the handler starts with "Rollback refused:" or "Rollback failed:". |
| Header names capped at 100; total key size capped | Security N11 (Medium) | **Fixed** | I2b: the 219b2d3 N11 file (500 × 32,000-character headers, 300 rows; 4.5 GB reply at 219b2d3) is refused in 46 ms. The worst accepted case (500 × 100-character headers, 2,684 rows, a 17 KB xlsx) serializes to **139.6 MB in 102 ms**. 2,685 rows are refused. See L3. |
| Shared-string count capped; header search skips long cells | Security N12 (Medium) | **Mostly fixed** | I4, I5 and T1 above. See L4. |
| A header found past row 50 is refused | Arch N4, correctness 8 | **Fixed for that case** | The suite test (row 61) passes. I9: row 50 is still accepted. Padded or upper-case titles still match (I9b, I9c). See I1 and I2. |
| TSV counts only filled rows | Correctness 3 | **Fixed** | I6c: 200,000 rows plus 5 blank lines are accepted (refused at 219b2d3). I6b: 200,001 rows are refused. See L2 for the cost. |
| Value cap back to 6M | Arch N3(1) | **Done** | `importParserService.js:24`. The suite's wide test is now 300 × 15,000. |
| The Tally preview reads each picked file once, at most 20 | Security N12 | **Fixed** | `tallyImportService.js:425-443`. T1: 10 listings, 1 summary, 2.5 s (23.5 s before). 21 files are refused (suite). The dedupe key `path.resolve` is the same key `assertSelectedFile` uses (`main.js:268`), so a case or `./` variant that is not the picked path is refused before the dedupe. See L4 for 20 distinct files. |
| `lint:syntax` covers the changed service files | Arch I1 | **Done** | `package.json:25`. Exit 0. |

---

## Regression checks requested

### Bank normalization at the start of `cleanPayload`

- **Order.** `updateRecord` calls `withStoredFields`, then `cleanPayload`, which runs `normalizeBankFields` and then `normalizePayloadForTable`. The stored columns merged into the payload are normalized too. All bank columns are `TEXT` (`init.js:314-315, 350-358, 393-394`; `schemaDefinitions.js:1307, 1331`), so stored values are strings or null and never trigger the "must be entered as text" refusal on an unrelated edit (U18: no change and no bank row).
- **Aliases.** `SUPPLIER_BANK_ALIASES` (`crudHelpers.js:140`) holds `beneficiary_account_number`, `account_number`, `beneficiary_bank_name`, `bank_name`, `beneficiary_ifsc_code`, `ifsc`, `beneficiary_branch` and `branch`. All are normalized (U10, C1). The guard and `supplierBankPartsChanged` now share `sameBankValue`.
- **Callers.** No renderer field coerces bank values to numbers (grep over `src/renderer`), so the new refusal is reached only through direct IPC or a hand-built payload. Bulk import passes parser strings.
- **What is left.** L1 (the `partChanged` decision still looks at raw keys), L5 (non-bank fields) and U16 (U+2060 is not in `EDGE_SPACE`, unchanged).

### Supplier bank-text rebuild

`!hasValue(bank_details)` and `SUPPLIER_BANK_PARTS.some(hasValue)` replace the truthiness checks (`crudHelpers.js:125-133`). This changes behaviour in two places:
- A whitespace-only `bank_details` now counts as absent and is rebuilt.
- `0` is now shown as `0`.

Both are correct (U9, C3). C3 at 219b2d3 stored `"0.0"` with an **empty** `bank_details`, because `"0.0" || …` was the only part and the old check read the number `0` as falsy. It now composes the text. No other caller of `normalizePayloadForTable` composes text (`supplierBankPartsChanged` passes `composeBankText:false`).

### Go-live rollback guard

- **Counting the two audit tables cannot cause a false refusal on its own.** Their rows are written only by `allocationAudit` (`init.js:1460`) and `proposalAudit`. Both are user actions, and neither runs during reset, zero-state, verify or start-up (G1, including the restart).
- **Old marks still work.** For a full mark written by 219b2d3, `compared` comes from `now.tables`. The missing key reads as `0`, so any row in those tables counts as growth. That is correct, since the reset empties them (`operationalResetService.js:47, 59`). The `audit_log` path catches the rest (G2b).
- **The `auditId != null` change keeps the legacy flat-mark behaviour.** `resetAuditIdFor` returns a number or `null`.

### Voucher-proposal audit rows

Rows are written for every `proposalAudit` call, in the same statement sequence as the `voucher_proposal_audit` insert. `company_id` and `user_id` are correct (G4, P1). See I4 for wording and volume.

### CRAC and closure: transactional, with an injected writer

better-sqlite3 nests these transactions as savepoints inside `guarded`, so nothing changes for IPC callers. Return shapes are unchanged:
- create and update return the row;
- delete and closure return `undefined` (C4).

### Import parser caps and header search

Covered by the I-cases above. No regression was found for normal sheets:
- a 40 × 50,000 CSV imports;
- padded and upper-case titles still match;
- a header at row 50 still parses.

The regressions are L2, L3 and I1.

### Tally preview dedupe

The dedupe is correct and complete against the allow-list (see the table). Errors per file are still caught one file at a time.

### GoLiveWizard and `go-live:rollback`

Both behave as described in the table. The guard refusal no longer reaches `handleError(err, 8)`, but `handleError` was already called on the line before the rollback (`GoLiveWizard.jsx:170`), so the screen state is the same.

---

## Recommended order

1. **L1**: decide `partChanged` on normalized parts. This is the only remaining path that changes stored bank text without a real bank change.
2. **L2 and L3**: a cheap blank-line skip in `parseDelimited`, and a separate message for the key cap or a higher key cap.
3. **L4**: a character cap for `parseSharedStrings`.
4. **L5, I1, I4 and I5**: small edits. Then the I6 carry-overs.

None of these needs a schema, IPC, preload or route-key change.
