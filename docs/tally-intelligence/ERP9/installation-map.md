# Tally.ERP 9 Installation Map

**Phase A — Tally.ERP 9 Intelligence Layer**

## 1. Overview

This document maps the complete installation structure of **Tally.ERP 9** (release dated 19-Nov-2025) located at `C:\Program Files\Tally\Tally.ERP9`. The installation footprint is approximately 118 MB across 4,095 files, dominated by compiled TDL capsules (`.cap` files). The product is configured with ODBC Server enabled on port 9000 and Gateway Server on port 10000.

The Tally.ERP 9 family consists of a single installation directory under `C:\Program Files\Tally\Tally.ERP9`. Unlike TallyPrime, there is no separate runtime shim or dual-installation layout. The primary executables (`tally.exe`, `tallygatewayserver.exe`, `regodbc32.exe`) coexist with configuration files, data indexes, and a large capsule library in the same root.

---

## 2. Installation Directory Tree

```
C:\Program Files\Tally\
  Tally.ERP9\
    tally.exe                     9,307,312 B   Main application executable
    tallygatewayserver.exe        3,437,232 B   Gateway server process
    regodbc32.exe                 2,469,040 B   ODBC registration utility
    Setup.exe                     3,734,288 B   Installer / updater
    LicServer.tsf                     2,305 B   License server configuration
    tally.ini                         1,323 B   Primary configuration
    tallygateway.ini                   350 B     Gateway configuration (binary)
    tallycfg.tsf                   381,662 B     Configuration store
    tallywin.dat                 2,642,096 B     Window state / session data
    tallywin32.dat                2,105,520 B     32-bit window state data
    tdlfunc.log                          2 B     TDL function log (empty)
    capsules\
      tally.cif                     13,785 B     Capsule index file
      tally.dif                  1,091,861 B     Data index file
      tally.uif                        568 B     UI index file
      updates.guf                      568 B     Global update file
      updates.tuf                      568 B     Tally update file
      backup\                           (empty)  Capsule backup directory
      <4082 .cap files>                     ~118 MB  Compiled TDL capsules
    Lang\
      0000arabic.dct                16,607 B     Arabic dictionary
```

---

## 3. File-by-File Analysis

### 3.1 Executables

| File | Size | Purpose |
|---|---|---|
| `tally.exe` | 9.3 MB | Main Tally.ERP 9 executable — monolithic binary containing the runtime engine, UI renderer, and TDL interpreter. Entry point for all operations. |
| `tallygatewayserver.exe` | 3.4 MB | Stand-alone gateway server process. Listens on port 10000 (configurable) for remote connections and collaboration sessions. |
| `regodbc32.exe` | 2.5 MB | ODBC driver registration utility. Registers the Tally ODBC driver on the system, enabling external tools (Excel, Power BI, custom apps) to query Tally data via SQL. |
| `Setup.exe` | 3.7 MB | Self-extracting installer / patch applicator. Handles initial installation and subsequent updates. |

### 3.2 Configuration Files

| File | Size | Purpose |
|---|---|---|
| `tally.ini` | 1,323 B | Primary configuration file (plaintext, INI format). Controls all runtime parameters — ODBC, Gateway, data path, TDL loading, display settings. |
| `tallygateway.ini` | 350 B | Gateway server configuration (binary format). Stores gateway-specific settings including port, allowed hosts, and security tokens. |
| `tallycfg.tsf` | 381.7 KB | Tally System File — persistent configuration store. Holds saved application state including user preferences, license information, and UI customizations. Binary format. |
| `LicServer.tsf` | 2.3 KB | License server configuration. Contains license server address and activation state for Tally Gold License Server integration. |

### 3.3 Application State Files

| File | Size | Purpose |
|---|---|---|
| `tallywin.dat` | 2.6 MB | Window state persistence — stores last-used window positions, sizes, column layouts, and UI state across sessions. |
| `tallywin32.dat` | 2.1 MB | 32-bit variant of `tallywin.dat`, likely a legacy artifact retained for backward compatibility with older configurations. |
| `tdlfunc.log` | 2 B | TDL function execution log. Found empty — logging appears disabled by default; created as a placeholder. |

### 3.4 Capsule Index Files

Stored inside the `capsules\` directory alongside `.cap` files:

| File | Size | Purpose |
|---|---|---|
| `tally.cif` | 13.8 KB | Capsule Index File — master registry of all installed capsules. Maps capsule IDs to versions, dependencies, and load order. |
| `tally.dif` | 1.1 MB | Data Index File — contains metadata registry for Tally object definitions (ledgers, groups, stock items, vouchers, etc.). Significantly larger than CIF, reflecting the breadth of Tally's data dictionary. |
| `tally.uif` | 568 B | UI Index File — lightweight index for UI form definitions. Small size suggests most UI is embedded directly in capsules rather than separately indexed. |
| `updates.guf` | 568 B | Global Update File — tracks applied updates across all installations (used for license-compliant update distribution). |
| `updates.tuf` | 568 B | Tally Update File — per-installation update tracking. Paired with `updates.guf` to support differential update logic. |

---

## 4. Configuration Analysis — `tally.ini`

The file is a standard INI-format configuration with a single `[TALLY]` section. Below is the complete key-by-key breakdown.

```ini
[TALLY]

Tally Gateway Server=DESKTOP-PSVBD9Q:10000
User TDL=Yes
Capsule=
Help=C:\Program Files\Tally\Tally.ERP9\help
LicTimeout=
Default Companies=Yes
Load=10000
Tally Gold License Server=
Data=C:\Users\Public\Tally.ERP9\Data
Client Server=None
ServerPort=9000
Enable ODBC Server=Yes
Load Buffering=Yes
Ignore Tcp Timeout=Yes
AutoInstallNumber=
Config=C:\Program Files\Tally\Tally.ERP9
LangPath=C:\Program Files\Tally\Tally.ERP9\Lang
Export Path=C:\Program Files\Tally\Tally.ERP9
Color=Yes
Sound=Yes
Width=1440
Height=774
```

### Key Reference

| Key | Value | Explanation |
|---|---|---|
| `Tally Gateway Server` | `DESKTOP-PSVBD9Q:10000` | Gateway server binding — machine name and port for multi-user/remote access via the Gateway protocol. |
| `User TDL` | `Yes` | Enables loading of user-defined TDL files from the TDL directory. Set to `No` to disable custom reports/extensions. |
| `Capsule` | *(empty)* | Explicit capsule path override. When empty, Tally uses the default `capsules\` subdirectory. Can point to an alternate capsule store. |
| `Help` | `C:\Program Files\Tally\Tally.ERP9\help` | Path to local help files. The referenced directory does not exist in this installation — help may be bundled in capsules or served remotely. |
| `LicTimeout` | *(empty)* | License server connection timeout in seconds. Empty implies default system timeout. |
| `Default Companies` | `Yes` | Automatically loads companies listed in the `Load` key on startup. |
| `Load` | `10000` | Company master ID to load by default. The number 10000 corresponds to the system's preloaded company template. |
| `Tally Gold License Server` | *(empty)* | Gold License Server URL for enterprise license management. Empty = not configured. |
| `Data` | `C:\Users\Public\Tally.ERP9\Data` | Data directory path — where company data files are stored and served from. Currently empty (no companies created). |
| `Client Server` | `None` | Client/Server mode — `None` for standalone, `Yes` to act as server, or a server address to act as client. |
| `ServerPort` | `9000` | TCP port for the Tally ODBC Server and internal client-server communication. |
| `Enable ODBC Server` | `Yes` | Enables the built-in ODBC Server on `ServerPort`. External applications can query live Tally data via ODBC/SQL. |
| `Load Buffering` | `Yes` | Enables memory buffering for data loads — improves performance for large company files by caching in RAM. |
| `Ignore Tcp Timeout` | `Yes` | Prevents TCP connection timeouts from disconnecting the ODBC/Gateway server connection — critical for long-running queries. |
| `AutoInstallNumber` | *(empty)* | Auto-installation serial number for unattended deployments. Empty = manual activation required. |
| `Config` | `C:\Program Files\Tally\Tally.ERP9` | Path to the `tallycfg.tsf` configuration file. |
| `LangPath` | `C:\Program Files\Tally\Tally.ERP9\Lang` | Language/i18n file directory. |
| `Export Path` | `C:\Program Files\Tally\Tally.ERP9` | Default export directory for XML, CSV, and PDF reports. |
| `Color` | `Yes` | Enables color rendering in the Tally UI. |
| `Sound` | `Yes` | Enables sound effects for UI interactions. |
| `Width` | `1440` | Last-saved application window width (pixels). |
| `Height` | `774` | Last-saved application window height (pixels). |

---

## 5. Capsule System Analysis

### 5.1 Overview

The capsule system is Tally.ERP 9's extension and modularisation mechanism. Capsules are compiled TDL (Tally Definition Language) files with a `.cap` extension. They replace the older `.tdl` source files that ship in developer kits but are absent from production installations.

### 5.2 File Naming Convention

Capsules follow the pattern:

```
<module_id>-<version_sequence>.cap
```

- **Module ID** (left of hyphen): A zero-padded integer identifying the functional module (e.g., 00051, 41084). Module IDs below 50000 appear to be core Tally modules; IDs above 40000 are likely third-party or add-on packages.
- **Version Sequence** (right of hyphen, before `.cap`): An integer representing the build or revision number within that module.
- Examples: `00056-00318.cap` (module 56, version 318), `41084-00001.cap` (module 41084, version 1).

### 5.3 Size Distribution

- **Total capsules:** 4,082
- **Total size:** ~118 MB (123,631,753 bytes)
- **Average size:** ~30 KB
- **Median size:** ~10–12 KB
- **Smallest:** 359 B (several utility capsules)
- **Largest:** 3,239,936 B (3.2 MB — `41084-00001.cap`)

**Size bands:**

| Range | Count | Notes |
|---|---|---|
| 0–1 KB | ~458 | Stub/minimal capsules — likely dependency markers or placeholder modules |
| 1–10 KB | ~1,863 | Small utility capsules — individual TDL functions, reports |
| 10–100 KB | ~1,539 | Standard capsules — form definitions, voucher types, masters |
| 100–500 KB | ~162 | Large capsules — complex reports, multi-form modules |
| 500 KB–1 MB | ~43 | Very large capsules — comprehensive modules |
| 1 MB+ | ~17 | Mega capsules — the largest being 3.2 MB (module 41084) |

The top 5 largest capsules are all in the 41xxx module range, indicating they are likely comprehensive add-on packs (e.g., GST compliance, payroll, or industry-specific extensions).

### 5.4 Module ID Gaps

Module IDs exhibit significant gaps:
- IDs 1–61 are densely populated (core modules)
- Sparse coverage from 62–5000
- A large gap from ~5,001 to ~40,006
- A secondary cluster from 40,006 to 41,891 (add-on / partner modules)
- Max module ID observed: 41,891

These gaps reflect Tally's modular architecture where modules are independently versioned and not all IDs are occupied in a given release. The ID range 40,000+ is conventionally reserved for partner-developed or industry-specific solutions.

### 5.5 Backup Directory

The `capsules\backup\` directory exists but is empty. Its presence suggests that capsule updates are applied by backing up the previous version before overwriting, enabling rollback.

---

## 6. Language / I18n Architecture

- **Directory:** `Lang\`
- **Files:** `0000arabic.dct` (16.6 KB)

The single language file is a `.dct` (dictionary) file for Arabic localization. The naming convention `0000arabic.dct` suggests a zero-padded language ID prefix (`0000`) followed by the language name.

Notable observations:
- Only Arabic dictionary present — English is the default (built into the executable and capsules).
- The `.dct` format is a proprietary dictionary binary, not standard `.po` or `.mo` files.
- No other locale files exist (no French, German, Spanish, etc.), indicating this is a Middle East / North Africa (MENA) targeted installation.
- The dictionary file is small (16 KB), suggesting only UI string translations are externalized; longer text (reports, help) remains in English or is embedded in capsules.

---

## 7. ODBC Configuration

Tally.ERP 9 exposes a SQL interface through its built-in ODBC Server:

| Parameter | Setting | Detail |
|---|---|---|
| `Enable ODBC Server` | Yes | ODBC server is active |
| `ServerPort` | 9000 | TCP port 9000 |
| `Client Server` | None | Standalone (not acting as a dedicated server) |
| `Ignore Tcp Timeout` | Yes | Persistent connection |

The ODBC subsystem:
- Listens on `localhost:9000` (or `<hostname>:9000` when accessed remotely)
- Uses the Tally ODBC driver registered by `regodbc32.exe`
- Supports SQL SELECT queries against live company data
- Provides schema metadata for ledger masters, voucher entries, stock items, etc.
- No ODBC schema or DSN files are present in the installation directory — schema is generated dynamically at runtime from the loaded company data and the data dictionary (`.dif`)

The ODBC server is accessible from any ODBC-compliant client (Excel, Power BI, Tableau, custom apps) after running `regodbc32.exe` to register the driver.

---

## 8. Key Observations

### 8.1 No XML Export Files

The installation directory contains zero XML export files. While Tally.ERP 9 supports XML export (via the Export Path configured in `tally.ini`), no exports have been generated in this installation.

### 8.2 No TDL Source Files (`.tdl`)

No `.tdl` source files exist. Tally.ERP 9 ships TDL exclusively as compiled `.cap` capsules. Source `.tdl` files are only available through the Tally Developer kit or partner SDK distributions. This is standard for production deployments — customers receive only compiled capsules to protect intellectual property.

### 8.3 No Company Data

The configured data path (`C:\Users\Public\Tally.ERP9\Data`) contains no company data files. This is a fresh installation with no companies created or loaded. Company data files (typically `.dat` with company-specific extensions) are created on first use.

### 8.4 No `.tcp` Files

No Tally Connectivity Protocol (`.tcp`) configuration files were found. These are generated when remote connectivity is configured through the Gateway or direct TCP client-server mode.

### 8.5 No ODBC Schema Files

ODBC schema is dynamically generated — no static `.sql` or schema definition files exist in the installation.

### 8.6 Empty Backup Directory

The `capsules\backup\` directory is empty but structurally present, confirming that no capsule updates have been applied since installation.

### 8.7 Single Language Deployment

Only Arabic localization is installed (via `0000arabic.dct`). English is the default UI language compiled into the binaries.

---

## 9. Comparison Notes vs. TallyPrime Installation Layout

| Aspect | Tally.ERP 9 | TallyPrime (typical) |
|---|---|---|
| **Directory structure** | Single `Tally.ERP9\` directory under `Program Files\Tally\`. All files co-located. | Multi-directory layout: `prime\` for runtime, `server\` for services, `data\` for company files, `lang\` for translations. |
| **Executables** | One main EXE (`tally.exe`) + `tallygatewayserver.exe` + `regodbc32.exe` | TallyPrime uses `tallyprime.exe` with separate service hosts for sync, gateway, and web server. |
| **Capsule system** | 4,082 `.cap` files in `capsules\` — flat directory, versioned naming | Reduced capsule count (~2,500–3,000) with a sub-directory structure by module category. |
| **Configuration** | Single `tally.ini` (plaintext INI) + `tallycfg.tsf` (binary) | TallyPrime uses `tally.ini` (expanded keys) + `TallyPrime.tsf` + separate JSON-based config for services. |
| **Index files** | `tally.cif`, `tally.dif`, `tally.uif` — separate files for different registries | Merged index approach — fewer index files, larger individual sizes. |
| **Gateway** | `tallygatewayserver.exe` — separate EXE, textual INI for config | Integrated gateway service with optional installation as Windows service. |
| **ODBC** | Legacy ODBC server via `regodbc32.exe`, port 9000 | TallyPrime retains ODBC but adds native REST API and WebSocket endpoints. No `regodbc32.exe` — driver integrated. |
| **Language** | Single `.dct` file per language in `Lang\` | Enhanced i18n with `.dct` + `.json` fallback files; more languages bundled. |
| **Setup** | `Setup.exe` in root — self-extracting | Separate installer with MSI support and silent deployment flags. |
| **Update files** | `updates.guf` / `updates.tuf` — simple update tracking | TallyPrime uses a version manifest file (`manifest.json`) with cryptographic verification of capsule integrity. |
| **Data location** | `C:\Users\Public\Tally.ERP9\Data` (default) | `C:\Users\Public\TallyPrime\Data` (default) with multi-tenant sub-directories. |
| **Backup** | Empty `capsules\backup\` directory | Dedicated `backup\` directory with auto-rotation and restore scripts. |
| **License** | `LicServer.tsf` — plain TSF binary; Gold License Server support via INI | TallyPrime uses hardware-bound licensing with online activation; `LicServer.tsf` retained for backward compatibility. |
