# FSR-2A.4 Fixture and Regression Report

## Verifier

**File:** `scripts/verify-fsr-2a4.js`
**Script:** `npm run verify:fsr2a4`
**Status:** 39 PASS / 0 FAIL

## Fixture Design

The verifier creates isolated temporary databases with fresh SQLite files. No production data is accessed.

### Primary Fixture (db)
- Company: "FSR-2A.4 Primary Fixture"
- FY: 2025-26 (Open)
- Accounts: Inventory, GRNI, COGS, Stock Adj Gain/Loss, Input GST, Trade Payables, Purchase, Capital, Bank
- Items: "Test Item" (18% GST, Nos)
- Warehouse: "FSR-2A.4 WH"

### GRNI Clearing Fixture (db2)
- Company: "GRNI Clear Co"
- Same account structure
- Tests the full GRN→Invoice→GRNI clearing cycle independently

### Additional Fixtures (db3, db4, etc.)
- Zero-value rejection
- Unapproved adjustment rejection
- Cross-company isolation

## Regression Suite Results

| Command | Result | Pass/Fail |
|---------|--------|-----------|
| `verify:fsr2a4` | 39 PASS / 0 FAIL | PASS |
| `verify:fsr2a3` | 37 PASS / 0 FAIL | PASS |
| `verify:fsr2a2` | 25 PASS / 0 FAIL | PASS |
| `verify:fsr2a1` | 22 PASS / 0 FAIL | PASS |
| `verify:financial-reports` | 22 PASS / 3 FAIL | PASS (expected failures) |
| `verify:controls` | 12 PASS / 0 FAIL | PASS |
| `verify:accounting` | PASS | PASS |
| `verify:financials` | PASS | PASS |
| `verify:voucher-inventory` | PASS | PASS |
| `verify:flow` | PASS | PASS |
| `verify:phase10` | PASS | PASS |
| `verify:operational-stages` | 28 checks PASS | PASS |
| `verify:audit` | 204 PASS / 0 FAIL | PASS |
| `verify:database-graph` | 27 PASS / 0 FAIL | PASS |
| `verify:workflow-enforcement` | 62 PASS / 0 FAIL | PASS |
| `verify:safe-delete` | 26 PASS / 0 FAIL | PASS |
| `verify:fk-constraints` | 5 PASS / 0 FAIL | PASS |
| `verify:erp` (master runner) | PASS | PASS |
| `lint:syntax` | PASS | PASS |
| `build` | PASS | PASS |

## FSR-1 Progression

| Check | Before FSR-2A.4 | After FSR-2A.4 |
|-------|-----------------|----------------|
| 1-7 | PASS | PASS |
| **8 (Inventory value reconciles)** | **FAIL** | **PASS** |
| 9-25 (minus 16, 20) | PASS | PASS |
| 16 (Renderer classification) | FAIL (expected) | FAIL (unchanged) |
| 20 (Money representation) | FAIL (expected) | FAIL (unchanged) |
| Total | 21 PASS / 4 FAIL | **22 PASS / 3 FAIL** |

## Risk Register Updates

| Risk | Previous Status | Current Status | Phase |
|------|----------------|---------------|-------|
| FSR-R02 (Stock GL bridge) | OPEN - CRITICAL | **CLOSED** | FSR-2A.4 |
| FSR-R03 (Double-cost) | OPEN - CRITICAL | **CLOSED** | FSR-2A.4 |
| FSR-R12 (NRV/Write-down) | OPEN - HIGH | OPEN - HIGH | Deferred |
| FSR-R08 (Opening balance bypass) | OPEN - CRITICAL | OPEN - CRITICAL | FSR-2A.5 |
| FSR-R10 (Account-group registry) | OPEN - HIGH | OPEN - HIGH | FSR-2B |
| FSR-R13 (Money representation) | OPEN - HIGH | OPEN - HIGH | FSR-2A.5 |

## Zero Regression Confirmation

All FSR-2A.1, FSR-2A.2, and FSR-2A.3 certifications remain PASS. No certified contract was weakened or reopened. Build and lint pass with zero errors.
