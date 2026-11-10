# Security audit of commit 9dac174

Scope: `git diff 3c12e50..9dac174` on branch `claude/erp-full-automation-qbhv8k`. The audit was read-only. Nothing in the repository was edited, committed or pushed. Probe scripts ran from a scratch folder against the real service modules, using throwaway data roots.

## Summary

**Counts at 9dac174:** 0 High, 2 Medium, 3 Low.

| # | Severity | Finding | Where |
|---|---|---|---|
| **N12-R2** | **Medium** | The new xlsx expansion-ratio check is bypassed by padding the zip entry. The new inline-text budget cannot trigger. The 3c12e50 "both" vector still blocks for **3.8 s** (492 KB file), and **20.9 s** through the Tally preview | `importParserService.js:337`, `:396-401` |
| **N16-R** | **Medium** | The new 100,000-master cap counts only `LEDGER` and `STOCKITEM`. `COMPANY`, `GODOWN`, `GROUP`, `UNIT` and `STOCKGROUP` stay uncapped (**88–109 s**, 358–377 MB reply). `tally:preview-stock-xml` has no cap at all (**28 s**, reply over 512 MB) | `tallyImportService.js:497-516`, `:425-435` |
| SEC-2a | Low | Grant rows now come from read-only `sessionGuarded` channels. Opening Account Mappings writes 3 `permission_granted` rows each time, and they push real entries out of the 300-row audit trail | `main.js:326-329`, `:344` |
| SEC-2b | Low | `health:support-bundle` still writes the screen's `context` verbatim, including any `user_id` or `user_name`. This is the same class as SEC-1d, which was fixed only for the snapshot | `main.js:1168-1173` |
| SEC-2c | Low | `sessionGuarded` checks permission against `firstPayload(args)` but passes `args[0]` to the handler. The grant row can name a company other than the one acted on | `main.js:331-352` |

**Fixed and verified in 9dac174 (by reading the code; the probes below confirm where noted):**

- **SEC-1a.** `seesAuditTrail` (`main.js:195`) now includes roles that hold `settings`, so `admin` receives `auditLog` again. A DEO still receives `[]`. Unknown roles fall back to `viewer` and so see the trail. That is consistent with `view_reports` and is not a finding.
- **SEC-1b.** `firstPayload` (`:189`) now accepts only objects whose prototype is `Object.prototype` or `null`. A `Uint8Array` is no longer spread into the permission context. `withActor` already skipped it.
- **SEC-1c.** `accounting:drilldown` (`:948-952`) now empties `voucher.audit` for actors who fail `seesAuditTrail`.
  - I checked the other `audit_log` readers. `accountingService.js:1260` is gated. `supportBundleService` returns only a file path to the renderer. `masterDataToolsService.js:577` returns 3 metadata-only actions. `verifyAuditChain` returns ids and counts only.
  - No other channel returns `old_value` or `new_value` to a DEO.
- **SEC-1d.** `health:verification-snapshot` (`:1193-1199`) now takes `user_id`, `user_name` and `role` from the ambient actor. It blanks `userId` and `userName`, and `recordVerificationSnapshot` reads only those keys. The company name and scope still come from the screen (cosmetic only).
- **SEC-1e.** `recordGrant` is called from both `guarded` and `sessionGuarded`, and `auditLog` (`init.js:1633`) drops any `company_id` that is not a real company.
- **Actor spoofing through an extra argument in `sessionGuarded`.** The old code ran `handler(...args, actor)`, so a renderer could append `{user_id:1, user_role:"super_admin"}` and have it taken as the actor. The new code ran `handler(args[0], actor)`, which closes that.
  - All 8 `sessionGuarded` handlers take only `(payload, actor)`.
  - `sessionRequired` (`:354`) still uses the old `(...args, actor)` pattern but has no callers. Delete it so nobody reuses it.
- **R-L.** A legacy go-live entry with neither `highWater` nor `auditIdAtStart` is now refused (`goLiveService.js:247-249`).
- **`go_live_rollback` row.** `reason` is now capped at 500 characters and `goLiveId` at 64 (`main.js:1355`).
- **N16 per-row cost.** The duplicate check now loads each master table once per preview into a `Map` (`importValidationService.js:67-77`). Table and field names come from code constants, so the cache adds no injection surface.
  - The cache is reset in `finally` (`tallyImportService.js:540-542`), and the preview is synchronous, so no state leaks between calls.

No new permission bypass was found. Every channel touched by the diff is either guarded or returns only what an existing unguarded channel already returns. The app still has no binding between users and companies (see the 3c12e50 Info notes).

---

## N12-R2. Medium: the xlsx expansion-ratio check is bypassed by padding the entry, and the inline budget never triggers

**Where:** `src/main/services/importParserService.js`.

### Defect 1: the ratio uses a size the attacker sets

- Line 337 compares `data.length` with `compressed.length * 200`.
- `compressed` is `buffer.slice(dataStart, dataStart + entry.compressedSize)` (`:325`). `compressedSize` comes from the central directory, so the file declares it.
- `zlib.inflateRawSync` stops at the end of the deflate stream and ignores trailing bytes. I checked this: with 5,000 bytes of junk after a 985-byte stream, `engine.bytesWritten` is 985 and the output is correct.
- So adding about 1/200 of the inflated size as padding after each part, and declaring the larger size, makes the ratio pass.

### Defect 2: the inline budget is larger than any sheet part

- `MAX_SHEET_CHARS` is 64 Mi (67,108,864) characters (`:396-401`).
- The sheet part is already capped at `MAX_XLSX_ENTRY_BYTES`, also 64 MiB, and a string decoded from UTF-8 has no more characters than bytes.
- Inline raw text is part of that sheet, so `inlineRawChars > MAX_SHEET_CHARS` can never be true.
- The comment says inline text "shares the same stored-text budget as the workbook's shared text". It does not: shared strings are capped at 32M raw characters (`:255`), and this is a separate, larger counter.

### Reproduction

Probe `both.mjs` uses the 3c12e50 `both` vector: 170 `<si>` of 32,767 × `&quot;`, plus 341 inline `t="str"` cells of 32,767 × `&quot;`. It calls `parseImportBuffer` directly.

| Input | File | Result | Time |
|---|---|---|---|
| `both`, no padding | 155 KB | refused by the ratio check ("expands 666 times") | 52 ms |
| **`both`, each part padded to just under 200×** | **492 KB** | full walk, then refused by the header check | **3,847 ms** |
| 60 MB entity-heavy sheet, 400 KB pad | 659 KB | accepted, 178,227 rows | 2,645 ms |
| **20 copies of padded `both`, `previewTallyMasterMigration`** | 9.8 MB | 20 errors | **20,888 ms** |

- The Tally preview now stops after 5 spreadsheets, and each later file is refused cheaply. That brings 86 s at 3c12e50 down to 21 s, but 5 files still cost about 19 s.
- The padding is plain filler bytes, so a 1–2 MB padded file is unremarkable as an email attachment.

### Exploit path

Any role with `import` (admin, accountant, data_entry_operator) can trigger this:

- **No file pick needed:** `imports:parse-buffer` with the bytes. This takes about 3.8 s, with the main process blocked and no IPC served.
- **With file picks:** `tally:preview-master-migration` with 20 picked copies takes about 21 s.

The realistic case is a user importing a sheet they received from outside.

### Fix

- **Measure the bytes inflate actually used.** Call `zlib.inflateRawSync(compressed, { info: true, maxOutputLength })` and use `result.engine.bytesWritten` as the compressed length; I checked that this returns the bytes consumed. Refuse the entry when `compressed.length - bytesWritten` is more than a few bytes. Real zips have no trailing data inside an entry.
- **Also check the declared uncompressed size.** Compare it with the actual inflated length.
- **Make the inline budget reachable.** Cap raw inline text at 16 MiB, as suggested at 3c12e50. Better, count `totalRawChars` from the shared strings and inline raw text against one budget, as the comment claims.
- **Long-standing fix:** run the parsers in a `worker_thread` or `utilityProcess` with a time limit. That bounds this and N16-R together.

---

## N16-R. Medium: the Tally master cap misses five master kinds, and the stock-XML preview has no cap

**Where:** `src/main/services/tallyImportService.js`.

### The cap misses five master kinds

- `MAX_TALLY_PREVIEW_MASTERS` (`:442`) is checked against `ledgerBlocks.length + tallyTagBlocks(xmlText, "STOCKITEM").length` (`:510-516`). Its comment says "each becomes a row in the reply", but these blocks also each become a reply row and are not counted:
  - `COMPANY` (`:500-502`), each calling `companyMatches`, a database query
  - `GODOWN` (`:508`), each calling `findMasterImportDuplicate` plus `firstCompanyId`
  - `GROUP` (`:503`)
  - `UNIT` (`:504`)
  - `STOCKGROUP` (`:509`)
- `uniqueNamedTallyBlocks` removes only duplicate names, so distinct names pass.

### The stock-XML preview has no cap

`previewTallyStockXml` (`:425-435`), behind `tally:preview-stock-xml` (`main.js:991`), calls `parseTallyStockItemsXml` with no item cap. Each item runs about 10 tag scans and returns a full object.

### Reproduction

I used the probes `tally.mjs` and `stock.mjs` on a fresh database, calling `previewTallyMasterMigration` and `previewTallyStockXml` directly. Each file is `<KIND NAME="mN"></KIND>` repeated, under the 50 MB budget.

| Channel | Blocks | File | Time | Reply (`JSON.stringify`) |
|---|---|---|---|---|
| migration, `LEDGER` | 150,000 | 4.5 MB | 288 ms | refused by the new cap (works) |
| migration, `GROUP` | 1,500,000 | 43 MB | 8,251 ms | 76 MB |
| **migration, `COMPANY`** | 1,500,000 | 49 MB | **88,522 ms** | **358 MB** |
| **migration, `GODOWN`** | 1,300,000 | 40 MB | **108,639 ms** | **377 MB** |
| **stock preview, `STOCKITEM`** | 1,300,000 | 47 MB | **28,070 ms** | **more than 512 MB**: `JSON.stringify` throws "Invalid string length" |

- Electron would need to structured-clone replies of this size to the renderer. At these sizes the main process can run out of memory, or the renderer can crash, after the freeze.
- A well-formed file is enough. Smaller files scale linearly, so about 5 MB of `GODOWN` blocks is roughly 11 s.

### Exploit path

Any role with `import` can trigger this:

1. Pick the XML with **Browse**.
2. Run **Tally Migration Assistant > Preview**, or **Tally XML Import > Preview**.

The main process is blocked for 1.5–2 minutes, and every other window of the app stops responding.

### Fix

- Count every master kind the preview returns against one cap. Check the count before building candidates; count blocks with a limit, for example `tallyTagBlocks(text, tag, cap + 1)`, so oversized files are refused cheaply.
- Apply the same cap to `previewTallyStockXml` / `parseTallyStockItemsXml`, so both channels share it.
- Also bound the reply. Keep the first N rows of each kind and return counts for the rest, as the reference spreadsheets keep 50 rows.
- Move the preview off the main thread (see N12-R2).

---

## SEC-2a. Low: read-only channels now write grant rows that crowd the audit trail

**Where:** `main.js:326-329` (`recordGrant`) and `:344` (its call in `sessionGuarded`).

- `account_mapping` is in `AUDITED_GRANTS`. So every call to these read-only channels writes a hash-chained `permission_granted` row:
  - `account-mapping:registry`
  - `account-mapping:classifications`
  - `account-mapping:coverage`
  - `account-mapping:review-queue`
- `AccountMappingReviewPanel.load()` (`AccountMappingReviewPanel.jsx:66-89`) calls 3 of them on every company or as-of-date change. `QuickCreateMasterDialog.jsx:206` calls the registry too.
- `accounting:data` shows only the newest 300 rows per company (`accountingService.js:1260`). Ordinary browsing by an accountant therefore pushes real changes out of the visible trail. Each extra row also costs two queries plus a hash, and lengthens `verifyAuditChain`.

There is no data exposure. It is noise that weakens the audit trail as a control. A deliberate flood is possible, but `audit:context` already lets any user add rows, so that part is not new.

**Fix:** record grants only for state-changing channels. For example, pass `{ audit: false }` from the read-only `sessionGuarded` registrations, or keep a write-only `AUDITED_GRANT_CHANNELS` list. Alternatively, leave `permission_granted` rows out of the trail that `accounting:data` returns.

## SEC-2b. Low: the support bundle still names the user the screen sends

**Where:** `main.js:1168-1173`, writing through `supportBundleService.js:33-36`.

- `health:support-bundle` is open to any signed-in user. It writes `context: { ...rendererContext }` verbatim into `exports/support-bundles/*.json`.
- A viewer can therefore produce a bundle stating `user_id: 1, user_name: "admin", role: "super_admin"`. Support staff could trust that attribution.
- The payload size is also unbounded, so a large object becomes a large file on disk.
- SEC-1d was fixed only for `health:verification-snapshot`.

**Fix:** build the bundle context the same way as the snapshot: take user fields from `ambientActor()`, and keep only a whitelist of short screen fields such as company id, scope and timestamps, cut to a fixed length.

## SEC-2c. Low: `sessionGuarded` checks one argument and passes another

**Where:** `main.js:331-352`.

- `payload = firstPayload(args)` is the first plain-object argument. It supplies the context of the permission check and the `company_id` of the grant row. The handler, though, receives `args[0]`.
- When `args[0]` is not a plain object, the two differ. For example, `account-mapping:assign` called with `(nonPlain, {company_id: 2})` makes the grant row name company 2.
- The permission check itself has no company scope, so this does not bypass anything. It only lets the grant row misdescribe the call. With the shipped screens, `args[0]` is always the plain payload.

**Fix:** in `sessionGuarded`, use `args[0]` for both the check and the handler. Refuse the call when `args[0]` is present but is not a plain object.

---

## Probe scripts

The scripts live in the session scratchpad only and are not part of the repository:

- `zipbomb.mjs`, `zip2.mjs`, `both.mjs`: padded xlsx built with `zlib.deflateRawSync` and a hand-written central directory.
- `tallyx.mjs`: 20 padded xlsx through the migration preview.
- `tally.mjs KIND N`: migration preview for one master kind.
- `stock.mjs N`: stock-XML preview.

Every timing is wall-clock on Node v22.22.0, against a fresh database from `initializeDatabase`.
