# EIL Production Certification Addendum — BRAIN-4.1

Date: 2026-07-15  
Scope: Ask ERP Brain live query relevance hotfix  
Parent certification: Enterprise Intelligence Layer production certification

## Addendum Purpose

This addendum records a corrective hotfix after manual Electron testing found live query relevance defects in the read-only Ask ERP Brain assistant.

## Certification Impact

Enterprise Intelligence Layer certification remains valid with this addendum.

The hotfix is limited to:
- query classification
- unsafe action typo tolerance
- category-specific source selection
- source relevance guarding
- source-backed fallback handling
- regression verification

The hotfix does not introduce:
- LLM SDKs
- network calls
- database drivers inside assistant modules
- IPC write channels
- mutation UI buttons
- live-record inspection
- action-taking assistant behavior
- accounting, inventory, GST, voucher, report SQL, or posting logic changes

## Corrected Live Failures

| Live query | Certification addendum result |
| --- | --- |
| `post this vocuher` | Correctly refused as unsafe action with `action-refused`. |
| `how many type of reports are there` | Correctly handled as report guidance with source-backed report references. |
| `what is voucher dashboard for` | Correctly handled as voucher dashboard/business voucher guidance with `accounting-sensitive` boundary. |

## Verification Evidence

The following commands passed on 2026-07-15:

- `npm.cmd run lint:syntax`
- `npm.cmd run build`
- `npm.cmd run verify:read-only-assistant`
- `npm.cmd run verify:erp-brain`
- `npm.cmd run verify:help-assistant-brain`
- `npm.cmd run verify:audit`
- `npm.cmd run verify:erp`
- `npm.cmd run verify:accounting`
- `npm.cmd run verify:financials`
- `npm.cmd run verify:controls`
- `npm.cmd run verify:voucher-inventory`
- `npm.cmd run verify:flow`
- `npm.cmd run verify:phase10`
- `node scripts/test-read-only-erp-assistant-internal.js`

## Boundary Confirmation

Read-only guidance boundary: Preserved  
Unsafe action refusal boundary: Preserved and strengthened  
Navigation/location guidance: Preserved  
Source-backed answer requirement: Strengthened  
No unrelated high-confidence fallback: Strengthened  

## Release Gate Decision

Decision: PASS WITH HUMAN VISUAL CHECK PENDING

The automated certification addendum is safe to commit after review. Release-candidate packaging should still wait for the planned human Electron visual click-through.
