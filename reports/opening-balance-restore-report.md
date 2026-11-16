# Opening balances after a company reset (16 Nov 2026 IST)

## Owner's decision (rule 4)
On 16 Nov 2026 (11:06 IST) the owner answered the opening-balance question: "Opening balances could be entered by hand where we do not have any backup, for when there is an available back-up we should enable it through that very back-up restore route." The company reset (PR #6) therefore keeps clearing posted opening balances, and they come back one of two ways:

- **From a backup:** Accounting > Opening Balances, or the screen shown right after a reset, has *Bring back opening balances*. It reads the chosen backup and posts each opening again.
- **By hand:** Add Opening (accounts) and Party Opening Balances, unchanged.

## How the restore posts
- `src/main/services/openingBalanceRestoreService.js` takes the chosen backup only if it is a regular `.db` file really inside the backups folder (no symbolic or hard links), at most 1 GB. It copies the file once, through one handle, into a private temporary file while hashing it (SHA-256), and reads only that copy, so the fingerprint covers exactly what is read. Before reading any data it refuses views, virtual tables, expression indexes and computed columns, turns `trusted_schema` off and runs `quick_check`. Text read from the backup is capped, and a remark over 500 characters blocks.
- The company must match by number and name, and must have no opening balances yet, so nothing is entered twice.
- Amounts come from the paise columns (rupee columns only for backups older than the paise columns) and must equal the opening voucher's own line in the backup. The voucher's other side must be the account today's rule would use (Capital, or Opening Balance Suspense for parties), otherwise the restore blocks rather than silently moving it.
- Each opening is re-posted through `createOpeningBalance` / `createPartyOpeningBalance`, the same functions as hand entry. So each one gets a new posted Journal voucher, dated as before. The counter-account follows today's rule (Capital for account openings, Opening Balance Suspense for party openings). Account openings get the standard narration; party openings keep the backup's remark as narration.
- Openings whose voucher was reversed or deleted in the backup are skipped. Anything else that cannot be restored exactly blocks the whole restore and is listed with the fix: closed year, missing or renamed account, party not the same by type and name, unknown party type, amount mismatch.
- *Check backup* posts everything inside a transaction and rolls it back, so "ready" means the restore will go through.
- *Restore* asks for confirmation (company, backup, count, totals; opening vouchers cannot be reversed, so the undo is the safety backup). The caller must send what the check showed; it refuses if the backup's SHA-256, the count or the totals changed since the check. It then takes a `pre_opening_restore_*` safety backup and posts all openings in one transaction with one `opening_balances_restored` audit row. That row holds the backup name and SHA-256, the safety backup and the new ids.
- Both IPC channels (`opening-balances:restore-preview`, `opening-balances:restore`) need `restore_backup`, so only admins can use them, the same as Rollback from Backup.

This differs from **Rollback from Backup**, which replaces the whole database (every company) and needs a restart.

## Checks
- `scripts/audit/opening-restore.test.mjs`: 19 tests, covering the restore after a reset, the duplicate refusal, closed years, reversed openings, the backups-folder-only rule, company match, hand entry with no backup, the dry run, paise as source of truth, party matching, crafted backups, a backup changed after the check, and empty remarks.
- Real Electron app on a database copy (16 Nov, 11:12 IST): a reset cleared 97 rows; 2 openings (₹5,000.25 Dr cash, ₹1,200.50 Cr supplier) were restored with matching vouchers; a second restore was refused; integrity and FK checks were clean; the ledger stayed balanced; the panel fits a 390 px phone width.
- In-house audits on 847103d (correctness, security, architecture) are in `audits/2026-11-10-reset-update/` in the project files. Their findings are fixed in af330ab; the re-audits on af330ab (also in that folder) are fixed in the next commit (admin-only panel, required check values, private hashed copy, schema screening, text caps, contra check, always-reported success).
