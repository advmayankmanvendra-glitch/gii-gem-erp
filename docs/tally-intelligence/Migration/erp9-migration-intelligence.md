# ERP9 Migration Intelligence

**Phase J — Tally Intelligence Layer**

---

## 1. Introduction

Migration intelligence is the systematic understanding of how data, configurations, and customisations move between Tally versions and ultimately into GII ERP. The journey spans three platforms: Tally.ERP 9 (legacy), TallyPrime (intermediate), and GII ERP (target).

Without migration intelligence, data loss, structural mismatches, and compliance gaps go undetected. This document captures the known migration paths, structural differences, risk areas, and recommendations derived from hands-on extraction of 1,617 entities from TallyPrime and analysis of the ERP9 capsule ecosystem.

The ultimate goal is a zero-data-loss migration where every ledger, voucher, stock item, and GST configuration lands correctly in GII ERP with full audit trail.

---

## 2. ERP9 → TallyPrime Migration Path

### 2.1 Data Upgrade

TallyPrime can read and upgrade ERP9 data files (.dat, .900) directly. When opening an ERP9 data directory, TallyPrime detects the older format and runs an in-place upgrade. The conversion is one-way — once upgraded, the data cannot be reopened in ERP9.

Key considerations:
- Upgrade preserves all masters, transactions, and bill-wise details
- Company data folder structure changes slightly (additional `.tcp` caches)
- Large datasets (>5 years) may see lengthy upgrade times
- Backup the original ERP9 data folder before upgrade

### 2.2 TDL Customisation Migration

ERP9 customisations ship as `.cap` capsules (compiled TDL). TallyPrime uses `.tcp` compiled files. The formats are not interchangeable.

| Aspect | ERP9 (.cap) | TallyPrime (.tcp) |
|---|---|---|
| Format | Legacy capsule | New compiled format |
| Recompilation | Not needed | Required from .tdl source |
| Feature access | Limited to ERP9 API | Access to Prime-only APIs |
| Side effects | Modifies report engine | Sandboxed better |

TDL source code (.tdl) must be recompiled against TallyPrime's compiler to produce `.tcp` files. Many ERP9-era TDL functions (e.g., `GWARNING`, old-style dialogs) are deprecated.

### 2.3 Feature Gaps

Features available in TallyPrime but not in ERP9:

- **E-Invoicing**: Built-in IRN generation, QR code printing, Invoice Reference Number (IRN) tracking
- **E-Way Bill**: Part A/B generation, EWB number tracking, multi-vehicle updates
- **GST Returns**: Simplified GSTR-1/GSTR-3B filing workflows
- **Multi-company Dashboard**: Consolidated views across companies
- **Enhanced Security**: Role-based user access, audit logs
- **Improved UI**: Modernised voucher entry screens, better keyboard navigation

ERP9 customisations that worked around these gaps (e.g., third-party e-way bill plugins) should be retired in favour of Prime's native support.

### 2.4 Configuration Migration

Tally.ERP 9 configuration lives in `tally.ini` (installation directory) and the company data folder. TallyPrime restructures this:

| Setting | ERP9 Location | TallyPrime Location |
|---|---|---|
| General settings | `tally.ini` | `TallyPrime.ini` + Registry |
| Company paths | `tally.ini` | `Advanced Configuration → Data Paths` |
| ODBC settings | `tally.ini` | `TallyPrime.ini` |
| Print/email | `tally.ini` | In-app configuration |
| License info | Registry | Registry (separate key) |

Migrate by reviewing each `tally.ini` section and applying the equivalent in TallyPrime's configuration UI or `TallyPrime.ini`.

### 2.5 ODBC / Integration

ODBC connectivity is backward compatible. Both ERP9 and TallyPrime expose data over port 9000 via the Tally ODBC driver. Integration scripts targeting `localhost:9000` continue to work without modification.

However, TallyPrime's ODBC layer has minor differences:
- Additional system tables for Prime-specific features (e-invoice states, etc.)
- Some ERP9-era metadata fields are deprecated
- Query performance is improved; consider revisiting slow queries

### 2.6 Third-Party Add-on Migration

Third-party capsules (`.cap`) must be recompiled to `.tcp`. Not all vendors provide TallyPrime-compatible versions. Steps:

1. Inventory all installed `.cap` files in the ERP9 `capsules/` directory
2. Check vendor websites for Prime-compatible versions
3. For in-house TDL, obtain `.tdl` source and recompile with `TDLCompiler.exe`
4. Test each add-on in a sandbox TallyPrime environment
5. Replace with GII ERP features where possible (the preferred path)

---

## 3. Tally → GII ERP Migration Path

### 3.1 Data Extraction

Tally's XML export (via `Export → XML` or ODBC) is the primary extraction mechanism. The format is:

- **Encoding**: UTF-16 LE (Tally's native encoding)
- **Format**: Attribute-based XML (not element-based)
- **Structure**: Flat tags with `NAME`, `PARENT`, `OPENINGBALANCE`, etc.
- **Export scope**: Masters, Vouchers, Balance Sheet, Trial Balance, Stock Summary

All extraction for GII ERP was performed via ODBC query on port 9000, yielding 1,617 entities from the GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED company.

### 3.2 Master Data Migration

| Tally Entity | GII ERP Entity | Mapping Notes |
|---|---|---|
| Groups | GII Groups | Predefined groups (Sundry Debtors, Sundry Creditors, etc.) map 1:1. Custom groups (30+45 GEM parties) need flattening or new hierarchies. |
| Ledgers | GII Ledgers | Ledger name, opening balance, group parent, GSTIN, address all mapped. 102 party ledgers need deduplication. |
| Stock Groups | GII Categories | Stock group hierarchy preserved |
| Stock Items | GII Products | Name, unit, rate, HSN code, GST rate mapped |
| Units | GII Units | Simple and compound units converted |
| Godowns | GII Warehouses | Godown hierarchy to warehouse locations |
| Cost Centres | GII Cost Centres | Category + centre mapped |
| Voucher Types | GII Transaction Types | VCHTYPE mapping (see 3.3) |

### 3.3 Transaction Migration

Vouchers use a `VCHTYPE` field that maps to GII transaction types:

| Tally VCHTYPE | GII Transaction Type |
|---|---|
| Sales | sales_invoice |
| Purchase | purchase_invoice |
| Receipt | payment_received |
| Payment | payment_made |
| Contra | bank_transfer |
| Journal | journal_entry |
| Credit Note | credit_note |
| Debit Note | debit_note |
| Stock Transfer | stock_transfer |
| Stock Journal | stock_adjustment |

Each voucher contains:
- **Header**: Date, reference number, narration, voucher number
- **Ledger entries**: Debit/credit lines with amounts, bill-wise allocations
- **Inventory entries**: Stock items, quantities, rates, godown
- **Tax entries**: GST and TDS breakdowns (auto-split entries)
- **Bill-wise details**: Reference to outstanding management

### 3.4 Opening Balances

Opening balances are extracted from Balance Sheet or Trial Balance XML exports. Strategy:

1. Export Trial Balance as at migration date
2. Map each opening balance to its GII ERP ledger
3. For grouped ledgers, compute net group balance as a balancing entry
4. Verify total assets = total liabilities + equity

For GII ERP, opening balances are set as the first-period opening balance entry, dated one day before the first transaction date.

### 3.5 Outstanding Management

Tally's bill-wise details track outstanding against invoices and payments. Each bill-wise entry has:
- **Bill type**: New Ref, Against Ref, Adjustment, Advance, On Account
- **Reference**: Bill name/number
- **Date**: Bill date
- **Amount**: Total and pending

Migration approach:
1. Extract all outstanding bills from Sundry Debtors and Sundry Creditors
2. Map to GII ERP's outstanding tracking (invoice-level ageing)
3. Set opening outstanding as on migration date
4. Future payments/deposits will reference these opening bills

### 3.6 GST Configuration

GST setup requires careful extraction:

| GST Element | Tally Source | GII ERP Target |
|---|---|---|
| Tax registration (GSTIN) | Company GSTIN, ledgers with GSTIN | GII company tax registration |
| GST rates | Stock items with rate %, ledgers with tax % | Product tax rates |
| HSN/SAC codes | Stock items (HSN), ledgers (SAC) | Product/service classification |
| Place of supply | Transaction-level from shipping/party address | Transaction location |
| E-way bill tracking | Not in ERP9; manual in Prime | GII e-way bill module |

All 1,617 extracted entities include GSTIN, HSN codes, and tax rates where applicable.

### 3.7 Report Migration

Tally's report hierarchy maps to GII dashboards:

| Tally Report | GII Dashboard / Report |
|---|---|
| Balance Sheet | Financial Reports → Balance Sheet |
| Profit & Loss A/c | Financial Reports → P&L Statement |
| Trial Balance | Financial Reports → Trial Balance |
| Ledger | Account → Ledger View |
| Group Summary | Reports → Group Summary |
| Stock Summary | Inventory → Stock Report |
| GST Returns | Compliance → GST Reports |
| Outstanding Report | Receivables → Ageing Report |
| Day Book | Transactions → Day Book |

GII ERP supports drill-down from summary to transaction level, matching Tally's interactivity.

---

## 4. Known Challenges

### 4.1 Flexible Ledger Naming vs Structured Schema

Tally permits free-form ledger names with spaces, special characters, and inconsistent casing. GII ERP expects structured, relationship-aware naming. Ledgers like `M/S GESTURE INDIA INFRASTRUCTURE PVT LTD` may appear with slight variations across different ledgers.

### 4.2 Custom Groups (30+45 GEM Parties)

The GEM Parties group structure contains 30 sub-groups for one category and 45 for another. These do not correspond to standard accounting groups and require:
- Analysis of each group's purpose
- Reclassification into GII's group hierarchy
- Possible flattening into attributes/tags

### 4.3 Party Ledger Deduplication

102 party ledgers exist in the extracted data. Many may represent the same underlying party with slightly different names. Deduplication requires:
- Fuzzy name matching
- GSTIN-based matching (primary key)
- Address and contact matching as secondary signals
- Manual review for edge cases

### 4.4 Multiple Ledgers for Same Party

A single party may have multiple ledgers (e.g., GESTURE INDIA — Sales, GESTURE INDIA — Receivables). In GII ERP, a party should have one ledger. Solution:
- Consolidate into single party record
- Use sub-ledger or tags for distinction
- Verify transaction re-mapping

### 4.5 Inventory Valuation Method Differences

Tally supports Average Cost, FIFO, LIFO, and Standard Cost. GII ERP must match the method used historically to avoid valuation discrepancies. Average Cost is the most common in Indian SMBs.

### 4.6 Rounding Differences

Tally rounds to 2 decimal places internally but may display differently. GII ERP must apply consistent rounding:
- Transaction level: Round to currency precision (usually 2)
- Report level: Same rounding as Tally for comparable totals
- GST calculation: Round per-tax-line as per GST rules

### 4.7 Date Format Handling

Tally exports dates as `YYYYMMDD` in XML (e.g., `20250331`). GII ERP must parse these correctly across all locales. The 1,617 extracted entities span dates from 2022 to 2026.

### 4.8 UTF-16 LE Encoding Handling

All Tally XML exports are UTF-16 LE encoded. Parsing pipelines must:
- Detect encoding from BOM (`0xFF 0xFE`)
- Convert to UTF-8 for processing
- Handle non-BMP characters if present
- Test with files containing special characters (₹, é, etc.)

---

## 5. Migration Readiness Assessment

### 5.1 Mapping Coverage

The GII extraction pipeline processed 1,617 entities from TallyPrime (GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED). Mapping coverage achieved:

| Entity Type | Extracted | Mapped | Coverage |
|---|---|---|---|
| All entities | 1,617 | 1,604 | 99.2% |
| Unmapped | — | 13 | 0.8% |

### 5.2 Unmapped Entities (13 Items)

The 0.8% unmapped entities (13 items) fall into these categories:

| Category | Count | Handling |
|---|---|---|
| Custom groups without direct GII equivalent | 5 | Create GII groups or flatten to tags |
| Ledgers with inconsistent naming | 4 | Manual review and remap |
| Voucher types not in standard map | 2 | Extend VCHTYPE mapping table |
| Stock items with missing HSN | 2 | Flag for manual data entry |

### 5.3 Risk Assessment

| Risk Level | Area | Details |
|---|---|---|
| **Low** | Masters | Groups, ledgers, stock items are deterministic; 99.2% mapped. Low risk of data loss. |
| **Medium** | Transactions | Voucher mapping is well-understood but volume increases chance of edge cases. Bill-wise allocation adds complexity. |
| **High** | GST Compliance | Incorrect GSTIN mapping, rate mismatches, or HSN inconsistencies can cause non-compliance, penalties, and filing errors. Requires thorough validation. |

---

## 6. Recommendations

### 6.1 Migration Order

**Phase 1 — Masters** (Low risk)
1. Groups and ledgers (with deduplication)
2. Stock groups, stock items, units
3. Godowns and cost centres
4. GST configuration (GSTIN, HSN, rates)

**Phase 2 — Transactions** (Medium risk)
5. Opening balances (from Trial Balance)
6. Outstanding bills (bill-wise opening)
7. Vouchers in date order (oldest first)
8. Verify trial balance post-migration

**Phase 3 — Reports and Compliance** (High risk)
9. GST return reconciliation
10. Balance Sheet and P&L comparison
11. Ageing report validation
12. Drill-down testing from summary to transaction

### 6.2 Validation Approach

For each phase:

- **Count validation**: Number of entities in Tally vs GII (masters)
- **Sum validation**: Total debit = total credit per period (transactions)
- **Group balance validation**: Group-wise totals match Tally's Group Summary
- **GST validation**: GST output/input totals match GSTR-3B figures
- **Outstanding validation**: Ageing totals match Tally's Outstanding Report

Automated comparison scripts should be run after each migration phase.

### 6.3 Parallel Run Strategy

1. Continue using TallyPrime for day-to-day operations during migration
2. Migrate historical data (up to migration date) to GII ERP
3. Run GII ERP in parallel for read-only reporting for 2-4 weeks
4. Compare daily/weekly totals between systems
5. When differences are zero for 2 consecutive weeks, switch to GII ERP live
6. Keep TallyPrime available for 3 months as fallback

### 6.4 Rollback Plan

If critical issues are found post-migration:

1. **Master rollback**: Revert GII master tables from pre-migration backup (fast, low cost)
2. **Transaction rollback**: Re-run extraction with corrected mapping (medium cost)
3. **Full rollback**: Suspend GII ERP operations, revert to TallyPrime exclusively (high cost)

Rollback triggers:
- GST filing fails or shows incorrect liability
- Trial Balance mismatch > 0.1% of total assets
- Critical master (e.g., party cannot be invoiced) missing
- Outstanding ageing differs by > 5%

Maintain version-controlled snapshots of each migration phase to enable point-in-time recovery.
