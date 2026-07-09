# Tally TDL Reference Notes

## Overview

TDL (Tally Definition Language) is Tally's proprietary scripting language used to define custom forms, reports, menus, and business logic. It compiles from `.tld` (source) to `.tcp` (compiled) files. This project has **no TDL source files**; only compiled `.tcp` and `.dll` files are present.

## TDL Files Found in This Installation

### In `C:\Program Files\TallyPrime\tdl\`

| File | Size | Status |
|------|------|--------|
| `ACME_SelectedLineTotal.tcp` | Compiled | No source `.tld` available |
| `support desk.tcp` | Compiled | No source `.tld` available |

### In `C:\Program Files\TallyPrime\appresources\plugins\TallyCapital\`

| File | Size | Description |
|------|------|-------------|
| `lendingplugin.tcp` | Compiled | Lending module UI/reports |
| `lendingplugin6.tcp` | Compiled | Alternate version of lending TDL |

## TDL Basics

### Language Characteristics

- **Proprietary**: No publicly available standalone compiler; compiled by TallyPrime itself
- **Interpreted at runtime**: `.tcp` files are loaded and executed by `tally.exe`
- **Event-driven**: Responds to Tally UI events (form open, key press, refresh, report generation)
- **Declarative**: Defines forms, reports, and their attributes rather than imperative logic

### Key TDL Concepts

| Concept | Description |
|---------|-------------|
| **Form** | Defines a screen/form layout with fields and controls |
| **Report** | Defines a report output with columns, filters, grouping |
| **Part** | A section within a form or report (header, body, footer) |
| **Line** | A single row or field definition within a Part |
| **Field** | A data entry or display field |
| **System** | Provides access to Tally functions and data (e.g., `##SVCurrentCompany`) |
| **Function** | Reusable TDL logic with parameters |
| **Variable** | Memory variables for temporary data |
| **Collection** | Data set definitions (SQL-like queries over Tally data) |
| **Attribute** | Properties attached to Form/Report/Part (e.g., `Width`, `Height`, `Color`) |
| **Action** | Triggers and event handlers |

### Loading TDL Files

From `tally.ini`:
```ini
User TDL=Yes
```

When `User TDL=Yes`, Tally loads all `.tcp` and `.tld` files from the `tdl/` directory automatically at startup. TDL files in `appresources/plugins/` are loaded by the capsule system.

## What TDL Can Do

### Custom Reports
- Financial reports (P&L variations, ratio analysis)
- Inventory reports (stock aging, reorder levels)
- GST returns (GSTR-1, GSTR-3B custom formats)

### Custom Forms
- Modified invoice layouts
- Custom master entry screens
- User-defined input forms

### Business Logic
- Validation rules on data entry
- Auto-calculations (the `ACME_SelectedLineTotal.tcp` likely adds line total features)
- Workflow approvals
- Automated voucher generation

### Integrations
- HTTP API calls from TDL (using `SYNC` TDL functions)
- File export/import with custom formatting
- Email integration

## Limitations for Migration

### Critical Gap
Since only compiled `.tcp` files exist (no `.tld` source):

1. **Cannot reverse-engineer** the original TDL logic
2. **Custom business rules** implemented in TDL are opaque
3. **Form customization** (e.g., modified invoice screens) cannot be replicated
4. **Validation logic** applied during data entry is unknown

### TDL Features That Will Not Migrate

| TDL Feature | Migration Impact |
|-------------|-----------------|
| Custom validation rules | GII ERP must re-implement these from requirements |
| Computed fields (e.g., line totals) | Must be re-implemented in ERP logic |
| Custom report layouts | Only standard Tally reports available as reference |
| Auto-numbering overrides | Need to check base VOUCHERTYPE numbering |
| Integration with external apps | Must identify and replicate via ERP APIs |
| UI layout changes | Irrelevant for data-only migration |

## TDL Reference (for Future Restoration)

### Basic TDL Syntax (conceptual)

```
[Form: MyCustomForm]
   Part: MyFormPart
   Width: 400
   Height: 300

[Part: MyFormPart]
   Line: MyFieldLine
      Field: MyField
      Width: 200

[Field: MyField]
   Data: Name
   Storage: MyCollection
```

### System Variables

| Variable | Purpose |
|----------|---------|
| `##SVCurrentCompany` | Current company name |
| `##SVFromDate` | Report from date |
| `##SVToDate` | Report to date |
| `##SVVoucherType` | Current voucher type |
| `##SVVoucherNumber` | Current voucher number |

### Collections

```
[Collection: MyStockItems]
   Type: StockItem
   Fetch: Name, BaseUnits, AvgRate
   Filter: AvgRate > 0
```

### Functions

```
[Function: CalculateTotal]
   LineTotal: $$LineQty * $$LineRate
   Return: $$LineTotal
```

## Recommendations

1. **Identify functionality**: Interview users about what the custom TDL files (ACME SelectedLineTotal, Support Desk, TallyCapital lending) actually do
2. **Re-implement in GII ERP**: Each identified TDL feature should be a user story in the ERP migration
3. **Document standard behaviors**: The base Tally behavior (without custom TDL) is well-documented in the XML exports; use that as the authoritative source
4. **Consider TDL analysis tools**: No tools exist to decompile `.tcp` to `.tld` — the logic is effectively lost without source
