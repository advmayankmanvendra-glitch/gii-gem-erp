# In-house audits, October to November 2026

This folder holds the audit reports written while the ERP was being fixed and automated (PR #1, PR #4). They are preserved here so the findings, the evidence and the fixes can still be traced after the working copies are gone.

The reports are history. They describe the code at the commit named in each file name, not the current code. The current state is in the latest report of each kind and in the code itself.

| Folder or file | What it is |
|---|---|
| `repo-audit-2026-10-07.md`, `thorough-audit-2026-10-07.md` | First repository and accounting audits. Verdict: prototype, not safe for real books; eight-phase fix plan. |
| `full-audit-acf6d02-2026-10-14/` | Full audit of commit acf6d02, with area notes. |
| `acf6d02-verification/` | Verification of the critical defects at acf6d02. |
| `2026-10-17-erp-automation/` | Audits and phase report for the automation branch (PR #4). |
| `2026-10-22-pr4-inhouse/` | The three audits (correctness, security, architecture) run on each PR #4 push, named `audit-<commit>-<kind>.md`. |
| `tally-style-checks-2026-10-29.md` | Tally-style risk checks: paise money, keyboard-first entry, double entry that cannot break. |

`manifest.json` records each report's size and SHA-256. `npm run verify:audit` checks that every listed report is present and unchanged. A report is never edited after it is added; a new audit is added as a new file and the manifest is regenerated.
