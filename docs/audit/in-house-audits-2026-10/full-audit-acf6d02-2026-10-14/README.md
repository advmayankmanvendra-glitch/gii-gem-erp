# Full audit of acf6d02 (phase-16-enterprise-crm-integration), 2026-10-14

## Verdict

**Not safe for real books. Do not merge PR #3 to main as a release.** Classification: **Prototype** (AGENTS.md rule 23).

The screens are in good shape: all 171 sidebar screens open in the Electron app with no crash, blank screen or console error. The problems are underneath. A user who is not logged in, or is logged in as a viewer, can post, reverse, restore and wipe data. Reversals are counted backwards in the reports. Opening a database built on old main shows every historical amount as zero. Reset rollback can corrupt the database file.

The verify scripts don't catch any of this. Most check structure or source text, `verify:erp` can't pass on a clean clone, and `verify:accounting` / `verify:financials` pass while these defects are present.

## Scope and method

- **Code:** all 103 commits and 546 files changed since aec83eb (old main), plus the existing code they touch. Reviewed in five areas: security/IPC, accounting/GST/reports, inventory/operations, imports/backup/data safety, and architecture/governance.
- **Reproduction:** every finding marked REPRODUCED was run against the real services on a throwaway database (`GII_GEM_ERP_DATA_ROOT` set to a temp folder). Nothing touched the repo database or the user's working tree. CODE-TRACED means read in code but not run.
- **Desktop smoke test:** Electron 37 under Xvfb on Linux, using a fresh data folder (details below).
- **My own re-checks:** SEC-1, SEC-2, SEC-4, IO-1 (re-run), A1 (code), and the never-called money backfill (A3/F1, code).
- **Not covered:** Windows-specific behaviour (file locks), real printers, native file dialogs, and posting flows clicked through the UI. Posting was exercised through the services and the IPC handlers instead.

## Counts

| Area | P0 | P1 | P2 | P3 | Notes file |
|---|---|---|---|---|---|
| The 12 known defects (C1 to C12, PR #2 test pack) | – | – | – | – | 20 of 26 tests still fail |
| Security / IPC / Electron | 2 | 3 | 4 | 5 | [security.md](area-notes/security.md) |
| Accounting / GST / reports | 5 | 8 | 6 | 5 | [accounting.md](area-notes/accounting.md) |
| Inventory / operations | 2 | 11 | 11 | 3 | [inventory-ops.md](area-notes/inventory-ops.md) |
| Imports / backup / data safety | 1 | 9 | 12 | 4 | [data-safety.md](area-notes/data-safety.md) |
| Architecture / governance / verify scripts | 0 | 1 | 4 | 8 | [architecture.md](area-notes/architecture.md) |

Two findings appeared in more than one area and are counted once below. The money-column upgrade defect is A3 = F1, and the unguarded reset channels are SEC-2 = F4. After removing them there are **9 new P0s** on top of the known defects.

## P0: must be fixed before any real data goes in

| ID | What happens | Evidence |
|---|---|---|
| SEC-1 | Permission checks use whatever user_id the screen sends. If none is sent, the check falls back to the first admin, so every role acts as admin. The login session is checked on only 9 of 155 channels. | REPRODUCED. main.js:222, authService.js:64-70 |
| SEC-2 | `reset:execute`, `reset:execute-enhanced`, `go-live:execute` and `reset:rollback` have no guard and work before login. Go-live wiped vouchers 7→0 and ledger entries 16→0, and `reset:execute` writes no audit row. Rollback copies a file over the open database, after which the database could not be reopened (`SQLITE_IOERR_SHORT_READ`). | REPRODUCED. main.js:1077-1125 |
| A1 | Reports count only `Posted` vouchers. A reversal marks the original `Reversed` and posts the mirror as `Posted`, so the reversal is counted with nothing to offset it: reversing a 1,000 sale *lowered* Sales by 1,000. Applies to every reversal that doesn't crash (manual, guided, expense, opening, stock). | REPRODUCED. reportBuilders.js:773, accountingService.js:378 |
| A2 | Reversal checks only that today's year is open, so vouchers dated in a Locked year can be reversed. A locked year's P&L moved by 5,000. | REPRODUCED |
| A3 / F1 | Migration 034 adds the paise (`*_minor`) columns with default 0 and never fills them, while reports prefer those columns. A database from old main shows a trial balance of 0/0 instead of 2,786,345.67 and a zero balance sheet. `backfillAll` exists but nothing calls it. | REPRODUCED. moneyMigration.js:46, reportBuilders.js:9 |
| A4 | `approval_queue.is_deleted` was added to migration 022 after it had already shipped, so upgraded databases don't have it and the Accounting workspace fails with "no such column". | REPRODUCED |
| A5 | A purchase is expensed in full and the same goods are also debited to Inventory through the GRN: Purchase +10,000, Inventory +10,000, GRNI −10,000 never cleared. | REPRODUCED |
| IO-1 | "Reverse voucher" on a GRN or COGS voucher reverses the ledger but not the stock (stock 5 → 5, GL Inventory 87,500 → 86,500), then blocks the proper stock reversal. | REPRODUCED (re-run by me) |
| IO-2 | Reversing a purchase leaves its automatic GRN, the stock and the Inventory/GRNI entry in place. | REPRODUCED |

## P1 (selected; the full list is in the area notes)

- **Security**
  - SEC-3: changing the password bypasses and clears the login lockout.
  - SEC-4: forgot-password and admin reset fail with ReferenceError because the handlers are never imported. `lint:syntax` can't catch this.
  - SEC-5: who performed an action is taken from the screen or hard-coded, and `audit:context` lets anyone write fake audit rows before login.
- **Accounting**
  - A6: a Credit Note posts as a sale.
  - A7 and IO-11: TDS on receipts never reaches the ledger.
  - A8: about 0.23% of 18% invoices fail with an "unbalanced" error from rounding.
  - A9: % and fixed expenses can never post, so year-end close is blocked.
  - A10: guided vouchers never update receivables or payables, and supplier bills can never be marked paid.
  - A11: advances can be applied to a different party.
  - A12: a bank voucher proposal can post to another company's account.
  - A13: Draft vouchers can be "reversed".
- **Inventory**
  - IO-3: inward reversals subtract stock value.
  - IO-4 to IO-7: reservations never reduce on issue, overlap between orders, and the dashboard counts cancelled rows.
  - IO-8: back-dated issues are accepted.
  - IO-9: GRNI is debited with no item.
  - IO-10: supplier returns are booked with no supplier.
  - IO-12: an order closes with a ₹1 draft payment.
  - IO-13: opening stock is shared across companies.
- **Data safety**
  - F2: the pre-reset backup misses recent writes (WAL not checkpointed): 5 of 6 recent orders were missing.
  - F3: rollback doesn't actually roll back.
  - F5: reset wipes every company, not just the selected one.
  - F6: imports link records across companies.
  - F7: import rollback leaves orphans.
  - F8: Master Data Tools creates a company with no chart of accounts.
  - F9: "delete unused imported items" also deletes manually created items.
  - F10: the XLSX parser shifts columns, putting a phone number in the GSTIN field.
- **Governance**
  - ARCH-1: `verify:erp` can never pass on a clean clone. The report manifest pins 312 git-ignored files, so the run stops at step 6, before the accounting and financial checks.

## Codex's 7 comments on PR #3: all confirmed

1. The pre-reset backup copies only the .db file in WAL mode (F2).
2. Rollback overwrites the database while the connection is open (F3, SEC-2).
3. `dashboardCounts` lacks vouchers and invoices, so a live database is labelled "Production Ready" (F19).
4. Go-live reads `config.profile`, but the setting is saved as `verificationProfile` (F17).
5. "Production" vs "production" case mismatch, so the wizard can never pass step 1 (F17).
6. The reset IPC is unguarded (SEC-2).
7. The wizard runs the reset at step 3 but checks dependencies only at step 5 (F16).

## Verify scripts

- `lint:syntax` and `build` pass. Main bundle: 2.35 MB, with the size warning raised to 3,000 kB so it doesn't show. `lint:syntax` covers only 10 of the 46 main/preload files.
- `verify:accounting` and `verify:financials` pass, but they check counts and that debits equal credits, not correct amounts. Without `GII_GEM_ERP_DATA_ROOT` set they write to the repo's own `database/` folder. So do `verify-safe-delete` and `verify-fk-constraints`.
- The FSR 2a/2b scripts pass. They test their own fixtures and run the money backfill by hand, which the app never does.
- `verify:erp` treats exit code 1 as a warning, so real failures can still end in "Safe to Lock" (ARCH-2).
- `verify:audit` and `verify:graph-registry` fail on every clean clone (ARCH-1). `verify:alphabetical-options` fails on a stale check (ARCH-12).
- `verify-production-readiness-sql` skips its only database check and still prints PASS.

## Desktop smoke test (Electron)

- **Passed:**
  - Login and the forced password change work. 171 screens opened from the sidebar with 0 crashes, blank screens or console errors.
  - Scroll resets to the top on each screen, and the company panel stays visible.
  - Creating a backup works.
  - Logging out, entering a wrong password ("Invalid username or password"), then logging in again works.
- **Minor issues:**
  - Two breadcrumbs are wrong: Reports > GST & Tax > TDS Reconciliation and GST TDS Reconciliation both show "Dashboard > Operations > …".
  - The login page always shows "admin / admin123", even after the password is changed.
  - The Profit Simulator sidebar item renders blank (ARCH-7). The 2026-08-21 audit already listed this.
  - The assistant's "Related screens" buttons go to keys that don't exist and render blank (ARCH-4).

## What holds up

- **Electron hardening:** contextIsolation and sandbox on, nodeIntegration off, a fixed preload channel list, and a sandboxed print window.
- **Passwords and login:** scrypt hashing with timingSafeEqual, and lockout works on the login path itself.
- **Documents and print:** document uploads check the file signature, and print HTML is escaped.
- **No hidden automation:** the AI and assistant layer makes no network, LLM or IPC calls; its only action is navigation, which meets the product-governance AI boundary.
- **Database upgrades:** all 73 tables match the graph by name. Lifecycle locks and safe-delete checks work as designed.

## Recommended order of work (each step needs your go-ahead; fixes are still on hold)

1. **Phase 17: lock the backend.** Tie every channel to the login session, guard reset, go-live and rollback, and import the missing auth handlers. Without this, no other control means anything.
2. **Phase 18: upgrade safety.** Run the money backfill and add the missing column in a new migration. Back up before migrating, close the connection before restore or rollback, and checkpoint before backup.
3. **Phase 19: reversal integrity.**
   - Fix A1 by counting Reversed originals together with their reversals, or neither. This changes report rules, so it needs your explicit OK under rule 4.
   - Fix the C1 crash, check the voucher's own year (A2), handle stock with its GL entry (IO-1, IO-2), and refuse drafts (A13).
4. **Phase 20: posting correctness.** Known C2 to C12, plus A5 to A12, IO-3 to IO-13, and server-side recomputation of GST in `billing:save`.
5. **Phase 21: imports and company isolation.** F5 to F10 and the company checks in IO-16 and IO-17.
6. **Phase 22: make the gates honest.**
   - Run the PR #2 defect pack in CI.
   - Make `verify:erp` fail on exit code 1 and stop pinning git-ignored files.
   - Have every verify script default to a temp data folder.

PR #3 (phase-16 → main) can be merged as a **baseline snapshot** if you want main to stop being stale, but only labelled Prototype with this report linked, and with no release tag.
