# Paise Exactness, Database Ledger Guards and Optional Tally Key Layout

Branch: `work/paise-tally-dblock` (base `219b2d3`, PR #4 head)
Date: 29 October 2026 (IST)
Approved by the owner on 29 Oct 2026: "All approved for this fixing" (covers the AGENTS.md rule 4 items below).

## Feature classification

- Primary: Accounting (posting integrity, money exactness)
- Secondary: Health & Recovery (money integrity panel), Productivity (keyboard layout)
- Size: **MAJOR** (new database triggers, a new table and a new posting type). Review: Copilot plus three own audits; Gemini/Copilot first, then Codex, at the owner's request.

## What changed

1. **Money exact to the paisa.** Every stored and reported amount is worked out in whole paise (`*_minor` integer columns) and stored in rupees as exactly paise / 100. Reports, the GRNI check and COGS read the paise columns. Rounding is half away from zero, from the decimal digits typed, never from a binary fraction.
2. **The database refuses bad books** (`src/main/database/ledgerGuards.js`). Eleven triggers refuse to post a voucher with no lines, unbalanced lines or ledger entries, lines that disagree with the ledger, or rupee values that are not their paise / 100; and refuse any edit, delete or replace (`INSERT OR REPLACE`, `UPDATE OR REPLACE`) of a posted voucher's fixed columns, its lines or its ledger entries. The app's own checks stay; the database is the last line of defence.
3. **Old rounding mismatches are corrected, never rewritten.** Health Center > Errors shows a money integrity check. An older voucher out by 1 to 100 paise can be settled once with a labelled **Rounding adjustment** journal to the "Rounding Off" account, dated on the original's date. The original voucher is never changed. Reversing the original reverses the adjustment with it.
4. **Optional Tally key layout** (User Preferences, F12). F4 Contra, F5 Payment, F6 Receipt, F7 Journal, F8 Sales, F9 Purchase, Ctrl+F8 Credit Note, Ctrl+F9 Debit Note, F2 change date, Alt+C create master, Enter on the last voucher line adds a line. The standard layout stays the default and the mouse works the same in both. Party, ledger and item pickers keep their own keys.

## Posting-behaviour changes (AGENTS.md rule 4, approved 29 Oct 2026)

1. Stored rupee amounts and stock values are rounded to whole paise at the point they are worked out.
2. Posting is refused by the database when a voucher does not balance to the paisa.
3. A new voucher kind: Rounding adjustment (Journal, `source_module = 'rounding_adjustment'`, number series `RNDADJ`), one-sided by design, limited to 1 to 100 paise and one per original.
4. A reversal of an older unbalanced voucher mirrors it exactly, so the pair nets to zero.
5. Year close requires the trial balance and the balance sheet to balance exactly to the paisa (previously the balance sheet could be out by up to one rupee).

## Database impact

- New table `ledger_maintenance` (maintenance window for trusted repair code; rows live only inside one transaction). Registered in the database graph (DG-1, 74 tables). Only `ledgerGuards.js` writes it; a test enforces that.
- 11 triggers `trg_ledger_guard_*`, dropped before migrations and recreated at the end of every start, so a changed rule reaches every existing database and a tampered trigger is replaced.
- 5 indexes for the trigger lookups: voucher lines by voucher, ledger entries by voucher, ledger entries by company and account, ledger entries by voucher line, and vouchers by source (to find a voucher's corrections).
- Start-up counts unbalanced or mismatched posted vouchers before and after the work it does with the guards off (migrations, seeding), in one grouped pass that needs no index. A rise is written to the audit log as `ledger_startup_check_failed` and shown in Health Center; start-up is not refused, so the books can still be opened and corrected. A database that does not yet have the paise columns cannot be counted before its upgrade, so the comparison starts from the next start.
- Any other trigger on the ledger tables is removed at start-up and logged (`ledger_unexpected_triggers_removed`); while the app runs, the money integrity check reports one.
- A "Rounding Off" account per company (reuses an existing one; otherwise the first free code from 5180 upward, so it never takes over an existing 5180).
- No existing row is changed by this work. Migration 036 (from PR #4) backfills the paise columns.

## New IPC channels

| Channel | Permission | Purpose |
|---|---|---|
| `money:integrity` | any signed-in user | Money integrity report (trial balance in paise, unbalanced vouchers, line/ledger mismatches, rupee/paise mismatches, sub-paisa legacy amounts, missing or unexpected guards, open maintenance windows, drafts holding ledger entries) |
| `money:rounding-adjustment` | post | Posts one rounding adjustment for a named older voucher |

Both need a signed-in session. Any signed-in user can run the check, like the other Health Center checks; a viewer is refused the rounding adjustment (`scripts/audit/ipc-security.test.mjs`).

## Proof

- **All 2 lakh amounts** (₹1,000.01 to ₹3,000.00 in steps of one paisa) posted through `saveBillingVoucher` and `postSalesVoucher`: 200,000 vouchers, trial balance difference **0.00**, every voucher balanced to the paisa, 0 problems. Run with `npm run proof:paise`.
- A permanent sample of the same check runs in `npm run test:integrity` (`scripts/audit/paise-proof.test.mjs`).
- **Rehearsal on a copy** of an older database: upgrade ran with its automatic pre-upgrade backup; guards present; an older 1-paisa mismatch was found, settled by `RNDADJ-00001`, the original left unchanged, trial balance then 0.00; edits and deletes of posted entries refused; a second start was clean. Evidence in project files `audits/2026-10-29-paise-proof/`.

## Audits

Three own audits (correctness, security, architecture sustainability) were run on the branch. Their findings were fixed in commit `62f4b35`: trigger versioning, Draft→Reversed bypass, rupee/paise mirror check, mirror reversals, adjustment reversed with its original, Rounding Off seeding without taking code 5180, accepted `paise()` input forms, picker key handling, desktop-shortcut routing for the Tally keys, permission on the integrity channel, report SQL reading paise, and audit row fields.

Findings left as they are, with reasons:

- Dashboard and bank screens use SQLite `ROUND` for display only; no stored amount depends on them.
- The permanent proof sample posts about 3,300 invoices (about 30 seconds); the full run stays a separate command.
- `keyLayout.js` lives in the renderer config folder and uses its own event names; moving it would touch unrelated screens.
- `backfillSingleValue` in `moneyMigration.js` is unused and predates this work.
- The integrity report's company filter is optional because roles are global in this build.

## Checks

- `npm run test:integrity`: all node and IPC tests pass.
- `npx vite build` and `npm run lint:syntax`: pass.
- Electron verify scripts: identical results on this branch and on the base `219b2d3`. Failures present on both and not caused by this work: `verify:financial-reports` checks 9 and 16, `verify:dashboard-wiring` (1 check), report manifest integrity in `verify:graph-registry` and `verify:audit`, `verify:alphabetical-options`, `verify:erp`.
- Desktop smoke test: see the section below.

## Desktop smoke test

Electron 37 build of this branch, fresh demo database, signed in as the administrator, at 1440×900 and 800×600. Keys were sent through the main process (`webContents.sendInputEvent`), so they took the same `before-input-event` path as a physical key press.

- F12 opened User Preferences; choosing the Tally layout was saved.
- In the Tally layout, at both sizes, F4 opened Contra, F5 Payment, F6 Receipt, F8 Sales, F9 Purchase, Ctrl+F8 Credit Note and F7 the journal (14 of 14 checks). F2 put the cursor on the entry date.
- Back in the standard layout, F4 kept its standard meaning.
- Health Center > Error Console showed Money integrity: books balance to the paisa, trial balance difference 0.00, no unbalanced vouchers.
- No horizontal scrolling and no screen crash at either size.

The smoke test found one defect, which is now fixed. The Money integrity check had been tied to the `view_reports` permission, which the administrator role does not have, so administrators could not run it. The panel also showed "every posted voucher balances" while the check had not run. Now any signed-in user can run the check, like the other Health Center checks, and the panel shows nothing that reads as all clear until a result comes back. A test covers both.

Not changed: the Money integrity heading has the same plain look as the Error Console panel above it, because both use the same Health Center classes.

## Codex review (PR #5, 29 Oct 2026)

Codex's security review found no issues. Its code review raised four findings, all confirmed and fixed with tests:

1. One older imbalance could be cancelled twice (a second mirror reversal, or an adjustment after a reversal). The guard now allows a correction only while the original is still Posted and no other correction has already cancelled its difference.
2. `INSERT OR REPLACE` could overwrite a posted voucher, line or ledger entry, because SQLite's replace deletion does not run delete triggers. The insert guards now refuse a conflict with a posted row.
3. A rounding adjustment could be posted from All Companies View. It now needs one selected company matching the voucher, and the panel hides the button in that view.
4. In the desktop app, a Tally voucher key pressed inside a party, ledger or item picker fell through to the standard keys and could open another voucher screen. It now goes to the picker.

After the fixes: all 2 lakh amounts posted again with trial balance difference 0.00 and 0 problems; the rehearsal on a copy passed again; in the desktop app at both sizes, F8 inside a picker left the Receipt voucher in place while F8 outside it opened Sales.

## Round 2 (10 Nov 2026 IST): Codex, Gemini and Copilot, then three own audits again

Codex raised one more finding: `UPDATE OR REPLACE` could move a draft voucher or line onto a posted one's id or number and silently delete the posted row. A new trigger, `trg_ledger_guard_voucher_replace`, and a wider line-update guard refuse it. Gemini has not posted a review on this PR, and Copilot could not review it because its quota is used up.

The three own audits on the new head found, and this round fixed with tests:

- **Correctness.** A mirror reversal of an older unbalanced voucher was dated today, which could leave each financial year's trial balance off by the difference. It is now dated on the original's date, refused with a plain message if that year is closed or locked, and the database refuses any correction dated in another financial year. Reversing a voucher that holds a line of zero paise no longer fails. A stock receipt worth less than half a paisa posts with no voucher instead of failing, and receipt values are rounded to the paisa before posting. Reversing a voucher with no source module no longer crashes.
- **Security.** An invalid company id sent to the integrity check fell back to all companies; it is now refused. `withLedgerMaintenance` read a missing or zero company id as "all companies"; it now needs a positive id or the named `LEDGER_MAINTENANCE_ALL_COMPANIES`. A maintenance window for one company can no longer move a line or ledger entry into another company's books. The Rounding Off ledger must be an active Expense account.
- **Architecture.** Shared names for the correction sources, a generated list of fixed voucher columns in the trigger, the source index, a single-voucher lookup for the adjustment, open maintenance windows shown in Health Center, the start-up ledger check, the `ledger_maintenance` registration, and tests that Health Center and the Error Console agree.

Left as it is: the supplier payable SQL still adds REAL rupee columns, because the procurement, allocation and advance tables have no paise columns yet. That is a separate change.

After the fixes: `npm run test:integrity` 132 + 20 tests pass; all 2 lakh amounts posted again with trial balance difference 0.00 and 0 problems; an older-format database (made with the base `219b2d3`, with a voucher off by one paisa) was upgraded on a copy with all 11 guards and 4 indexes in place, settled by `RNDADJ-00001`, trial balance 0.00, and no start-up audit row on a second start; in the desktop app at 1440×900 and 800×600, Health Center showed the result and, with a stray maintenance row, the warning that protection is switched off. Evidence in project files `audits/2026-10-29-paise-proof/` (`full-run-round2.log`, `rehearsal-on-copy-round2.json`, `smoke-round2/`).

## Round 3 (10 Nov 2026 IST): own audits on 2b0f979 and Copilot's first review

PR #4's head `a97daf4` was merged in first; the two conflicts were import lines only.

Copilot reviewed for the first time and raised eight findings; the three own audits raised the rest. All were fixed with tests:

- **Posting now checks each ledger entry against its line.** Every line must have exactly one ledger entry with the same account and amounts, in the voucher's company, and every line's account must belong to that company. Before, only the totals were compared.
- **Paise must be whole numbers.** SQLite would store 0.5 in an integer column; posting now refuses it.
- **Corrections are stricter.** A rounding adjustment must be one line on the company's Rounding Off ledger; a one-sided reversal must mirror the original (made exact in Round 4: each original line used once). Lines and ledger must agree on debit and credit totals separately, not only on the net difference.
- **Maintenance windows stay inside their company.** A window for one company can no longer move a posted voucher to another company, or add or move ledger entries onto another company's voucher; the same-company rule for entries holds even inside a window.
- **A trigger the app did not create on the ledger tables** is removed at start-up and logged, and the money integrity check reports one found while the app runs.
- **Unposted vouchers holding ledger entries** are reported by the integrity check, since some reports read entries without checking the voucher's status.
- **Start-up check.** The count is one grouped pass that needs no index (20,000 vouchers: well under a second, where the first version took about a minute on an older database), it only hides a "no such column" error, it does not compare on the start that runs migration 036 (which can uncover older defects), and a failure shows in Health Center.
- **Integrity report.** It now lists vouchers whose entries do not match their lines, and a stored amount with a fraction of a paisa counts as harmless only when it rounds to its paise value. The Error Console's voucher check also flags lines that disagree with the ledger, (fully aligned in Round 4, where both read one shared check).
- **Stock.** A receipt worth less than half a paisa no longer picks up the item's average cost.
- **Screens.** The Money integrity panel clears its result when the company changes and ignores an older answer that arrives late. Alt+C inside a picker now uses the name just typed.

Left as it is: GST registers, the GST summary, the GRNI check and two health totals read ledger entries without checking the voucher's status. After this change only an interrupted posting could leave entries on a draft, and the integrity check now reports that case; changing those reports is a separate change.

After the fixes and the merge of PR #4 head `3c12e50`: `npm run test:integrity` 159 + 23 tests pass; all 2 lakh amounts posted again with trial balance difference 0.00 and 0 problems; `vite build`, `lint:syntax` and the database-graph check pass; the older-format database was upgraded on a copy again with all guards in place, settled by `RNDADJ-00001`, trial balance 0.00 and no start-up audit row.

## Round 4 (10 Nov 2026 IST): own audits on 66bb35a

The three own audits found one serious bug and several smaller ones. All were fixed with tests:

- **Integrity report (High, found by two audits).** A missing pair of brackets meant one draft voucher with lines but no ledger entries, which Bank Reconciliation leaves as a normal state, made the report fail every posted voucher and refused every rounding adjustment. The check also ran one query per voucher, which took about two minutes at 8,000 vouchers and froze the app. It is now grouped passes over each table: 20,000 vouchers in about a second.
- **One shared rule.** Health Center, the Error Console and the start-up count now read the same check: debit and credit totals compared separately, one matching entry per line, and every line, entry and account in the voucher's company. Before, the Error Console and the start-up count missed a voucher with balanced lines and no ledger entries, and entries doubled on both sides. A test runs four defect cases through all three.
- **Reversal mirror.** A one-sided reversal must use each original line exactly once. Before, two copies of one line could stand in for two different lines.
- **Rounding adjustment.** Its line must be on the company's active Expense ledger named Rounding Off, so a look-alike account cannot be used.
- **Accounts stay in their company** for lines and entries even inside a maintenance window.
- **Planted triggers.** A trigger is caught whatever case its table name uses, and also when it sits on another table but writes to the ledger tables.
- **Guards are compiled at start-up.** SQLite checks a trigger's column names only when it runs, so a future migration that renamed a column would have broken every posting. Now such a change fails at start-up.
- **Soft-deleted entries** are ignored by every posting check.

The start-up count on 200,000 vouchers with no indexes takes about 1.3 s (it runs twice per start).

After the fixes: `npm run test:integrity` 166 + 23 tests pass; `vite build`, `lint:syntax`, the database-graph and audit-graph checks pass; the older-format database was upgraded on a copy with all guards in place, settled by `RNDADJ-00001`, trial balance 0.00 and no start-up audit row; the desktop app showed Money integrity at 1440×900 and 800×600 with difference 0.00, no overflow and no page errors (`smoke-round4/`); all 2 lakh amounts posted again with trial balance difference 0.00 and 0 problems. PR #4 head `9dac174` was then merged in with no conflicts, and the tests, lint, build and graph checks pass again.

## Restore point

Base commit `219b2d3`. Branch `backup/before-cl-automation` (`acf6d02`) is untouched.
