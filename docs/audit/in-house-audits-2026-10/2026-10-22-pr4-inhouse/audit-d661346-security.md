# In-house security audit: dc030e6..d661346

- Repository: gii-gem-erp, branch `claude/erp-full-automation-qbhv8k`, head `d661346` (one commit: "Close the dc030e6 audit findings and preserve those audits")
- Range: `git diff dc030e6..d661346`. The archived report copies under docs/audit were not reviewed.
- Method: code read, then probes in a scratch clone (`/tmp/claude-0/audit-d661346`, probe scripts in `/tmp/claude-0/probes-d661346/`).
  - IPC probes import the real `src/main/main.js` with the repo's electron stub. They sign in as admin and call the registered handlers.
  - Each argument is round-tripped through `v8.serialize`/`v8.deserialize`, the structured clone that Electron IPC uses.
  - The checkout under /home/claude was not modified.
- The round's own regression tests pass: the four `dc030e6 round` tests in `audit2-regressions.test.mjs` and the `605a873 round` support-bundle test in `ipc-security.test.mjs`.
- Date: 2026-11-10

## Summary

| # | Severity | Area | Status |
|---|----------|------|--------|
| N1 | Medium | Support bundle: `boundedScreenContext` serialises the whole screen context *before* measuring it. A 25-byte IPC message (a sparse array) holds the main process for 10-12 s and uses about 2 GB of memory per call | Not new code (same pattern since 605a873), but the S1 "bounded" claim does not cover CPU or memory |
| S1 | (was Medium) | Support-bundle disk size | **Fixed.** A file is now at most about 2.1 MB, and 20 files are about 42 MB in all |
| S2 | (was Medium) | Start-up on a wrong-type variance ledger | **Fixed.** Residual Info: the refusal message names a rename action that does not exist |
| S3 | (was Low) → Low | Audit manifest | **Literal bypass fixed.** Residual: deleting one report's entry from the manifest still blesses an edit to that report |
| S4 | (was Low/Info) → Info | User-like keys nested in the screen context | Unchanged, but now inside an opaque string |
| S5 | Info | `guarded()` grant rows take their company from *any* argument again (a deliberate change) | Accepted trade-off. Inconsistent with `sessionGuarded` |

No new injection, authorisation or path issue was found in the rest of the range:
- `inventoryService.js`: the `${billed ? ...}` SQL fragment is a constant choice, and `linked_party_*` comes from the stored row.
- The `billingService` re-export removal has no importer left.
- The bundle file sequence number and retention are sound.

## Findings

### N1 (Medium): screen context is fully serialised before the 1 MB check (CPU and memory amplification)

**Where**
- `src/main/services/supportBundleService.js:38` runs `text = JSON.stringify(rest)` over whatever the renderer sent. It only checks the size afterwards (line 39).
- When the text is over the limit, line 43 serialises `rest.crashes` a **second** time.
- The input comes from `src/main/main.js:1181` (`health:support-bundle`). The preload exposes it as `exportSupportBundle(context)` (`src/preload/preload.cjs:120`).
- The channel checks sign-in only. Any role can call it.

**Exploit path.** A compromised or scripted signed-in renderer calls `window.api.exportSupportBundle(ctx)` with a payload whose JSON form is far larger than its IPC form:
- **Sparse array.** Structured clone sends a sparse array as its length plus its present elements, so `{crashes: a}` with `a.length = 1e8` is **25 bytes** on the wire. `JSON.stringify` then builds a 500 MB `"null,null,…"` string. Because the key is `crashes`, it does this twice.
- **Typed array.** A `Uint8Array` serialises in JSON as `{"0":255,"1":255,…}`, about 10x its byte size.

**Probe results** (`/tmp/claude-0/probes-d661346/sparse2.mjs`, `bundle.mjs`; default Node heap limit 2.2 GB):

| Payload (wire size) | Main thread blocked | RSS growth | Result |
|---|---|---|---|
| `{crashes: sparse length 1e8}` (25 B) | 10.1 s | ~2.1 GB | "larger than 1 MB" |
| `{crashes: sparse length 1.07e8}` (25 B) | 12.3 s | — | "larger than 1 MB" |
| `{other: sparse length 1e8}` (25 B) | 5.9 s | — | "larger than 1 MB" |
| `{blob: Uint8Array 20 MB}` | 8.5-9.9 s | ~1.2 GB | "larger than 1 MB" |
| `{blob: Uint8Array 50 MB}` | 37 s | ~2.0 GB | "could not be read" |
| `{crashes: Uint8Array 20 MB}` | 16 s | ~0.8 GB | "larger than 1 MB" |

The process did not run out of memory in these runs, but it is close to the default heap limit. The calls can be repeated back to back with no rate limit, so the whole app (every window and every posting) freezes for as long as the renderer keeps calling. This is an availability issue only. Nothing is written to disk, and the bundle stays small.

The same stringify existed in `main.js` at dc030e6, so this is not a regression. It is reported now because S1's fix describes the context as "bounded", and that holds for disk but not for CPU or memory. `firstPayload`'s comment (`main.js`, "a large one would hold the app before the permission check") shows the codebase already treats this class as a defect.

**Fix (any one is enough; the first is simplest)**
1. **Allow-list instead of serialise-everything.** Keep only the fields support needs, for example `source` (a string sliced to 200 characters) and `crashes`. Accept `crashes` only if `Array.isArray(c) && c.length <= 50` and the array is not sparse (`Object.keys(c).length === c.length`). Map each entry to `{message, stack, time}` strings sliced to a few KB. Then stringify the small result.
2. Or replace `JSON.stringify` with a bounded walker that counts output bytes as it goes and stops at 1 MB. It should also reject typed arrays and `ArrayBuffer`, arrays whose `length` is over a small cap, and depth over about 16. A plain-prototype check like `firstPayload` already does belongs at the top.
3. In either case, do not serialise `rest.crashes` a second time in the fallback without the same bound.

Add a regression test that sends `{crashes: Object.assign([], {length: 1e8})}` and asserts the call returns in under 100 ms.

### S1 (fixed): support-bundle file size

**Verified.** The screen context is now one compact JSON string (`context.screenContextJson`), and it is written once. `diagnostics.context` now holds only `signedInHealthContext` (`user_id, user_name, role, dbName` plus the allowed company fields). Probe results (`bundle.mjs`, through the real handler):

| Payload | File size |
|---|---|
| Nesting, depth 350 around ~349k empty arrays (1,048,568 B compact; it was 499 MB at dc030e6) | **1.06 MB** |
| 524k backslashes | 2.11 MB |
| 524k double quotes | 2.11 MB |
| Lone surrogates (`\ud800`, already escaped in the inner text) | 1.23 MB |
| Astral characters, U+2028 | about 1.06 MB |
| Crash-list fallback (crashes of 262k backslashes plus a 2 MB extra) | 1.06 MB; the crash list is kept |
| Crashes over 512 KB | dropped, 13 KB file |
| 25 more calls of the worst case (backslashes) | **20 files, 42.2 MB total**, largest 2,109,059 B |

- **Backslashes and quotes.** These are the only characters that grow when the inner text is escaped again as a string value (2 bytes become 4). So a file can reach about 2x the 1 MB cap. That is bounded and acceptable. If the doc or test should say "1 MB in the file", measure `Buffer.byteLength(JSON.stringify(text))` instead (Info).
- **Key tricks.** A context of `{"__proto__":…, "USER_ID":7, "user_id":9, "nested":{…}, "constructor":{…}}` comes out as an opaque string. The top-level `user_id` is removed, and the session's `context.user_id` stays correct.
- **`toJSON`.** A `toJSON` key cannot be a function after IPC, so it is plain data.
- **Retention.** The new file is excluded from the delete sweep and `slice(19)` is applied, so exactly 20 files are kept. The sequence suffix keeps same-millisecond bundles apart. The ISO stamp sorts lexically.

The CPU and memory side is N1.

### S2 (fixed): start-up and a wrong-type variance ledger

**Verified.**
- `init.js:802`: seeding calls `ensurePurchasePriceVarianceAccount(..., { refuseWrongType: false })`. It returns `null` when only a non-Expense same-name ledger exists, so start-up and `backup:restore` re-initialisation no longer throw.
- `init.js:814`: the lookup prefers an Expense match (`ORDER BY (account_type = 'Expense') DESC, id`), so a legacy lower-id Asset ledger no longer shadows the system ledger.
- The regression test re-opens a database whose only variance ledger is a Liability, and it passes.
- No other start-up code looks up the ledger by name (`grep` finds only `init.js:806/813`).
- The posting path (`inventoryService.js:437`) still refuses, and only when the variance is non-zero.

**Residual (Info, not security).** The refusal message now says *"Rename that ledger in Accounting > Books & Ledgers > Chart of Accounts"*. There is still no rename or retype channel: the preload has only `accounts:create-quick`, and `accounts` is in `WRITE_POLICY.accountingReadOnly`. A company in that state cannot post supplier returns that carry a variance until support edits the database. Either add a guarded rename for ledgers that have no postings, or point the message at the real support step.

### S3 (Low, residual): manifest refusal keys on the manifest's own contents

**Verified fixed for the literal bypass** (`scripts/update-audit-manifest.js:29-30`). In the scratch clone, these manifests all exit 1 without `--init`:
- `{}`
- `{"entries":[]}`
- `{"entries":"x"}`
- `{"entries":[{}]}` (the entry with no path is reported as "removed")

An edited report with the manifest intact is also refused.

**Residual bypass (probe).**
1. Append a line to `2026-10-17-erp-automation/audit-1-current-build.md`.
2. Delete *only that report's* entry from `manifest.json`.
3. Run the script.

It exits 0 and writes "54 reports listed", blessing the edit. The script cannot detect a manifest that was trimmed consistently, because the manifest is its only reference. `count` is not cross-checked either (it would not help here, since the attacker can set it).

**Fix.** Tamper evidence has to come from outside the working tree. In CI (or in the script, when git is available), compare every entry of `git show <merge-base>:docs/audit/in-house-audits-2026-10/manifest.json` with the current files and manifest. A path that existed at the base must still be listed with the same sha256. As a cheap extra, refuse when `count !== entries.length`.

### S4 (Info, residual): nested user-like keys in the screen context

Unchanged: only the six exact top-level keys are removed. The probe input with `nested.user_id`, `USER_ID` and an own `__proto__` key is kept in `screenContextJson`.

Because it is now one string value rather than an object in the bundle, a downstream tool that `Object.assign`s the bundle no longer merges those keys. Only a tool that parses the inner string and then merges it would be affected. The authoritative `context.user_id` and `user_name` are always the session's.

**Fix.** Folding this into N1's allow-list removes it entirely.

### S5 (Info): grant rows take their company from any argument

**What changed.** `src/main/main.js:330/339`: `guarded()` now passes `firstPayload(args)` (which scans every argument) both to `enforcePermission` and to `recordGrant`. This is deliberate: grant rows and denial rows now match. But it reopens what the dc030e6 round had closed.

**Probe** (`grant.mjs`, admin): each of these calls wrote a `permission_granted` row with `company_id = 1`:
- `backup:restore("does-not-exist.db", {company_id: 1})`, even though the restore itself was refused. Grant rows are written before the handler runs; that predates this range.
- `financial-years:status(999999, {company_id: 1})`
- `alerts:get-settings("x", {company_id: 1})`

A company id that does not exist is dropped by `auditLog` (`init.js:1678`).

**Impact.** For audited actions whose first argument is not a plain object (`backup:restore`, `financial-years:status`), the screen chooses which company the audit trail names. `enforcePermission` is role-only, so there is no access bypass. This is an audit-trail labelling issue.

`sessionGuarded` (`main.js:359`) uses the first argument only, for both the check and the grant, so the two guard styles now disagree.

**Fix (optional).** Use `firstPayload(args.slice(0, 1))` for both the check payload and the grant in `guarded()`. That keeps grant and denial rows consistent with each other *and* with `sessionGuarded`, and a second argument can no longer set the recorded company.

## Probe files

- `/tmp/claude-0/probes-d661346/bundle.mjs`: support-bundle sizes, key tricks, typed arrays, retention, through the real IPC handler.
- `/tmp/claude-0/probes-d661346/sparse.mjs`, `sparse2.mjs`: sparse-array and typed-array amplification in `boundedScreenContext`.
- `/tmp/claude-0/probes-d661346/grant.mjs`: grant-row company labelling.
- The manifest probes were run inline in the scratch clone. They were restored with `git checkout -- docs` afterwards.
