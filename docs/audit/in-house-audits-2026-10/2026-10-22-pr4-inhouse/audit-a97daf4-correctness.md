# Correctness audit of commit a97daf4

- Repo: gii-gem-erp, HEAD `a97daf4` ("Close the a55b2d0 audit findings"), branch `claude/erp-full-automation-qbhv8k` (PR #4)
- Diff reviewed: `git diff a55b2d0 a97daf4` (9 files, +235/-79). `f4b5e8d` is the small renderer change (StockDrilldown). `a97daf4` is the main fix. I also read the callers of the changed code:
  - `createRecord`, `updateRecord`, `withStoredFields` and `cleanPayload`, with every caller in `src/main` and the renderer's `MasterScreen` and `TransactionScreen`;
  - the checkbox and form-field renderers;
  - the CRAC and closure services and their IPC handlers;
  - the voucher-proposal service;
  - `assertGoLiveRollbackSafe`, the `go-live:rollback` handler and `GoLiveWizard`;
  - the Tally preview entry points.
- Baseline: `audit-a55b2d0-correctness.md` (L1–L5, I1–I6). I also checked the related items in `audit-a55b2d0-security.md` (N11-R, N12-R, N13, N4) and `audit-a55b2d0-architecture.md` (N5–N9).
- Date: 2026-11-10
- Scratch work is in `/tmp/auditA97-correctness/`. `srcA55/` is a `git archive` of a55b2d0, used for before/after runs (`REPO=/tmp/auditA97-correctness/srcA55 node <probe>`). Outputs are saved as `*-a97.out` and `*-a55.out`.
  - `probe-bank.mjs`: the a55 cases U1–U21 and C1–C4, plus the new U22–U32: null and undefined columns, an explicit clear, a real change through an alias, objects, booleans, and the column against the alias.
  - `probe-bool.mjs` (B1–B5): booleans, numbers, `Date` and `Buffer` through `createRecord`.
  - `probe-import.mjs` (the a55 I-cases) and `probe-import2.mjs` (R1–R12 realistic and boundary sheets; H1–H5 header search).
  - `probe-worst.mjs` (W1–W3) and `probe-reply.mjs` (X): worst cases within the caps, for N12-R and N11-R.
  - `probe-tally.mjs` (T1–T2) and `probe-tally2.mjs` (TX): the Tally preview with repeated files, 20 picked files, and one large UTF-16 master export.
  - `probe-proposal.mjs` (P, Q): proposal update, approve and reject with a failing audit write and on refused states.
  - `ipc.test.mjs`: `go-live:rollback` (R1, R1b, R2, R3 with an injected database fault), `crac:*` and `voucher-proposals:update` through real IPC. Run it with `cd /home/claude/gii-gem-erp && node --import ./scripts/audit/lib/electron-register.mjs --test /tmp/auditA97-correctness/ipc.test.mjs`.
- I did not edit the repo. `git status` was clean during the audit, and the earlier stray `StockDrilldown.jsx` change is now committed as `f4b5e8d`.

## Overall rating: Low, with one Medium regression

`npm run test:integrity` passes: **98/98 node tests and 19/19 IPC tests** (`/tmp/auditA97-correctness/integrity.log`). The five new tests are included. `npm run lint:syntax` exits 0.

**What is closed.** Every Low from the a55b2d0 correctness report is closed except L5:
- **L1**, the alias and blank-column wipe of `bank_details`. U1–U5 now keep the stored text for both admin and DEO, with no bank row.
- **L2**, the TSV blank-line cost: 3.7 s → 73 ms.
- **L3**, the key cap now has its own message.
- **L4**, the shared-string residue: I4c 2.3 s → 0.14 s; 20 picked files 48.8 s → 2.5 s.

These are also closed:
- security N13 (an `undefined` key wiped a bank value);
- architecture N6 (proposal writes are now atomic);
- architecture N7 (the CRAC and closure audit writer is required);
- architecture N8 (a database fault in the rollback guard is thrown, and a refusal is audited);
- the doubled audit wording (I4).

Security N12-R and N11-R are mostly closed (see below).

**What is new.** The new caps cause three regressions:
- **M1 (Medium).** The Tally migration preview now refuses a *single* Tally master XML over 25 MB. a55b2d0 accepted it in 1.9 s. The refusal tells the user to "preview them in smaller batches", which a single file cannot be.
- **L1.** The xlsx limits are tighter: 1M cells, 16M shared-string characters, and a combined title and value budget. Ordinary workbooks that a55b2d0 accepted are now refused. This also answers the 30 × 100,000 question (see the regression section).
- **L3.** The header-search change moved one false refusal into silent junk.

**What is still open.** L5 remains, and it is now silent: booleans sent to text columns are stored as `"0.0"`/`"1.0"` instead of failing (L2 below).

| ID | Severity | Area | Evidence | Fix |
|---|---|---|---|---|
| M1 | **Medium** | Tally migration preview: one 25 MB budget (new) | `tallyImportService.js:426, 444-451` sums `statSync` sizes across the selected files and refuses over 25 MB. The budget also applies to a **single** file. Before, no Tally XML had a size cap. `previewTallyStockXml` (`:417-423`) still has none, so the same file is accepted by the Tally XML Import screen and refused by the Migration Assistant. `probe-tally2.mjs` (`tally2.out`) uses a Tally-shaped "All Masters" export with 12,000 ledgers, saved as UTF-16 LE with a BOM, as `readXmlText` (`:117-128`) expects. The file is **27.0 MiB**. a55b2d0 previews it in **1,922 ms** (12,000 ledgers). a97daf4 refuses it in 1 ms: "the selected files total 27.0 MB; one preview reads at most 25 MB. Preview them in smaller batches." My synthetic ledger is about 2.3 KB in UTF-16. Real Tally exports carry many more empty `*.LIST` tags per master, so the 25 MB line is likely reached with a few thousand masters *(inferred; no real export was available)*. The suite test (`audit2-regressions.test.mjs:491-492`) uses two 13 MB files, so it does not catch the single-file case. | Apply the total budget only when it is larger than the largest single file the preview already accepts. For example: refuse when `totalBytes > max(25 MB, largest single file)` and more than one file is selected, plus a per-file cap set from real exports (for example 100 MB, the same as the Tally XML Import screen, which has none today). Give a single oversized file its own message ("this export is N MB; export the ledgers and stock items separately from Tally"). Add a single-file test above 25 MB. |
| L1 | Low | xlsx capacity tightened: 1M cells, 16M shared-string characters, combined reply budget (new) | `importParserService.js:243` sets `MAX_XLSX_CELLS` 2M → **1M**. `:244, :223` add the 16 Mi shared-string character cap. `:57-65` add the combined title and value budget of 128 Mi characters. `probe-import2.mjs` (a55 → a97): **R2** xlsx 20 × 60,000 (1.2M cells, 4.7 MB) went from 60,000 rows to **refused**. **R3b** 30 × 33,400 went from accepted to **refused**. **R4** 10 × 90,000 with five unique 40-character text columns (18M shared characters, 4.5 MB) went from accepted to **refused** ("more than 16 million characters"). **R6** csv 30 × 100,000 with about 39-character titles went from accepted to **refused** ("titles and values together"). The 1M-cell cap is what security N12-R asked for, so this is a deliberate trade-off. The xlsx path now holds about 1/6 of the CSV path (200,000 rows / 6M values), and the refusal does not say that the same sheet saved as CSV would import. | Keep the caps until parsing moves to a worker. Then: add "or save it as CSV" to the 1M-cell and 16M-character messages; state the xlsx limits on the import screen and templates; and add tests at 1,000,000 and 1,000,001 cells and at the shared-character boundary. When parsing moves off the main thread (security N11/N12), return to 2M or more. |
| L2 | Low | Correctness L5 (non-bank fields): **not closed, now silent** | `crudHelpers.js:143-149, 159`. `storableValue` turns `true`/`false` into `1`/`0` for **every** column. better-sqlite3 binds JS numbers as REAL, so in a `TEXT` column they are stored as `"1.0"`/`"0.0"`. `probe-bank.mjs` U13 `{contact:false}` gives `supplier_contact "0.0"`; a55 threw the raw SQLite error. U29 `{remarks:true}` gives `remarks "1.0"`. C4 (create) gives `"0.0"`. `probe-bool.mjs` B2: `remarks false` gives `"0.0"` (typeof text). B3/U14: numbers in text columns are still stored as `"7.0"`/`"0.0"` (unchanged). Integer columns are fine: B1 `track_serial_number:true` gives integer `1`. The new test only checks that `{remarks:false}` does not throw (`audit2-regressions.test.mjs:532`). It does not check the stored value. No renderer path sends booleans: the generic checkbox sends `1`/`0` (`components/forms/index.jsx:142`), and so do `BillingVoucherScreen.jsx:450-451, 719, 723`. So this is reached only by direct IPC or a hand-built payload. | Decide by column type. Use `1`/`0` only for integer flag columns (`inventory_enabled`, `track_*`, `converted_to_work_order`). For text columns, store safe integers as `String(n)` and refuse booleans and fractions with `normalizeBankValue`'s message. Assert the stored values in the test. |
| L3 | Low | xlsx header search after row 50 (correctness I1, architecture N9): half fixed, with one new silent case | `importParserService.js:367-378`. A late row counts as a header only if it has ≥2 non-empty cells of ≤100 characters, one of them a title. **Fixed:** H2, a lone data cell "Company Name" at row 70, now parses 69 rows (refused at a55). **Still refused:** H1/I8, a bank-statement data row `2026-01-02, Company Name` at row 70, is refused as "the header row … is Excel row 70". Two short cells is what every data row of a two-column statement looks like. **New silent case:** H4, a one-column sheet whose header "Supplier Name" sits at row 61 after 60 title rows. a55 refused it with a guided message. a97 parses **61 rows under the key `title_0`**: no title is found in rows 1–50, the late check needs two cells, and the code falls back to row 0. The suite test was changed to match (`audit2-regressions.test.mjs` `row2(61, …)` and `.length, 60`). Downstream validation will probably reject rows without `supplier_name` *(not traced)*. Even so, the screen shows junk where it showed a clear reason. The "no title at all" fallback (architecture N4/N9, correctness I2) is unchanged. | Require the late row to hold **two or more known column names** (any `HEADER_TITLES` title plus the template columns), not "two short cells". For a master import with a template, refuse when no title is found anywhere, instead of falling back to row 0. |
| I1 | Info | TSV line cap counts blank lines | `:26, :116-122`. R12: a double-spaced TSV `.xls` of 200,000 rows (400,001 newline characters, 1.0 MB) was 200,000 rows at a55 and is **refused** at a97 ("more than 4,00,000 lines, most of them blank"). Correctness finding 3 (only filled rows count) is restored only up to 400,000 lines. In exchange, the cost is bounded: R8, 400,000 lines of 60 tabs, takes 0.7 s. | Count non-blank lines in the same `indexOf` walk, or skip `if (!line.trim()) continue` before `split` (the a55 L2 fix), then drop the line cap. |
| I2 | Info | CSV cell cap of 32,767 characters (new) | `:80-85, :99-104`. R10: a CSV with one 40,000-character quoted cell was accepted at a55 and is refused at a97. The message talks of "Excel's limit", but CSVs also come from other systems. R11, exactly 32,767 characters, is accepted. | Acceptable. Say "this file has a cell longer than 32,767 characters", not "save it again from Excel". |
| I3 | Info | `cleanPayload` now refuses objects, including `Buffer` and `Date` | `crudHelpers.js:145`. B4 `Date` changed from the raw SQLite error to a guided refusal. B5 `brand: Buffer` was **stored** at a55 and is refused at a97. Arrays and objects in an *allowed* field already failed at bind, except `Buffer`. No caller in `src/main` or the renderer sends a `Buffer`, `Date`, array or object in an allowed field. Lines such as `order_items` are outside `ALL_TABLES[table].fields`, so `cleanPayload` drops them before `storableValue`. Seed data and the integrity suite pass. | None. |
| I4 | Info | `withStoredFields` drops `null` as well as `undefined` (behaviour change) | `crudHelpers.js:82`. U30 `{remarks:null}` cleared to `""` at a55 and now keeps the stored value. U22 `{supplier_bank_name:null}` cleared the bank name and rebuilt the text (admin), or was refused (DEO), at a55; it now changes nothing. This applies only to `companies`, `suppliers`, `employees` and `banks` (`:76`). The only renderer writer, `MasterScreen.edit` (`MasterScreen.jsx:121`), maps `null` to `""`. The import update (`importValidationService.js:412`) merges `existing` and `incoming` strings. So no current caller loses a "clear". An explicit `""` still clears (U23: an admin clear of the branch rebuilds the text and logs one row; DEO is refused). | Document `""` as the only way to clear a field on these tables. |
| I5 | Info | Rollback refusal audit row | `main.js:1319-1320`. R1/R2: one `go_live_rollback_refused` row per attempt, with `user_id 1`, `table_name "system"` and **`company_id null`**. R1b: a repeated attempt gives the same reason. The row does not feed the guard, because `"system"` is not a book table (`goLiveService.js:248-252`). | Pass the run's `companyId`. |
| I6 | Info | Pre-existing (outside the diff): supplier form edits leave `bank_details` stale | `MasterScreen.edit` sends `bank_details` (`viewDefinitions.js:59`, `MasterScreen.jsx:121`). So `sent("bank_details")` is true and the text is never rebuilt when only the account number is edited (`crudHelpers.js:94`; the same rule held at a55). The combined text then shows the old number. | Rebuild when a part changed and the sent `bank_details` equals the stored one. |
| I7 | Info | Carried over, not addressed | Correctness I5/C3: `crac:update id {}` still writes a `crac_updated` row (IPC C3). An explicit `audit = null` still gives a raw TypeError, not the guided refusal. Post still writes two `audit_log` rows (`bankReconciliationService.js:778` plus the posting row). Finding 9: CSV with one row of 12.5M commas still takes 2.4 s (I6e). U+2060 is still not stripped (U16). There is still no single `IMPORT_LIMITS` object, and the en-IN grouping ("4,00,000") sits next to "1,000,000" in other messages. | As in the a55 reports. |

---

## Verification of the claimed fixes

| Claim (commit message) | Prior finding | Status | Evidence |
|---|---|---|---|
| An `undefined` or `null` key never overrides the stored value | Security N13, correctness L1 (U2) | **Fixed** | `crudHelpers.js:82`. U2 and U26 (`supplier_bank_name: undefined`): at a55 the bank name was wiped (`bn ""`) with one bank row, and DEO was refused. At a97 nothing changes, with 0 rows, for admin and DEO. Suite test at `audit2-regressions.test.mjs:512-526`. See I4 for the null semantics. |
| Invisible characters count as blank | Architecture N5 | **Fixed** for U+200B–U+200D and U+FEFF | `crudHelpers.js:53` uses the same set as `bankDetailsPolicy.js:27` `EDGE_SPACE` (`\s` already includes U+FEFF). U25: a ZWSP-only column next to an alias with a value takes the alias (admin rebuilds and logs; DEO is refused, which is correct for a real change). U+2060 is still not covered (U16). |
| The bank text is rebuilt only when a part's resolved value changes, by the same rule as `cleanPayload` | Correctness L1 / security N4 | **Fixed** | `crudHelpers.js:94` now calls `supplierBankPartsChanged` (`:101-105`) on `{...stored, ...payload}`, after alias-overridden columns are removed. That is the same normalized decision `updateRecord` passes as `composeBankText` (`:468`). `bank-a97.out` against `bank-a55.out`: **U1–U5** (blank or null column plus the same alias; conflicting `beneficiary_*` and short aliases) now keep `bank_details` and log 0 bank rows, and DEO is allowed. At a55 each one wiped the text (admin) or falsely refused DEO. Real changes are still caught: U24 (alias with a new number) rebuilds and logs 1 row, and DEO is refused. U31 (column = stored, alias differs) keeps the column ("the column wins"). U32 (`bank_details: null` plus a branch change) rebuilds. U17/U18 make no change. |
| `cleanPayload` stores yes/no as 1/0 and refuses lists and objects with a guided message | Correctness L5 | **Partly; see L2 and I3** | U27/U28: "remarks must be a single value, not a list or object…". B1: integer columns get `1`. Text columns get `"0.0"`/`"1.0"` (L2). |
| Shared strings capped per value (raw and decoded) and in total (16M); cell cap 1M | Correctness L4, security N12-R | **Fixed** (see L1 for the cost) | `importParserService.js:202-229, 243-244`. I4c: one unreferenced 60M-character string went from accepted in 2.3 s / 0.73 GB to **refused in 137 ms**. I4b: 1,999,999 empty `<si>` are refused (1M cap). W3, the worst case now accepted (390 unreferenced 32,767-character `&amp;` strings plus a 1M-cell sheet), takes **2.5 s**. The a55 "combo" vector took 4.1–6.6 s and is now refused at the cell cap. Residue: about 2.5 s of main-thread CPU within the caps. It stays until parsing moves to a worker. |
| CSV cells capped at 32,767 while reading | Security N8 (in part) | **Done** | `:80-85, :99-104`. Suite test at `:566-567`. I6e (12.5M commas, empty cells) is unaffected, at 2.4 s. See I2. |
| Titles and values share one reply budget | Security N11-R | **Mostly fixed** | `:57-65`. `probe-reply.mjs`: two-byte titles plus 1,000 references to a 32,767-character string went from a **337 MB** reply at a55 to **refused in 25 ms**. Residue: the budget counts UTF-16 code units, so 500 two-byte 100-character titles × 2,600 rows still give a **268 MB** reply (the same at a55). |
| TSV files over 400,000 lines refused before splitting | Correctness L2, security N8 | **Fixed** | `:116-122`. I6 (25M newlines) went from 3.7 s / 0.81 GB, accepted, to **73 ms, refused**. R8 (the largest blank file under the cap) takes 0.7 s. See I1. |
| A late header must look like a header, and is reported by its Excel row | Correctness I1, architecture N9 | **Half** | `:367-378`, `:322, :359-360`. H3 reports "Excel row 75" (the 61st filled row): correct. See L3. |
| Key cap has its own message | Correctness L3 | **Fixed** | `:53-55`. I3b now says "the 30 column titles total 750 characters and repeat on each of 1,90,000 rows…". The row and value caps keep the generic message (`:66-68`). |
| Tally preview: one 25 MB budget across all files | Security N12-R | **Fixed for the attack; regression M1** | T2: 20 distinct picked crafted files went from 48.8 s to **2.5 s**. T1 (one file listed 10 times) takes 0.16 s. See M1 for a single large legitimate export. |
| Proposal update, approve and reject run in one transaction with their audit rows | Architecture N6 | **Fixed** | `bankReconciliationService.js:639-704`. `proposal-a97.out` against `proposal-a55.out`: with `voucher_proposal_audit` **or** `audit_log` failing, all three operations leave the row `Suggested` / `orig`, with 0 rows in either table. At a55 the row became `Needs Review` / `Approved` / `Rejected` and left one orphan `voucher_proposal_audit` row when the general audit failed. The refused states (Posted, Already Booked) give the same messages as before, with no audit rows. Return shapes are unchanged. The status checks moved inside the transaction, but `getVoucherProposal` still reads before it. That is safe: better-sqlite3 is synchronous in one process. |
| Audit action reads "voucher proposal approved" | Correctness I4 (wording) | **Fixed** | `:403` strips a leading `proposal `. Q gives `voucher proposal approved`. IPC P1 gives `voucher proposal edited` with `reviewed_by` 1 from the session. "Voucher Posted" becomes `voucher proposal voucher posted` and "Draft Voucher Created" becomes `voucher proposal draft voucher created`: readable. |
| CRAC and closure refuse to write without an audit writer | Architecture N7, correctness I5 (default) | **Fixed** | `cracService.js:9-12`, `orderClosureService.js:37`. The only callers are `main.js:1369-1371, 1377`, which all pass `auditEntry` (`:1368`), and the suite (`audit2-regressions.test.mjs:500-508, 563`). There are no scripts, services or renderer callers (grep over `src` and `scripts`). The default throws inside the transaction, after the write, so the write is rolled back (suite `:563`). IPC C1–C5 behave as at a55. |
| `go-live:rollback` returns only guard refusals; other errors throw; the refusal is audited | Architecture N8 | **Fixed** | `main.js:1311-1323`. IPC R1: work after the mark gives `{rollbackResult:{success:false, reason:"Rollback refused: suppliers changed…"}}`, one `go_live_rollback_refused` row, and history stays `in_progress`. R2 (unknown id) gives the same shape and one row. **R3** (a database error injected into the guard's audit query) is **thrown** to the caller (`{"err":"disk I/O error (probe)"}`) with 0 audit rows. At a55 it would have been returned as a refusal. The only renderer caller, `GoLiveWizard.jsx:171`, sits inside the `try` whose `catch` calls `handleError(err, 8)` (`:180-181`). Every guard refusal starts with "Rollback refused:" (`goLiveService.js:238, 257, 264-277`). See I5. |
| StockDrilldown drops the unused accounting request (`f4b5e8d`) | — | **Correct** | `StockDrilldown.jsx:16-19`. The screen reads only `data.counts.*` (`:26-28`). No other reference to `accounting` remains. |

---

## Regression checks requested

### Supplier update merge

- **`withStoredFields` drops `undefined` and `null` keys** (`crudHelpers.js:82`). This affects the four `KEEP_OMITTED_ON_UPDATE` tables only. No current caller relies on `null` to clear (I4). The caller's payload is not mutated ("payload after call" in `bank-a97.out`).
- **`hasValue` treats invisible characters as blank** (`:53`). It is used in three places: the alias-presence check (`:90`), alias resolution (`:120`) and the text builder (`:124-125`). None of them ever sees a value that the bank normalizer would keep but `hasValue` would call blank, or the reverse, because the two use the same character set.
- **The bank text is rebuilt through `supplierBankPartsChanged`.** It runs twice per update (`:94` and `:468`) on the same merged object, so the two decisions cannot disagree. U1–U5 are closed. U9, U10, U19, U23, U24 and U32 still rebuild on a real change. I6 is a pre-existing gap.

### `cleanPayload`: booleans to 1/0, objects refused

- **Renderer callers.**
  - The generic checkbox sends `1`/`0` (`components/forms/index.jsx:142`), and the billing quick-item does the same.
  - `BusinessVoucherScreen`'s `inventory_enabled === "1"` and `authorize_excess` go to the business-voucher service, not to `createRecord`.
  - The checkboxes in `AllocationWorkflowScreen` and `AlertsSection` send booleans, but to their own IPC handlers, not to `records:*`.
  - None of these reached `cleanPayload` with a boolean before, because a boolean would have failed at bind.
- **Services.** Every caller of `createRecord`/`updateRecord`/`cleanPayload` sends primitives:
  - `seedData.js`;
  - `init.js:923, 971`;
  - `operationsService.js:106`;
  - `operationalPlanningService.js:20, 127`;
  - `importValidationService.js:412, 416`;
  - the supply-order paths (`crudHelpers.js:271, 294`).

  Arrays such as `order_items` are not table fields, so `cleanPayload` drops them before `storableValue`. `initializeDatabase` (seed) and the 117 integrity tests pass.
- **What is left.** L2 (text columns get `"0.0"`) and I3 (`Buffer` is now refused, with no caller affected).

### Import parser caps: do realistic sheets still import?

**30 columns × 100,000 rows:**

| Format | a55b2d0 | a97daf4 | What limits it |
|---|---|---|---|
| CSV, short values (R5, 20.6 MB) | 100,000 rows | 100,000 rows | The 25 MB file cap: at 30 × 100,000, the values must average about 7 characters or less. |
| TSV `.xls` (R7) | 100,000 rows | 100,000 rows | Same as CSV. |
| CSV with about 39-character titles (R6) | Imports | **Refused** | The combined title and value budget (L1). |
| xlsx (R1, 3.0M cells) | Refused | Refused | The 64 MB sheet-part cap (`:240`). A sheet of this size cannot be xlsx at either commit, and before a55 it was over the 2M-cell cap too. |

**Smaller xlsx sheets:** the practical xlsx ceiling is now about **1M cells**: for example 30 × 33,333, 20 × 50,000 or 10 × 100,000. Unique text must also total 16 Mi characters or less (R4 against R4b). See L1.

### Header search

See L3: H1–H5, I7–I9. Headers at rows 1–50, padded headers and upper-case headers still match (I9, I9b, I9c). H5 is pre-existing: a data cell "Company Name" at row 10 of a sheet whose own header has no title makes row 10 the header and drops rows 1–9. This happens at a55 too.

### Voucher-proposal transactions

The proposal transactions are correct and complete for update, approve and reject (P, Q). Generate, draft and post were already in transactions (`:573`, `:718`, `:753`).

### CRAC audit-writer requirement

There is no caller other than `main.js` and the tests (see the table).

### `go-live:rollback`

See the table. The refusal is still returned as a value. A non-refusal fault now reaches the wizard's `catch` and is shown through `handleError`. Before, it was disguised as "Rollback refused".

---

## Recommended order

1. **M1.** Exempt a single file from the total Tally budget, or give it a larger per-file cap, and add a test with one file over 25 MB. This is the only change that blocks a legitimate migration.
2. **L3.** Make the late-header test require two known column names. For template imports, refuse when no title is found.
3. **L2.** Coerce by column type in `storableValue`, and assert the stored values in the test.
4. **L1.** Add "or save as CSV" to the xlsx cap messages, document the limits, and add boundary tests. Revisit the limits when parsing moves to a worker.
5. Then I1, I5 and the I7 carry-overs.

None of these needs a schema, IPC, preload or route-key change.
