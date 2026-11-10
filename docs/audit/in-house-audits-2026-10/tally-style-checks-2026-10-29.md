# Tally-style checks and code-size breakdown (29 Oct 2026, 04:30 IST)

This was a read-only check, made as an exception to the hold. Nothing was committed or pushed, and no PR was opened.

Two versions were checked:

- **phase-16** (`acf6d02`), the working branch.
- **PR #4 head** (`219b2d3`, branch `claude/erp-full-automation-qbhv8k`).

File references are to the PR #4 head unless marked "p16".

## 1. Money in paise

**Verdict:** this is half done on phase-16 and mostly done on PR #4. It isn't integer-only from end to end on either version.

### What is in place on both versions

- **Every money column has a paise twin.** For example, there is `debit_minor` next to `debit`. The old decimal (REAL) columns are still written alongside them.
- **The posting balance check runs in paise.** `createBalancedVoucher` converts every line to whole paise and refuses the voucher unless debit paise equal credit paise. See `accountingService.js:178-186` (p16 `:148`).
- **There is no decimal library.** Amounts are plain JavaScript numbers, converted to paise at the edges by `src/main/domain/money.js`.

### Phase-16 is unsafe

`parseMoneyToMinor` uses `Math.round(value * 100)` (`money.js:12, 21`), so ₹1.005 becomes 100 paise instead of 101. Invoice totals are summed as raw floats before posting (`accountingService.js:468-470`). The three voucher lines are then rounded separately, so they can disagree by 1 paisa.

I tested 200,000 invoice amounts (₹1,000.01 to ₹3,000.00 at 18% GST):

- 356 of them (0.18%) are refused with "Unbalanced voucher in minor units".
- ₹1,001.25 is one example: its GST of ₹180.225 rounds differently from the gross.

The paise columns on old databases are also never backfilled: `backfillAll` exists but nothing calls it.

### PR #4 fixes the main problems

- **Exact rounding.** It rounds from the decimal digits, half away from zero (`money.js:11-23`), so ₹1.005 now becomes 101 paise.
- **Rounded totals before posting.** `documentTotals` rounds each line and each total before posting (`accountingService.js:574-583`). The same 200,000 amounts give **0 refusals**.
- **GST recomputed in the backend.** `billingService.js:13-38` recomputes it on save, with CGST taken as half and SGST as the remainder, so the two always add up to the GST.
- **Backfill on upgrade.** `backfillAll` now runs (`init.js:677`).

### Leftovers on PR #4

- **Float maths in the invoice preview.** The invoice entry screen still calculates GST with plain floats (`src/renderer/features/billing/billingHelpers.js:3-23`). The preview can differ from the saved figure by 1 paisa. The saved figure is the correct one.
- **Some totals still add the old decimal columns.** These include the dashboard cash and bank balance (`dashboardService.js:156`), the health check (`healthService.js:159`), the readiness checks, and the bank reconciliation voucher list.
  - SQLite adds these accurately in practice. As a test, ten ₹0.10 entries summed to exactly 1.0.
  - The same sum in plain JavaScript gives 0.9999999999999999.
  - They should move to the paise columns for consistency.
- **A second balance check.** The bank-statement voucher path has its own float-based check (`bankReconciliationService.js:705, 738`) instead of the paise check.

## 2. Keyboard speed

**Verdict:** the app is keyboard-friendly, but the keys are not Tally's, and adding voucher lines needs a click or Tab. Both versions are the same here.

### What works

- **Voucher keys on the Accounting screens** (`App.jsx:936-951`):

  | Key | Opens |
  |---|---|
  | F2 | Receipt |
  | F3 | Payment |
  | F4 | Sales |
  | F5 | Purchase |
  | F6 | Contra |
  | F7 | Journal |
  | F8 | Credit Note |
  | F9 | Debit Note |

- **Alt shortcuts from anywhere** (`App.jsx:1136-1160`):
  - Alt+R Receipt, Alt+P Payment, Alt+S Sales, Alt+U Purchase, Alt+J Journal, Alt+C Contra, Alt+N Credit Note, Alt+D Debit Note.
  - Alt+I, Alt+G, Alt+T and Alt+A open stock issue, receipt, transfer and adjustment.
- **Form keys:**
  - Enter moves to the next field and Shift+Enter moves back (`App.jsx:1013`).
  - Ctrl+S saves, Ctrl+P opens print preview, and Esc exits.
- **Other keys:**
  - Alt+Insert quick-creates a master (`App.jsx:1221`).
  - Party and ledger pickers are keyboard-driven (`useEntityPickerKeyboard.js`).
  - Ctrl+K opens search.
  - Ctrl+1 to Ctrl+9 jump to modules.
  - The full list is in `config/keyboardShortcuts.js`.

### Gaps against Tally habits

- **The voucher keys don't match Tally's.** Tally uses:

  | Key | Voucher |
  |---|---|
  | F4 | Contra |
  | F5 | Payment |
  | F6 | Receipt |
  | F7 | Journal |
  | F8 | Sales |
  | F9 | Purchase |
  | Ctrl+F8 | Credit Note |
  | Ctrl+F9 | Debit Note |

  - Here F4 opens Sales and F6 opens Contra, so a Tally user will open the wrong voucher.
  - Alt+C opens Contra here, but in Tally it creates a master on the fly. Here that is Alt+Insert.
- **The same F-key does different things on different screens.** F4 opens Sales on Accounting, Transfer on Inventory, and "view order" elsewhere (`App.jsx:1191`).
- **No automatic new voucher line.** Voucher lines are added with an "Add Line" button (`VoucherEntryScreen.jsx:55, 167`). Enter on the last line doesn't start a new one the way it does in Tally, so the user must Tab to the button or click it.
- **No date-change or period keys.** There is nothing like Tally's F2 (change date) or Alt+F2 (change period) while entering a voucher.

**Suggested fix (a minor UX phase):** an optional "Tally key layout" setting, and Enter on the last line adding a new line. Neither changes any accounting logic.

## 3. Double entry that can't break

**Verdict:** the save-time balance check is solid on both versions. "Never quietly edited" holds in the app's code but isn't enforced in the database itself. The reversal problems found in the audit are fixed on PR #4.

### Balance check before saving

- `createBalancedVoucher` refuses a voucher if any of these hold (`accountingService.js:159-186`):
  - it has fewer than two lines, or no debit or no credit line;
  - it has negative, zero or non-finite amounts;
  - a line has both a debit and a credit;
  - an account belongs to another company or is inactive;
  - the paise totals differ.
- It writes the voucher, lines, ledger entries and audit row in one transaction (`:188-217`), so a failure leaves nothing half-saved.
- The bank-statement voucher path is the one exception, with its own check (see section 1).

### No quiet edits

- **Generic save and delete can't touch the accounting tables.** These include vouchers, voucher lines, ledger entries, cash and bank, receivables, allocations, supplier payments and the audit log (`init.js:259` on PR #4, p16 `:253`; enforced in `crudHelpers.js:40-46`).
- **Posted documents are locked.** Posted or reversed invoices, purchases, payments, expenses and stock documents, and posted vouchers, can't be edited or deleted: "Use reversal" (`crudHelpers.js:317-330`).
- **There is no "edit voucher" anywhere.** The only voucher updates are status changes: marked Reversed (`accountingService.js:480`) and a bank draft moved to Posted (`bankReconciliationService.js:763`).

### Weak spots

- **No database-level protection.** There are no triggers protecting vouchers or ledger entries, so the app code is the only guard.
- **Reset is the only way to delete posted vouchers.** The operational reset wipes them, along with all other transactions. On phase-16 reset is open to anyone (audit finding SEC-2). On PR #4 it requires the `system_reset` permission (`main.js:1331`).
- **Phase-16 reversal problems:**
  - It crashes on most source documents (C1).
  - Reports drop the reversed original but keep its reversal (A1).
  - Drafts can be "reversed" (A13).
- **PR #4 reversal fixes:**
  - Reports count Posted and Reversed together (`reportBuilders.js:786-788`).
  - Only Posted vouchers can be reversed (`accountingService.js:445-446`).

## 4. What the 94.7% JavaScript and 5.3% CSS is

GitHub shows the default branch, **main (`aec83eb`, the old July baseline)**. There, JavaScript is about 1.96 MB and CSS about 106 KB (5.1%). GitHub skips JSON, Markdown and HTML, which is why its figure is slightly different. The working branches have moved on a lot, so sizes are given for phase-16 too.

| Part | What it does | main | phase-16 |
|---|---|---|---|
| React screens: `App.jsx` | Layout shell, sidebar, routing, keyboard shortcuts, global search | 679 KB, the whole UI in one file | 81 KB after the split into modules |
| React screens: everything else (`features/`, `screens/`, `components/`, `modules/`, `print/`) | Every form and report, voucher and invoice entry, tables, pickers, print layouts | ~430 KB | ~1.55 MB |
| Help and knowledge (`renderer/knowledge`, `config/`) | Help Assistant answers, screen manuals, shortcut lists, navigation config | ~92 KB | ~372 KB |
| Backend services (`src/main/services`) | Posting, reversal, GST, inventory, imports, backup, auth, reports, go-live | 64 KB | 462 KB |
| Database layer (`src/main/database`) | Schema, migrations, seed data, report SQL (trial balance, P&L, balance sheet) | 476 KB, mostly `init.js` | 298 KB |
| Electron shell (`main.js`, `preload`) | Opens the window and connects the screens to the backend (155 IPC channels) | 51 KB | 67 KB |
| Scripts and tests (`scripts/`) | The `verify:*` checks, migration and repair tools, governance and graph checks | 141 KB | ~1.0 MB |
| CSS (`src/renderer/styles`) | Look and layout of every screen: colours, tables, sidebar, forms, print, dark mode | 106 KB, 1 file | 144 KB, 12 files |

In plain words:

- **JavaScript is the whole app:** screens, accounting engine, database and tests.
- **CSS is only the visual styling**, with no logic in it.
- **No other languages are used.** There's no Python, server code or SQL file; the SQL lives inside the JavaScript files.

On phase-16 the CSS share falls to about 3.5% because the JavaScript grew to about 4 MB. Scripts and tests are now about a quarter of all the code.
