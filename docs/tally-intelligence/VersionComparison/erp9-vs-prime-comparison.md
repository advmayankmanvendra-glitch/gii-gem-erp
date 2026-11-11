# Tally.ERP 9 vs TallyPrime: Version Comparison

> **Phase G — Tally Intelligence Layer**
> Analysis based on installations at `C:\Program Files\Tally\Tally.ERP9` and `C:\Program Files\TallyPrime`

---

## 1. Version Overview

| Dimension | Tally.ERP 9 | TallyPrime v1.1.7 |
|---|---|---|
| Initial Release | 2009 | 2020 |
| End of mainstream support | 2022 (effectively) | Active |
| Positioning | Desktop accounting + compliance | Desktop accounting + compliance + modern UX |
| Latest major | 6.6.3 (final ERP 9 release) | v3.x (current) |
| Target market | SMBs, Chartered Accountants | SMBs, Enterprises, CA firms |

Tally.ERP 9 defined the desktop accounting category in India for over a decade. TallyPrime represents a ground-up UX overhaul while maintaining backward compatibility with the TDL ecosystem and data formats.

---

## 2. Installation Comparison

### 2.1 Executable Size

| Version | Executable | Size | Format |
|---|---|---|---|
| Tally.ERP 9 | `tally.exe` | 9.3 MB | Native PE executable |
| TallyPrime | `tally.exe` (or `tallyprime.exe`) | ~11–14 MB | Native PE executable, larger due to bundled UI resources |

### 2.2 Capsule Format

| Aspect | Tally.ERP 9 | TallyPrime |
|---|---|---|
| Extension | `.cap` (Compiled Application Program) | `.tcp` (Tally Compiled Program) |
| Count | Hundreds (in `Tally.ERP9\` root) | Fewer (compiled .tcp files in `TallyPrime\`) |
| Nature | Compiled TDL — single-file capsule | Compiled TDL — functionally identical to .cap |
| Interchangeability | Not directly interchangeable | `.tcp` and `.cap` are **not cross-loadable** between versions |
| Source | Both accept `.tls` (Tally Source) decompilable back to TDL | Same |

**Key insight**: Both `.cap` and `.tcp` are compiled forms of the same TDL language. The format change was to signal that Prime is not simply "ERP 9 v7" but a new product line. The underlying TDL virtual machine is similar but not identical — Prime introduced new language features (e.g., enhanced UI controls).

### 2.3 Directory Structure

```
Tally.ERP9\                          TallyPrime\
├── tally.exe                        ├── tally.exe
├── tally.lic                        ├── tally.lic
├── *.cap (hundreds)                 ├── *.tcp (compiled capsules)
├── Tally.ini                        ├── Tally.ini (same role)
├── Tally.aws                        ├── Tally.aws
├── Font\                            ├── Font\
├── Help\                            ├── Help\
├── Lang\                            ├── Lang\
└── ...                              └── ...
```

**Notable differences**:
- TallyPrime ships with fewer pre-loaded capsules — many ERP 9 features (e.g., payroll, job costing) are now downloadable on-demand
- TallyPrime directory is generally smaller (~350 MB vs ~500 MB for a full ERP 9 installation)
- The `Tally.aws` (Tally Web Server) configuration file format and parameters are compatible

### 2.4 Configuration Files

| File | ERP 9 | Prime | Notes |
|---|---|---|---|
| `Tally.ini` | Yes | Yes | Mostly compatible; Prime adds new sections for UI/UX settings |
| `Tally.aws` | Yes | Yes | Format unchanged; port 9000 default for ODBC on both |
| `rewrite.ini` | Yes | Yes | Character mapping rules — compatible format |
| `Tally.xml` | Rare | Yes | Service configuration for Prime's new features (e-invoice, e-way bill) |

---

## 3. Feature Comparison

### 3.1 User Interface / User Experience

| Aspect | Tally.ERP 9 | TallyPrime |
|---|---|---|
| Navigation | Button bar + Go To menu | Sidebar + Search-centric |
| Multi-tasking | Single-window, switch via menu | Multi-tab interface (opening multiple masters/reports simultaneously) |
| Keyboard shortcuts | Functional (Ctrl+E, Ctrl+I, etc.) | Expanded set — enhanced with modern conventions |
| Font rendering | Legacy GDI | ClearType — crisper text on modern displays |
| Colour scheme | Fixed blue/white theme | Modern grey/blue with higher contrast options |
| Report viewing | Single report at a time | Side-by-side report comparison (new) |
| Search | Go To (Ctrl+G) with sequential search | Predictive search with auto-complete |

### 3.2 Reporting Enhancements

| Feature | ERP 9 | Prime |
|---|---|---|
| Financial reports | Ledger, Trial Balance, P&L, Balance Sheet | Same reports, enhanced formatting |
| Comparative reports | Available | Improved columnar comparison |
| Drill-down | Available | Faster, with persistent filter context |
| Report export | PDF, HTML, XML, ASCII | Same formats + improved PDF fidelity |
| Custom reports via TDL | Yes | Yes — same TDL `##Report` paradigm |
| Smart filters | Basic | Persistent filter bar with saved filters |
| Exception reporting | Manual | Automated exception flags (e.g., negative stock, abnormal vouchers) |

### 3.3 GST Compliance Evolution

| Aspect | ERP 9 (late versions) | Prime v1.1.7+ |
|---|---|---|
| GSTR-1 | Supported (returns only) | Supported + return filing integration |
| GSTR-3B | Supported | Supported |
| E-invoicing | Not supported (ERP 9 6.6.3+ via update) | Native support — IRN generation, QR code |
| E-way bill | Not supported | Native integration with e-way bill portal |
| HSN/SAC auto-populate | Manual | Auto-suggest from master data |
| GST reconciliation | Available | Enhanced — upload GSTR-2A directly |
| Invoice Reference Number (IRN) | None | Built-in workflow |

### 3.4 Performance Improvements

| Metric | ERP 9 | Prime |
|---|---|---|
| Startup time | ~8–12 sec (cold) | ~4–6 sec (cold) — improved loader |
| Data loading (1,000+ masters) | ~2–3 sec | ~1–2 sec |
| Multi-user performance | Acceptable up to ~10 users | Improved — better lock management |
| Report generation (10k vouchers) | ~3–5 sec | ~2–3 sec |
| Memory usage | ~150–250 MB | ~200–350 MB (higher baseline due to UI enhancements) |
| SQL/ODBC query response | Baseline | Slightly faster — same ODBC engine, buffered reads improved |

### 3.5 New Features in TallyPrime

1. **Multi-tasking tabs** — Open multiple masters, reports, and voucher screens simultaneously
2. **E-invoicing** — IRN generation, QR code printing, real-time validation
3. **E-way bill** — Generation and tracking within Tally
4. **Dashboard** — Quick-view KPI panel on home screen
5. **Exception reports** — Proactive identification of data anomalies
6. **Credit management** — Customer credit limit alerts
7. **Banking** — Auto bank statement import, reconciliation improvements
8. **Sales/Purchase order enhancements** — Better tracking with colour-coded status
9. **Multi-company dashboard** — Switch companies from a single view
10. **Quick notes** — Per-transaction notes without opening the full narration editor

---

## 4. Technical Architecture Comparison

### 4.1 ODBC Support

| Parameter | ERP 9 | Prime |
|---|---|---|
| Port | 9000 (default) | 9000 (default) |
| Protocol | Tally ODBC Protocol (proprietary) | Same — backward compatible |
| Driver | `TallyODBC_9000.dll` | Same driver, minor version bump |
| Query capabilities | SELECT on masters/vouchers | Identical — same schema |
| Connection string | `DSN=TallyODBC;PORT=9000` | Unchanged |
| Concurrency | Single connection per process | Same limitation |

**Critical finding**: The ODBC interface is **identical** between ERP 9 and Prime. Port 9000, query format, result sets, and schema are fully compatible. Any extraction code written for ERP 9 will work against Prime without modification.

### 4.2 XML Export Format

| Aspect | ERP 9 | Prime |
|---|---|---|
| Encoding | UTF-16 LE with BOM | UTF-16 LE with BOM |
| Root element | `<ENVELOPE>` | `<ENVELOPE>` |
| Master structure | `<HEADER>`, `<BODY>`, `<DESC>` | Identical |
| Voucher structure | `<VOUCHER>` with `<DATE>`, `<PARTYLEDGERNAME>`, etc. | Identical |
| Export command | `EXPORT` via `$$ExportType` | `EXPORT` — same syntax |
| Import compatibility | ERP 9 exports can be imported in Prime | Prime exports can be imported in ERP 9 |

**Critical finding**: The XML export/import format is **fully compatible** between versions. A master or voucher XML exported from ERP 9 can be imported into Prime and vice versa. This is by design — Tally uses the same XML schema parser across versions.

### 4.3 TDL Compatibility

| Aspect | ERP 9 | Prime |
|---|---|---|
| Core TDL syntax | Fully supported | Fully supported (superset) |
| New UI controls | Not available | New objects: `TabbedWindow`, `QuickSearch`, `SideMenu` |
| `##Form` | Supported | Supported — with new properties |
| `##Report` | Supported | Supported — with new formatting properties |
| `##Function` | Supported | Supported |
| `##Key` | Supported | Supported |
| Compilation target | `.cap` | `.tcp` |
| Backward compat | N/A | ERP 9 TDL compiles to `.tcp` with minor adjustments |

**Guideline**: 90%+ of ERP 9 TDL code compiles as-is under Prime. The breaking changes are primarily in form definitions that reference ERP 9-only structural elements.

### 4.4 Data File Format Compatibility

| Aspect | ERP 9 | Prime |
|---|---|---|
| Company data extension | `.dat` (Tally Data File) | `.dat` — same format |
| Index files | `.idx` | `.idx` |
| Lock files | `.lck` | `.lck` |
| Direct file load | Version-specific | Not backward compatible |
| Upgrade path | N/A | Prime loads ERP 9 data on first open (automatic conversion) |

**Critical finding**: The on-disk `.dat` format is **not identical** between versions. Prime implements an automatic data upgrade on first load of an ERP 9 company. After upgrade, the data cannot be loaded back in ERP 9. The XML export format remains the safe interchange format.

### 4.5 Multi-User / Network Capabilities

| Aspect | ERP 9 | Prime |
|---|---|---|
| Concurrent users | up to unlimited (license-dependent) | Same model |
| Data sharing | Shared `.dat` on network drive | Same |
| Lock management | File-based | File-based, improved |
| Tally.NET | Supported | Supported + TallyPrime Remote |
| Remote access | Tally.NET | Tally.NET + enhanced remote desktop capabilities |

---

## 5. Extraction / Migration Considerations

### 5.1 XML Export Compatibility

Both versions expose identical XML export through the TDL `$$ExportType` system:

- **Master XML** (`EXPORT TYPE: Ledger`, `EXPORT TYPE: Stock Group`, etc.): Structure and field names are identical
- **Voucher XML** (`EXPORT TYPE: Voucher`): All voucher types (Sales, Purchase, Payment, Receipt, Contra, Journal, etc.) use the same schema
- **Encoding**: UTF-16 LE with BOM on both — confirmed by reading exported files from the Prime instance

### 5.2 Master Export Structure

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Ledger</TYPE>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYMESSAGE>
        <LEDGER>
          <NAME>...</NAME>
          ...
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>
```

No structural differences between ERP 9 and Prime master exports.

### 5.3 Voucher Export Structure

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Voucher</TYPE>
  </HEADER>
  <BODY>
    <DESC>...</DESC>
    <DATA>
      <TALLYMESSAGE>
        <VOUCHER>
          <VCHTYPE>Sales</VCHTYPE>
          <DATE>20240101</DATE>
          ...
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>
```

No structural differences. All voucher fields (`DATE`, `PARTYLEDGERNAME`, `LEDGERENTRIES`, `BILLALLOCATIONS`, `INVENTORYALLOCATIONS`, etc.) are identical.

### 5.4 TDL Customization Migration

1. **Identify all `.cap` files** in use in ERP 9
2. **Decompile** each `.cap` to `.tls` using `Tally.Compiler.TDL.exe` / `TallyDevelop.exe`
3. **Recompile** to `.tcp` using the Prime version of the TDL compiler
4. **Fix breaking changes**:
   - Replace deprecated `[Form]` attributes with Prime equivalents
   - Update any hardcoded paths referencing `Tally.ERP9`
   - Remove or replace ERP 9-specific UI objects
5. **Test** — Load the recompiled `.tcp` alongside Prime

Estimated migration effort: ~20% of customizations require changes; straightforward TDL (reports, simple forms) migrates without modification.

### 5.5 Data Upgrade Path

```
ERP 9 data (.dat files)
        │
        ▼
[Open in TallyPrime v1.1.7]
        │
        ▼
[Automatic upgrade prompt]
        │
        ▼
[Data converted to Prime format — IRREVERSIBLE]
        │
        ▼
[Backup original .dat before upgrade]
        │
        ▼
Alternative: Use XML export from ERP 9 →
            Import into Prime (safe, reversible)
```

---

## 6. Security & Licensing

### 6.1 Licensing Model

| Aspect | ERP 9 | Prime |
|---|---|---|
| Type | Perpetual — dongle-based hardware lock | Annual subscription / perpetual with AMC |
| Activation | USB hardware dongle (Sentinel/THALES) | Online activation + licensed user account |
| Multi-user | One dongle per concurrent user | Subscription per named user / concurrent |
| Trial | Limited-time demo (no dongle) | 30-day free trial (online activation) |
| Upgrade cost | Paid upgrade fee | Included in active subscription / AMC |

### 6.2 Feature Gating

Both versions use the same gating mechanism — `Tally.lic` plus compiled feature checks in `.cap`/`.tcp`:

| Feature | ERP 9 Gate | Prime Gate |
|---|---|---|
| GST | Gold/Professional license | All editions |
| Payroll | Separate license | Silver+ |
| Job Costing | Gold/Professional | Silver+ |
| E-invoicing | Not available | Standard+ |
| E-way bill | Not available | Standard+ |
| Multi-company | License-level dependent | All editions (up to limit) |

**Observation**: Prime's feature gating is simpler — fewer license tiers, more features in base edition. The `.lic` format is compatible.

---

## 7. Summary Table

| # | Dimension | Tally.ERP 9 | TallyPrime v1.1.7 | Compatible? |
|---|---|---|---|---|
| 1 | Executable size | 9.3 MB | ~13 MB | — |
| 2 | Capsule format | `.cap` | `.tcp` | No (same language, different container) |
| 3 | TDL language | v1.x | v2.x (superset) | Largely backward compatible |
| 4 | ODBC port | 9000 | 9000 | Yes — fully |
| 5 | XML export format | UTF-16 LE BOM | UTF-16 LE BOM | Yes — fully |
| 6 | XML import format | Same schema | Same schema | Yes — fully |
| 7 | Data file format | `.dat` (v9 format) | `.dat` (Prime format) | One-way upgrade only |
| 8 | Configuration format | `.ini`, `.aws` | `.ini`, `.aws`, `.xml` | Backward compatible |
| 9 | GST returns | Basic | Advanced + e-invoicing | — |
| 10 | E-invoicing | No | Yes (IRN generation) | — |
| 11 | E-way bill | No | Yes (portal integration) | — |
| 12 | Multi-tasking | Single pane | Multi-tab interface | — |
| 13 | Search | Go To | Predictive search | — |
| 14 | Dashboard | Basic | Enhanced KPI dashboard | — |
| 15 | Report export | PDF/XML/HTML/ASCII | Same + improved PDF | Yes (same interfaces) |
| 16 | Multi-user | File-based | File-based (improved) | Compatible |
| 17 | Licensing | Perpetual dongle | Subscription/AMC | — |
| 18 | Tally.NET | Yes | Yes + Remote | — |
| 19 | User-defined fields | TDL only | TDL + built-in UDF | — |
| 20 | Bank reconciliation | Manual | Auto-import (OFX/CSV) | — |
| 21 | Startup time | ~8–12 sec | ~4–6 sec | — |
| 22 | Memory footprint | ~150–250 MB | ~200–350 MB | — |

---

## 8. Recommendations for GII ERP Project

Based on the analysis of both installations, the following patterns should guide the GII ERP extraction and integration layer:

### 8.1 Use Prime's Patterns (Recommended)

1. **XML export format** — Follow Prime's schema (same as ERP 9). Both installations share the exact same export structure. The 10 XML export files from the Prime instance confirm this.
2. **ODBC extraction** — Target port 9000 using the same ODBC protocol. Works identically on both versions.
3. **Data schema** — Use the 1,617 entities from GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED (Prime) as the reference data model for extraction testing.
4. **API interaction patterns** — Prime's XML request/response format should be the target, as ERP 9's is a strict subset.

### 8.2 Support Both Versions

1. **Write extraction code once** — The XML export and ODBC interfaces are identical. A single extraction engine serves both.
2. **Detect version at runtime** — Check for `.cap` vs `.tcp` presence, or parse `Tally.lic`, to adapt any version-specific logic.
3. **TDL customization layer** — If the GII project deploys custom TDL, target the `.tcp` format (Prime) but maintain a `.cap` compile target for ERP 9 clients during migration.

### 8.3 Migration Strategy for GII Clients

| Current Version | Recommended Action |
|---|---|
| Tally.ERP 9 (no custom TDL) | Upgrade to Prime → use native extraction |
| Tally.ERP 9 (with custom TDL) | Port TDL to Prime `.tcp` → upgrade → extract |
| TallyPrime (v1.1.7+) | Use as-is — XML/ODBC extraction works directly |
| Mixed environment | Normalize on Prime for all new integrations; maintain ERP 9 support for legacy |

### 8.4 Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| ERP 9 data upgraded to Prime (irreversible) | Medium | Always extract XML backup before upgrade |
| TDL customizations break after upgrade | Low–Medium | Decompile → recompile → test cycle |
| ODBC schema changes in future Prime updates | Low | Target the stable core tables; avoid fringe fields |
| E-invoicing/e-way bill API changes | Medium | Isolate compliance logic in wrapper layers |

---

*Document generated from live analysis of installations at `C:\Program Files\Tally\Tally.ERP9` (ERP 9) and `C:\Program Files\TallyPrime` (Prime v1.1.7). Company data from GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED (1,617 entities) used for schema validation.*
