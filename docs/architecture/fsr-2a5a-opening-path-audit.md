# FSR-2A.5A — Opening Balance Path Audit

## Authority Chain Map

Every code path that can introduce an opening financial balance.

---

### 1. Direct `accounts.opening_balance` Write Paths (FSR-R08)

| # | Path | File | Line | Severity | Status |
|---|------|------|------|----------|--------|
| 1.1 | `createLedgerAccount` — inserts user-supplied `opening_balance` directly into `accounts` table | `src/main/services/accountingService.js` | 87–95 | **CRITICAL** | BLOCKED v1 |
| 1.2 | `browserFallbackApi.createLedgerAccount` — same bypass in Electron-less fallback | `src/renderer/api/browserFallbackApi.js` | 866 | **CRITICAL** | BLOCKED v1 |
| 1.3 | `seedAccounts` — DEFAULT_ACCOUNTS all use `opening_balance: 0` | `src/main/database/init.js` | 728–738 | SAFE | No action |
| 1.4 | Generic `createRecord`/`updateRecord` IPC — blocked by `WRITE_POLICY.accountingReadOnly` | `src/main/database/crudHelpers.js` | 39–46 | SAFE | No action |

### 2. Governed Opening Balance Write Paths (Correct)

| # | Path | File | Line | Balancing | Voucher | Status |
|---|------|------|------|-----------|---------|--------|
| 2.1 | `createOpeningBalance` | `src/main/services/accountingService.js` | 866–908 | `createBalancedVoucher` + `opening_balances` insert | Journal | GOV |
| 2.2 | `createPartyOpeningBalance` | `src/main/services/accountingService.js` | 794–820 | `createBalancedVoucher` + `opening_balances` insert | Journal | GOV |

### 3. IPC / Preload Channels

| # | Channel | Preload Name | main.js Handler | Guard Scope | Status |
|---|---------|-------------|-----------------|-------------|--------|
| 3.1 | `accounts:create-quick` | `createLedgerAccount` | line 789 | `create`, `accounts` | GOV (zero-forced) |
| 3.2 | `opening-balances:create` | `createOpeningBalance` | line 650 | `opening_balance`, `opening_balances` | GOV |
| 3.3 | `party-opening:create` | `createPartyOpeningBalance` | line 640 | `opening_balance`, `party_opening_balances` | GOV |

### 4. Renderer UI Paths

| # | Component | File | Field | Status |
|---|-----------|------|-------|--------|
| 4.1 | `QuickCreateMasterDialog` — ledger_account | `src/renderer/components/overlays/QuickCreateMasterDialog.jsx` | `opening_balance` (field + payload) | REMOVED v1 |
| 4.2 | `viewDefinitions.js` | `src/renderer/config/viewDefinitions.js` line 119 | `["opening_balance", "Opening Balance", "number"]` | DISPLAY ONLY |
| 4.3 | `accountingTableConfig.js` — general_ledger | `src/renderer/features/accounting/accountingTableConfig.js` line 29 | `{ key: "opening_balance", label: "Opening", type: "money" }` | DISPLAY ONLY |
| 4.4 | `AllocationWorkflowScreen` — party_opening_balances | `src/renderer/features/accounting/AllocationWorkflowScreen.jsx` line 332 | Party opening balance form | GOV (via createPartyOpeningBalance) |

### 5. Import / Migration Paths

| # | Path | File | Line | Table | Risk | Status |
|---|------|------|------|-------|------|--------|
| 5.1 | `importValidationService` — banks import | `src/main/services/importValidationService.js` | 230 | `banks` | LOW — separate `banks.opening_balance` field | EXEMPT |
| 5.2 | `tallyImportService` — sets `opening_balance: 0` | `src/main/services/tallyImportService.js` | 203 | `accounts` | SAFE | No action |
| 5.3 | `tallyImportService` — `opening_balance_reference` | `src/main/services/tallyImportService.js` | 324 | reference only | SAFE | No action |
| 5.4 | `importTemplates.js` — defines columns | `src/renderer/config/importTemplates.js` | 9, 83, 117, 138, 149 | templates | NONE — template column definitions only | No action |
| 5.5 | `fileParsers.js` — validates opening_balance during import | `src/renderer/utils/fileParsers.js` | 329–333 | import parser | NONE — validation only | No action |

### 6. Report / Display Consumption

| # | Report | File | Line | How opening_balance is used | Status |
|---|--------|------|------|---------------------------|--------|
| 6.1 | `trialBalance` | `src/main/database/reportBuilders.js` | 763–793 | Fallback when no carry_forward_entries exist | ACCEPTABLE |
| 6.2 | `balanceSheetReport` | `src/main/database/reportBuilders.js` | 829–861 | Same fallback pattern | ACCEPTABLE |
| 6.3 | `openingBalanceReport` | `src/main/database/reportBuilders.js` | 600–610 | Reads from `opening_balances` table only | CORRECT |
| 6.4 | `partyLedgerReport` | `src/main/database/reportBuilders.js` | 149–203 | Uses `0 opening_balance` literal | CORRECT |

### 7. Auth Permissions

| # | Role | Permission | File | Line | Status |
|---|------|-----------|------|------|--------|
| 7.1 | admin | `opening_balance` | `src/main/services/authService.js` | 7 | GOV |
| 7.2 | accountant | `opening_balance` | `src/main/services/authService.js` | 8 | GOV |

---

## FSR-R08 Resolution

**Risk**: Direct ledger opening balances can bypass double entry.

**Fix**: `createLedgerAccount` now forces `opening_balance = 0`. All non-zero opening balances must use the governed `createOpeningBalance` or `createPartyOpeningBalance` services, which create balanced journal vouchers.

**Existing data**: Preserved — no migration of existing `accounts.opening_balance` values.

**Verification**: `scripts/verify-fsr-2a5a.js` check group A.

---

## Areas Mapped

| Area | Scope | Status |
|------|-------|--------|
| Area 1 | Path audit (this document) | COMPLETE |
| Area 2 | Block direct non-zero in `createLedgerAccount` | COMPLETE |
| Area 3 | Block direct non-zero in `browserFallbackApi` | COMPLETE |
| Area 4 | Remove misleading `opening_balance` field from QuickCreateMasterDialog | COMPLETE |
| Area 5–23 | Future FSR-2A.5 sub-areas | DEFERRED |
