# Security audit of commit a97daf4

- **Date:** 2026-11-10
- **Scope:** `git diff a55b2d0 a97daf4`, read against the IPC surface in `src/main/main.js`. The areas checked were:
  - the import parser caps (`importParserService.js`);
  - the Tally preview byte budget (`tallyImportService.js`);
  - the bank-detail merge (`withStoredFields`, `storableValue`, `hasValue` in `crudHelpers.js`);
  - the audit row for a refused `go-live:rollback` (`main.js`);
  - the voucher-proposal transactions (`bankReconciliationService.js`);
  - the CRAC and closure audit defaults that now throw.

  The Tally XML path and the voucher-proposal status field are not new in this commit. They were attacked because the brief asked about the Tally preview and about the proposal hunk.
- **Method:** code review, plus probes through the real IPC handlers with the `scripts/audit/lib/electron-register.mjs` harness. Electron was not launched. As in the a55b2d0 audit:
  - the size of the IPC reply was measured with `v8.serialize`, the structured-clone serializer Electron uses for an `ipcMain.handle` reply;
  - main-process blocking was measured with a 100 ms timer. 0 ticks means the event loop was blocked for the whole call.
- **Repository:** not changed by this audit. HEAD is a97daf4 on `claude/erp-full-automation-qbhv8k`, the working tree is clean, and nothing was committed or pushed.
- **Probes:** in `/tmp/auditA97-security/`. Some a55b2d0 probes in `/tmp/audita55-security/` (`pa55.mjs`) were re-run unchanged. The new probes are:

| Probe | What it tests |
|---|---|
| `p97.mjs`, `p97b.mjs`, `zip.mjs` | parser called directly: shared strings within the caps, a large inline cell, empty `<t/>` elements, wide header rows, blank HTML rows, the largest accepted reply |
| `rx.mjs` | the Tally `tallyTagValue` regex on unclosed tags, timed on its own |
| `dos97-ipc.test.mjs` | parser and Tally preview through IPC as a DEO: timer ticks and reply size. Modes: `ONLY=parse`, `tally`, `tallyreply`, `xml` (`XMLKB=100,200,400` or `1024`) |
| `supplier97.test.mjs` | supplier bank details through `records:update` with `undefined`, `null`, invisible and conflicting aliases, booleans and objects |
| `banktables97.mjs` | bank fields of `employees`, `banks` and `companies` with `runAsActor` |
| `rb97.test.mjs` | R-L re-run, the refusal audit row, non-admin and malformed `goLiveId`, a corrupt history file |
| `vp97.test.mjs` | voucher-proposal update, approve and reject: atomicity and audit rows |
| `sod97.test.mjs` | an accountant or DEO approving a proposal through `voucher-proposals:update` |

Run an IPC probe with:

```
cd /home/claude/gii-gem-erp
node --max-old-space-size=16000 --import ./scripts/audit/lib/electron-register.mjs --test /tmp/auditA97-security/dos97-ipc.test.mjs
```

Run a direct parser probe with `node --max-old-space-size=16000 /tmp/auditA97-security/p97.mjs <mode>`. The modes are:

- xlsx: `combo1m`, `sstonly`, `inlinebig`, `double`, `emptyt`, `xlsx1m`, `xlsxreply`
- csv: `csvkeys2`, `csvwidehdr`, `csvwidehdr2`, `csvwide`, `csvcommas`, `csvquoted`, `csvqq`, `csvrows`
- tsv: `tsvwidehdr`, `tsvwide`, `tsvnl`, `tsvlines`, `tsvcr`
- HTML .xls: `htmlhdr`, `htmlwide`, `htmlblank`, `htmlblanktd`, `htmlrows`

## Summary

| # | Severity | Finding | Status at a97daf4 |
|---|---|---|---|
| **N12-R** | **Medium** | Crafted xlsx blocks the main process; 20 picked files make the Tally preview long | **Partly fixed.** The a55b2d0 vector is refused in 0.17 s. One file still blocks for **3.8 s**: about 64 MiB of in-cap `&amp;` shared strings, plus an inline cell decoded before its length check. **20 picked copies (3.8 MB in total) block the Tally preview for 75 s.** The new 25 MB budget counts compressed bytes. |
| **N14** | **Medium** | New. Tally XML: a lazy regex on unclosed tags is quadratic | Not new code; it was not audited before. A **1 MB** `.xml` blocks the main process for **46 s** through `tally:preview-master-migration`; 400 KB takes 6.6 s. At the 25 MB budget this extrapolates to hours. `tally:preview-stock-xml` has no size cap at all. |
| **N15** | **Medium** | New. `voucher-proposals:update` accepts `status`, so an accountant or DEO can approve a proposal without the `approve` permission | Not new code: a97daf4 only wrapped this code in a transaction. An accountant set `status:"Approved"`, then created and posted the voucher. It was posted to the ledger with `approved_by` null. |
| N11-R | Low | The IPC reply is far larger than the file | **Partly fixed.** Values now share the 128M-character budget. A 5 KB xlsx still gives a **260 MB** reply and a 148 KB csv gives **264 MB**. 20 Tally files give **223 MB** (it was 161 MB). |
| N8 | Low | Size limits are checked only after the whole parse | **Partly fixed.** Blank TSV lines, long quoted csv cells and `""` runs are now refused in under 80 ms. A wide **header** row still costs 2.4–4.4 s, and 2.9M blank HTML `<tr>` take 3.7–4.1 s and are accepted. |
| N4 | Low | A field and its alias disagree: an admin wipes `bank_details`, a non-admin is wrongly refused | **Fixed.** All three admin wipes and all three DEO false refusals now leave the row unchanged. |
| N13 | Low | A key sent as `undefined` wipes (admin) or gives a false refusal (non-admin) | **Fixed.** `undefined` and `null` are dropped before the merge, on all four tables. |
| R-L | Low | A legacy go-live entry takes a later Enhanced Reset as its own | **Still open.** `goLiveService.js` is unchanged. The re-run still ends with `success:true` and "T4 Live Work" count 0. |
| — | Info | The `go_live_rollback_refused` audit row | **Safe.** `table_name:'system'` is not a book table, and the row is not an `operational_reset`, so it changes no guard decision. The actor comes from the session. The chain verifies. Minor: `goLiveId` is stored unbounded (a 10 MB row), and every signed-in user can read it through `accounting:data`. |
| — | Info | Voucher-proposal transactions | **Correct.** A write that fails in the audit step (a BigInt narration) now leaves no change. Before this commit the UPDATE committed and the audit was lost. Nothing new is opened, but see N15. |
| — | Info | `storableValue` | Booleans in text columns are stored as `"1.0"`/`"0.0"`, not 1/0 as the comment says. A `null` can no longer clear any column of the four master tables. |

**Answers to the brief:**

- **Can a crafted csv/tsv/xls/xlsx within 25 MB still block the main process for more than about 2 s?**
  - **Yes, for each format.** Through IPC as a DEO, with 0 timer ticks:

    | Input | Size | Block | Result |
    |---|---|---|---|
    | xlsx `double` | 195 KB | **3,830 ms** | refused |
    | HTML .xls, 2.4M `<th>` in the header | 23 MB | 3,663 ms | refused |
    | HTML .xls, 2.7M blank `<td>` | 23 MB | 3,747 ms | accepted, 0 rows |
    | HTML .xls, 2.9M blank `<tr>` | 25 MB | 3,661 ms | accepted, 0 rows |
    | tsv, 12.5M-cell header | 24 MB | 3,302 ms | refused |
    | csv, 12.5M-cell header | 24 MB | 2,374 ms | refused |

  - Directly, the same inputs take 3.0–4.5 s. The worst single call is about 40% shorter than at a55b2d0 (6.6 s).
  - **Blank TSV lines and long csv cells are closed.**
- **Can the reply exceed about 150 MB?** **Yes** (N11-R):

  | Call | File | Parse | Reply |
  |---|---|---|---|
  | `imports:parse-buffer` xlsx | 5 KB | 353 ms | **260 MB** |
  | `imports:parse-buffer` csv | 148 KB | 376 ms | **264 MB** |
  | `tally:preview-master-migration`, 20 picked copies of the same 5 KB xlsx | 100 KB | 4.8 s | **223 MB** |

  The budget counts UTF-16 code units, and two-byte characters serialize at 2 bytes each.
- **Can the Tally preview still take long?** **Yes, and longer than before.**
  - The new budget refuses 2 × 12.6 MB csv in 1 ms.
  - But it sums the **file sizes on disk**, and an xlsx is compressed: 20 crafted xlsx files total 3.8 MB and take **75 s** (N12-R).
  - A single 1 MB Tally `.xml` takes **46 s** (N14). XML files are inside the budget and inside the 20-file limit.
  - Deduplication still works.
- **Can a non-admin still change, wipe or pad bank details, or be falsely refused?**
  - **No bypass.** Each case was refused or left the row unchanged, on `suppliers` (`records:update`) and on `employees`, `banks` and `companies` (`updateRecord`). The cases tried:
    - `undefined` and `null`, alone and mixed with aliases;
    - U+200B, U+FEFF and NBSP alone, or as an alias that wins;
    - conflicting aliases;
    - U+2060 padding;
    - booleans, `{}`, arrays, Date, and an object with a non-callable `toString`.
  - **No false refusals remain among the N4 and N13 payloads.**
  - The remaining refusals are real changes:
    - an empty value or an invisible-only value, which counts as a clear;
    - U+2060, which is not stripped;
    - a winning alias that differs from the stored value.
- **Can a go-live rollback still erase live work?**
  - **Only through R-L, which is unchanged.** It is admin-only and needs a legacy pre-2026-10-23 entry.
  - The refusal audit row neither unblocks nor blocks a rollback (`rb97.test.mjs`).
- **Does the rollback refusal row or the voucher-proposal transaction change open anything?**
  - **No new path.**
  - The proposal hunk did bring N15 into view. It is older code: `status: payload.status || "Needs Review"` lets an editor set any status.

---

## N12-R. Medium: one 195 KB xlsx still blocks for 3.8 s, and 20 of them block the Tally preview for 75 s

**What a97daf4 fixed** (`importParserService.js`):

- `parseSharedStrings` (`:206-229`) now refuses an `<si>` over 6 × 32,767 raw characters before it decodes it (`:219`). It also refuses a decoded value over 32,767 characters (`:221`) and decoded totals over 16M characters (`:222-225`).
- `MAX_XLSX_CELLS` is now 1M (`:243`).

The a55b2d0 results with `pa55.mjs`:

| Input | a55b2d0 | a97daf4 |
|---|---|---|
| `combo` (one 64M-character `&amp;` string + 2M cells) | 4.1–4.5 s, accepted | **0.17 s**, refused |
| `xlsx2m` (2M cells) | 2.0 s, accepted | **0.7 s**, refused |
| `xlsx2mrows` | 2.6 s | 1.5 s, refused at 1M cells |

**What is left.** There are two vectors, and each stays inside every cap:

1. **Shared strings within the caps.**
   - The part holds 409 `<si>` of exactly 32,767 × `&amp;`: 163,835 raw characters each, which passes `:219` and `:221`.
   - That is 13.4M decoded characters, under the 16M total. The raw size is just under the 64 MiB part cap, so `decodeXml` (`:6-13`, five `replaceAll` passes) still runs over 64 MiB.
   - The per-string check moved the cost from one string to 409 strings; it did not remove it.
2. **An inline cell is decoded before its length is checked.**
   - `:342-343` runs `decodeXml(raw)` on the whole `<v>` body.
   - The 32,767 check comes only afterwards, at `:346`.
   - So one `t="str"` cell can hold about 64 MiB of `&amp;`. The pre-decode check of `:219` was added for shared strings but not here.

The two vectors sit in different parts: about 64 MiB each, 128 MiB in total, which is exactly the inflate cap.

**Direct results** (`p97.mjs`, `p97b.mjs`):

| Input | File | Time | Peak RSS | Result |
|---|---|---|---|---|
| `sstonly`: 64 MiB of in-cap shared strings | 99 KB | 1.3 s | 0.3 GB | accepted |
| `xlsx1m`: 99,999 rows × 10 cells | 88 KB | 1.15 s | 0.2 GB | accepted |
| `combo1m`: both of the above | 187 KB | 2.6 s | 0.4 GB | accepted, 99,998 rows |
| `inlinebig`: one inline cell of 13.4M `&amp;` | 96 KB | 2.9 s | 0.7 GB | refused only after decoding |
| `double`: in-cap shared strings + `inlinebig` | 195 KB | **3.8 s** | 0.8 GB | refused |
| `triple`: shared strings + 1M cells + a smaller inline cell | 211 KB | 3.0–3.4 s | 0.6 GB | refused |
| `emptyt`: one `<si>` of 16M `<t/>` (raw text length 0, so `:219` never trips) | 61 KB | 1.5 s | 0.7 GB | accepted |

**Through IPC as `data_entry_operator`** (`dos97-ipc.test.mjs`):

| Call | Time | Timer ticks | Result |
|---|---|---|---|
| `imports:parse-buffer "double.xlsx"` (199,276 B) | **3,830 ms** | 0 | refused |
| `tally:preview-master-migration`, **20 distinct picked** `double.xlsx`, 3.8 MB in total | **75,202 ms** | 0 | `files: 20`, 20 errors |
| `tally:preview-master-migration`, 2 × 12.6 MB csv | 1 ms | — | "Preview refused: … 25.2 MB" |

**Why the Tally budget does not help:**

- `MAX_TALLY_PREVIEW_BYTES` (`tallyImportService.js:426, 444-451`) sums `fs.statSync(file).size`, the bytes on disk.
- For an xlsx that is the compressed size: 195 KB here, against up to 128 MiB inflated and about 3.8 s of work.
- A refused file still costs its full parse, because `:482` runs before the error is recorded.
- So 20 files fit easily in 25 MB.
- The budget does bound csv, tsv and HTML, since those are read as-is: their total is about one worst-case file, about 4 s.

**Who can do it:** any role with `import` (DEO, accountant, admin).

- `imports:parse-buffer` takes the bytes from the renderer, so no file pick is needed.
- The Tally case needs 20 picks. `selectedFiles` (`main.js:237`) is still shared by every user and never cleared, as at a55b2d0.

**Fix:**

- In the cell walk, check `raw.length > MAX_CELL_CHARS * 6` before `decodeXml` (`:342-343`), as `:219` does for shared strings.
- Count the raw characters of each `<si>`, tags included. Alternatively, cap the whole decoded and raw shared-string work at a smaller figure, such as 16 MiB raw.
- Budget the Tally preview on **inflated** bytes or parsed cells, not on file size. Alternatively, preview one file per IPC call.
- As in every round: run `parseImportBuffer`, `parseImportFile` and the Tally preview in a `worker_thread` or `utilityProcess` with a time limit and `resourceLimits`. That bounds N8, N11-R, N12-R and N14 at once.

## N14. Medium: a 1 MB Tally XML blocks the main process for 46 s (quadratic regex)

**Where:** `tallyImportService.js`.

- `:41-44` `tallyTagValue` builds `/<TAG\b[^>]*>([\s\S]*?)<\/TAG>/i` and runs it over the **whole file**.
- `:74-85` `namedTallyBlocks` and `:51-54` `tallyRepeatedTagValues` use the same pattern with `/g`.

For each `<TAG` that is never closed, the lazy `[\s\S]*?` scans to the end of the text before the engine tries the next start. A file made of N unclosed opening tags therefore costs about N²/2 character steps.

The preview runs `tallyTagValue(xmlText, "SVCURRENTCOMPANY")` twice on the whole file: at `:467` and inside `parseTallyStockItemsXml` (`:334`, called at `:481`).

**Reproduction.** The file is `"<SVCURRENTCOMPANY>"` repeated (`rx.mjs`, `dos97-ipc.test.mjs ONLY=xml`):

| File | One regex call (direct) | `tally:preview-master-migration` as DEO | Ticks |
|---|---|---|---|
| 100 KB | 0.28 s | 373 ms | 0 |
| 200 KB | 0.84 s | 1,731 ms | 0 |
| 400 KB | 3.4 s | 6,553 ms | 0 |
| **1 MB** | — | **46,328 ms** | 0 |

The time grows with the square of the size:

- About 25 MB, the preview budget, extrapolates to roughly **8 hours** for one file. That is a hang until the app is killed.
- The same applies to `<LEDGER `, `<GROUP `, `<UNIT `, `<GODOWN ` and the other block tags, through `namedTallyBlocks`.

**Second entry point:** `tally:preview-stock-xml` (`main.js:963`, `previewTallyStockXml` at `tallyImportService.js:417-423`).

- It has **no size check at all**. `readXmlText` (`:117-130`) reads any file, so memory is unbounded too.
- It runs the same `parseTallyStockItemsXml`.

**Who can do it:** any role with `import`. The user must pick the file in the dialog, as with N12-R.

**Status:** the code is not new in a97daf4. It was not measured in earlier rounds; those rounds attacked only the csv and xlsx paths of the preview.

**Fix:**

- Replace the lazy whole-file regexes with an `indexOf` walker. `forEachElement` in `importParserService.js:171-194` already exists for exactly this purpose.
- Call `tallyTagValue` only on a block's own body, never on the whole file.
- Apply `MAX_TALLY_PREVIEW_BYTES` to `previewTallyStockXml` too.
- Move the parse off the main thread (see N12-R).

## N15. Medium: an accountant or DEO can approve a bank voucher proposal through `voucher-proposals:update`

**Where:**

- `bankReconciliationService.js:656`: `status: payload.status || "Needs Review"` in `updateVoucherProposal`, which is written by the UPDATE at `:660-677`.
- `voucher-proposals:update` is `guarded("edit", …)` (`main.js:879`).
- `voucher-proposals:approve` is `guarded("approve", …)` (`:880`).
- `createDraftVoucherFromProposal` only checks `proposal.status !== "Approved"` (`:708`).

In `authService.js:8-10`:

- the accountant has `create`, `edit` and `post`, but not `approve`;
- the DEO has `create` and `edit`;
- only the manager and the admin have `approve`.

**Reproduction** (`sod97.test.mjs`, real IPC):

| Step (accountant) | Result |
|---|---|
| `voucher-proposals:approve` | "Permission denied: approve" |
| `voucher-proposals:update {status:"Approved"}` | ok; status `Approved`, `approved_by` **null** |
| `voucher-proposals:create-draft` | ok |
| `voucher-proposals:post-draft` | ok. The voucher is `Posted` with `approval_status 'Approved'`, and 2 `ledger_entries` rows are written. |
| DEO: `update {status:"Approved"}`, then `create-draft` | both ok |

The audit trail records the step as "voucher proposal edited", with `"status":"Approved"` inside `new_value`. No "approved" row is written.

**Related:** an editor can also do the following without `approve`:

- send `status:"Rejected"` or `"Already Booked"`;
- set `"Posted"` or `"Draft Voucher Created"`, which freezes the proposal (`:643`);
- keep `status:"Approved"` while changing the ledger, party or links of a proposal a manager already approved.

**Impact:** the approval step of the bank-proposal flow, a segregation-of-duties control, is bypassed. Money is booked to a ledger the accountant chose, with no approver, and the trail looks like an edit. It is audited, and it needs a signed-in accountant.

**Status:** this is older code. a97daf4 only moved it inside `db.transaction`. It is reported here because the brief asked whether the proposal change opens anything: it does not, but this was visible in the hunk.

**Fix:**

- Do not take `status` from the payload. An edit should always set `Needs Review`, or keep `Suggested`.
- An edit of an `Approved` proposal should drop it back to `Needs Review` and clear `approved_by`.
- `createDraftVoucherFromProposal` should also require `approved_by` to be set.

## N11-R. Low: a 5 KB xlsx still produces a 260 MB reply; 20 Tally files produce 223 MB

**Where:** `importParserService.js:44-70` `toRecords`.

- The new loop (`:56-65`) adds cell values to the 128M budget, `MAX_KEY_CHARS` (`:30`).
- It still counts **UTF-16 code units**, so two-byte characters serialize at twice the budget.
- So the reply is now bounded at about 128M × 2 bytes, plus overhead.

| Call | File | Parse | Reply |
|---|---|---|---|
| `imports:parse-buffer` xlsx, 500 two-byte headers of 100 characters, 1,438 rows (`xlsxreply`) | 5,114 B | 353 ms | **260 MB**, serialized in 213 ms |
| `imports:parse-buffer` csv, the same headers, 2,684 one-cell rows (`csvkeys2`) | 148 KB | 376 ms | **264 MB** |
| `tally:preview-master-migration`, 20 picked copies of `xlsxreply` (50 rows kept each) | 20 × 5 KB | 4.8 s | **223 MB** (it was 161 MB at a55b2d0) |

The a55b2d0 391 MB file (`xlsxfull`) is now refused in 12 ms.

**Fix (unchanged):**

- Count bytes, for example `Buffer.byteLength(s, "utf16le")`.
- Set the budget at about 50 MB.
- Give the Tally preview one reply budget across its files.
- Better, return rows as arrays plus one header list.

## N8 at a97daf4: partly fixed

**Fixed:**

| Input (≤ 25 MB) | a55b2d0 | a97daf4 |
|---|---|---|
| tsv, 25M `\n` | 2.9–3.2 s, accepted | **58–79 ms**, refused (`MAX_IMPORT_LINES`, `:116-122`) |
| tsv, 12.4M `\r\n` | 1.4 s, accepted | 74 ms, refused |
| csv, one quoted 25M-character cell | 2.8–3.6 s | **38 ms**, refused (`:83`, `:102`) |
| csv, 12M `""` pairs | — | 42 ms, refused |
| csv or tsv, a wide **data** row under a one-column header | 3.3–3.7 s | 0.76–0.83 s |

**Still open.** There is no per-row cell count in `parseCsv` (`:72-111`), `parseDelimited` (`:124-125`, `line.split`) or `parseHtmlTable` (`:134-155`). Blank HTML rows also do not count toward the row limit (`:150`).

| Input | Direct | IPC (DEO), 0 ticks |
|---|---|---|
| csv, header of 12.5M cells | 3.2 s, 1.4 GB | 2,374 ms, refused afterwards |
| tsv, header of 12.5M cells | 4.1 s, 1.5 GB | 3,302 ms |
| HTML .xls, header of 2.4M `<th>` | 4.5 s, 1.4 GB | 3,663 ms |
| HTML .xls, 2.7M blank `<td>` | 4.4 s, 1.2 GB | 3,747 ms, **accepted** |
| HTML .xls, 2.9M blank `<tr></tr>` | 4.1 s, 1.5 GB | 3,661 ms, **accepted** |
| HTML .xls, 1.3M filled rows | 3.2 s, 1.2 GB | — |

This stays Low because the Tally byte budget now bounds these formats to about one such file per preview.

**Fix:** unchanged.

- Throw once a row passes `MAX_IMPORT_COLUMNS` while it is being built.
- Count blank `<tr>` rows toward a line cap, as TSV now does.

## N4 and N13 at a97daf4: fixed

**The change** (`crudHelpers.js`):

- `withStoredFields` drops keys whose value is `undefined` or `null` before the merge (`:82`).
- It now decides whether to rebuild `bank_details` with `supplierBankPartsChanged` on the resolved row (`:94`, `:101-105`). This is the same rule `cleanPayload` uses (`:468`).
- `hasValue` treats `\s` and U+200B–U+200D and U+FEFF as blank (`:53`).

**Results** (`supplier97.test.mjs`, `banktables97.mjs`). Every case starts from the stored value `"111122223333"` and the stored text "Account Number: 111122223333 (verified by phone)":

| Who | Payload | Result |
|---|---|---|
| admin | `{supplier_account_number: undefined}`, `{bank_details: undefined}`, `{bank_details: null}`, `{supplier_account_number: null, account_number: null}` | ok, **unchanged** |
| admin | employees, banks, companies `{account_number: undefined}` or `null` | unchanged |
| DEO | `{supplier_name: "X", bank_details: undefined}`; `{…, bank_details: null, upi_id: null}` | ok, rename only |
| accountant | employees, banks, companies `{account_number: null, ifsc: undefined, bank_name: null}` | ok, unchanged (it was a false refusal) |
| admin, DEO | `{supplier_account_number:"", account_number:"111122223333"}`, `{beneficiary_ifsc_code:"SBIN…", ifsc:"HDFC…"}`, `{supplier_bank_name:"", beneficiary_bank_name:"SBI", bank_name:"HDFC"}` | ok, **unchanged** (N4 closed) |
| DEO | U+200B or NBSP in the column, with the alias equal to the stored value; U+200B-padded alias; `{supplier_branch:"Main​​", branch:"Other"}` | ok, unchanged |
| DEO | `{beneficiary_account_number:"111122223333", account_number:"999"}`; `{supplier_account_number:"111122223333", account_number:"999"}` | ok, unchanged: the first alias or the column wins, and the other is ignored |
| DEO | `{beneficiary_account_number:"​", account_number:"999"}`; U+2060 as the column or as padding; `{bank_details:"​"}`; all three account keys `""`; U+FEFF column with a disagreeing IFSC alias | refused (settings): these are real changes or clears |
| DEO, admin | `true`/`false` on an account number, `bank_details` or `upi_id`; `{}` on an alias | refused ("must be entered as text") |
| DEO | `{supplier_account_number: {toString:"x"}}` | refused: "Cannot convert object to primitive value". This fails closed, but the message is not guided. |
| DEO | `111122223333` as a number / `111122223334` | unchanged / refused |
| accountant | `{beneficiary_account_number:"  ", account_number:"999"}`, `{supplier_bank_ifsc_code: 0}` | refused |
| DEO, create | `account_number:"555"`, `beneficiary_account_number:"555"`, `upi_id:"⁠"` | refused; `" ​ "` and `"\n"` stored as `""` |

**Notes (Info):**

- **An invisible-only value counts as a clear.** An admin's `{supplier_account_number:"​"}` or NBSP blanks the number, and `bank_details` is rebuilt as "Account Number: -". The same holds for `account_number` on employees, banks and companies. This is consistent with "blank text is an explicit clear", but a form that sends a lone U+200B wipes the field. Only an admin can do it; a non-admin is refused.
- **A `null` can no longer clear any column** of `companies`, `suppliers`, `employees` or `banks` (`:82`), for example a `*_id` link. Callers must send `""`. No security impact was found.
- **`storableValue` (`:141-149`) does not do what its comment says.** It turns booleans into 1/0, but better-sqlite3 binds JS numbers as REAL, so a TEXT column stores `"1.0"`/`"0.0"`. Probe: a DEO's `{supplier_name: true}` gives `"1.0"`, and `{beneficiary_account_name: true}` gives `"1.0"`. Bank fields refuse booleans before this point, so there is no bank impact.
- **Objects and arrays on non-bank fields are now refused** with the field's name (`gstin: ["a"]`, `supplier_name: Date`).
- **Unchanged and by design:** a DEO can still set `supplier_account_name` to "Fraud Pvt Ltd" (182b11f N10).

## R-L at a97daf4: still open (Low)

`goLiveService.js` is not in the diff. `resetAuditIdFor` (`:192-211`) still takes the first `operational_reset` since `generatedAt` for a legacy entry.

`rb97.test.mjs` re-runs rb219c T4, with a refused rollback added first:

| Step | Result |
|---|---|
| Legacy `in_progress` entry with no `highWater` and no `auditIdAtStart`; `go-live:rollback` | `success:false`, "no record of a reset"; 1 audit row (`go_live_rollback_refused`, `system`) |
| Check after the refusal row | still refused: the refusal row is not taken as a reset |
| DEO `records:create suppliers "T4 Live Work"`, then admin `reset:execute-enhanced` | ok |
| Check; `go-live:rollback` | **allowed**; `success:true`, and "T4 Live Work" count afterwards is **0** |

**Fix:** unchanged. Refuse rollback of a legacy entry that has neither `highWater` nor `auditIdAtStart`.

## go-live:rollback refusal audit row (Info: safe)

`main.js:1316-1322`:

- Only messages that start with "Rollback refused:" are turned into an answer and audited (`:1319-1320`).
- Any other error is rethrown before the restore, so the handler still fails closed.

Checked with `rb97.test.mjs`:

- **The guard ignores the row.** `table_name:'system'` is not in `bookTables`. After 3 refused rollbacks of an unknown id, a full-mark entry is still `allowed`. The row's action is not `operational_reset`, so `resetAuditIdFor` never takes it as a mark.
- **Actor.** `user_id` comes from `actorId()`: 1, even when `user_id: 99` and `userId: 1` were sent. A DEO or accountant is refused at `guarded("restore_backup")`, and only the usual `permission_denied` row is written.
- **Malformed ids.** `null`, `{a:1}`, `[21]` and `"21"` all give "not found", with no throw.
- **A corrupt history file** is thrown ("The go-live history … was damaged"), and no refusal row is written. `handle()` journals the exception.
- **Chain:** `{chained:true, verified:85, broken:[]}`.
- **Minor gap.** `new_value` holds the renderer's `goLiveId` without a bound. A 10 MB `goLiveId` from the admin wrote a 10,485,880-byte audit row in 224 ms.
  - Audit rows cannot be deleted without breaking the chain.
  - `accounting:data` (`main.js:840`, `accountingService.js:1260`) returns the latest 300 rows to any signed-in user, `company_id` NULL included.
  - The viewer received all 10 refusal rows, the 10 MB one among them.
  - It is admin-only. **Fix:** store `String(goLiveId).slice(0, 64)`.

## Voucher-proposal transactions (Info)

`updateVoucherProposal`, `approveVoucherProposal` and `rejectVoucherProposal` (`bankReconciliationService.js:639-704`) now run their checks, UPDATE and `proposalAudit` in one `db.transaction`.

`vp97.test.mjs`:

| Call | Reply | Row changed | `audit_log` / `voucher_proposal_audit` rows added |
|---|---|---|---|
| accountant `update {narration: 5n}`: the UPDATE binds the BigInt, then `JSON.stringify(next)` throws in the audit step | "Do not know how to serialize a BigInt" | **no** | 0 / 0 |
| accountant `update {linked_order_id: 999999}` | refused (order does not exist) | no | 0 / 0 |
| accountant `update {remarks: {a:1}}`; manager `reject` with an array reason | bind error | no | 0 / 0 |
| manager `approve` of an Already Booked proposal; `reject` of a Posted one; accountant `update` of a Posted one | refused | no | 0 / 0 |
| accountant `update`, manager `approve` (BigInt remark) and `reject`, all valid | ok | yes | 1 / 1 each |

- The BigInt case shows the fix working. At a55b2d0 the UPDATE ran outside a transaction, so it would have committed and the audit step would then have thrown. This is from reading the a55b2d0 code; it was not re-run against that commit.
- The action text no longer doubles "proposal" ("voucher proposal edited").
- The CRAC and closure audit defaults now throw (`cracService.js:9-12`, `orderClosureService.js:37`). Every caller in `main.js` passes `auditLog`, so this changes nothing at run time and fails closed.
- Nothing new is opened, but see N15 for the `status` field this hunk carries.

## Info carried over

- `bank:preview-import` (`main.js:872`) still has no permission check and no row cap.
- `selectedFiles` (`main.js:237`) is still one set for the whole run, shared by all users and all pickers, and it never shrinks.
- `accounting:data` (`main.js:840`) still returns `SELECT *` of the latest 300 `audit_log` rows to any signed-in user, including `old_value`, logins and password changes.
- The Tally byte budget skips files it cannot `stat` (`tallyImportService.js:447`). Such a file is then reported as "File not found", so there is no gap in practice. Size is checked at `stat` time, but the file is read later.
