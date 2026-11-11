# TallyPrime 1.1.7 Installation Map

## Overview

TallyPrime v1.1.7.0.0 is installed at `C:\Program Files\TallyPrime`. This document maps the entire installation structure, including executables, configuration files, data files, capsules, language resources, and user TDL files.

## Installation Root: `C:\Program Files\TallyPrime`

### Executable Files

| File | Size | Purpose |
|------|------|---------|
| `tally.exe` | 17.0 MB | Main TallyPrime application executable. Launches the Tally runtime, loads capsules, TDL, language resources, and connects to the gateway server. |
| `tallygatewayserver.exe` | 4.2 MB | Tally Gateway Server binary. Provides licensing services on port 10000 and manages client-server communication. Runs as a background service. |
| `Setup.exe` | 3.3 MB | Installer executable for TallyPrime. Not used during normal operation. |

### Configuration Files

| File | Purpose |
|------|---------|
| `tally.ini` | Primary workstation configuration (55 lines). Key settings: ODBC Server enabled on port 9000, data path at `C:\Users\Public\TallyPrime\data`, User TDL loading enabled, gateway server address `DESKTOP-IUDTK7U:10000`, language path, export path. |
| `tallygateway.ini` | Tally Gateway Server configuration (7 lines). Sets license server port (10000), auto-install disabled, service display name. |
| `clientlicinfo.tsf` | Client license information (568 bytes). Binary TSF format. |
| `LicServer.tsf` | License server state file (568 bytes). Contains current license server metadata. |
| `tallycfg.tsf` | Saved Tally configuration (569 KB). Includes UI preferences, company list, print settings, and other persistent settings. Referenced by `Config=C:\Program Files\TallyPrime` in tally.ini. |

### Data Files (DAT / BINARY)

| File | Size | Purpose |
|------|------|---------|
| `tallyapp.dat` | 11.9 MB | Application resource data. Contains compiled application logic and UI definitions. |
| `tallyres.dat` | 55.5 MB | Main resource database. The largest binary file; contains default company templates, report definitions, standard masters, and built-in TDL code. |
| `tallywin.dat` | 2.7 MB | Window management and rendering resources. Controls Tally's text-based GUI rendering engine. |

### Exported XML Data Files

These files were exported from the company "GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED" and contain all master and transaction data in Tally's XML interchange format.

| File | Size | Content |
|------|------|---------|
| `Accounting Master.xml` | 3.8 MB | Combined export: cost categories, groups, ledgers, voucher types. |
| `ALL INVENTORY MASTERS.xml` | 7.6 MB | Combined inventory export: units, stock groups, stock items. |
| `GROUPS.xml` | 189 KB | Accounting groups with parent-child hierarchy (Bank Accounts, Capital Account, Current Assets, etc.). |
| `LEDGERS.xml` | 3.4 MB | Accounting ledgers with currency settings, cost category allocations, opening balances. |
| `STOCK GROUPS.xml` | 9 KB | Stock group hierarchy with costing methods (Avg. Cost) and valuation methods (Avg. Price). |
| `STOCK ITEMS.xml` | 7.4 MB | Complete stock item catalog with unit details, opening quantities, and rates. |
| `STOCK CATEGORIES.xml` | 1.5 KB | Stock category definitions. |
| `Transactions.xml` | 4.8 MB | All vouchers (Receipt, Payment, Sales, Purchase, Journal, etc.) for the company. |
| `VOUCHER TYPES.xml` | 213 KB | Voucher type definitions with numbering methods (Automatic/Manual), prefix/suffix configuration. |
| `Tally.xml` | 137 KB | Display period configuration (month-by-month net/closing balance data). |

### Additional Exported Reports

| File | Type | Content |
|------|------|---------|
| `Account_Statement_Report_16-12-2025_1641hrs.CSV` | CSV | Axis Bank statement (Account 925020024511573) with 122 transactions. IFSC: UTIB0000142, MICR: 800211002. |
| `Account_Statement_Report_16-12-2025_1635hrs.PDF` | PDF | Same bank statement in PDF format. |
| `Beneficiary Management Report_16-12-2025_1643hrs.xlsx` | XLSX | Beneficiary list export. |

### Capsule System (`capsules/`)

The capsule system is TallyPrime's component architecture. Capsules provide modular functionality.

#### Capsule Files (.cap)

| File | Description |
|------|-------------|
| `21500-00340.cap` | Core TallyPrime capsule |
| `21508-00134.cap` | Core TallyPrime capsule |
| `21908-00133.cap` | Core TallyPrime capsule |
| `26000-00080.cap` | Feature/plugin capsule |
| `26000-00085.cap` | Feature/plugin capsule |
| `26000-00087.cap` | Feature/plugin capsule |

#### Capsule Metadata Files

| Pattern | Format | Purpose |
|---------|--------|---------|
| `TP-x-x-x-x-x-xxxxx.cif` | CIF (Capsule Information File) | Version-specific TallyPrime capsule info. Example: `TP-1-1-7-0-0-27958.cif/.dif` corresponds to v1.1.7.0.0 build 27958. |
| `TP-x-x-x-x-x-xxxxx.dif` | DIF (Dependency Information File) | Capsule dependency declarations. |
| `TE9-x-x-x-x-x-xxxxx.cif/.dif` | CIF/DIF | Tally ERP 9 backward-compatibility capsules for data migration. |
| `TOC-xxxxx.oif` | OIF (Option Information File) | Optional feature capsules. Multiple OIF files (01772 through 01797) represent different optional modules. |
| `tally.cif` / `tally.dif` | CIF/DIF | Main TallyPrime capsule definitions (not version-specific). |
| `tally.oif` | OIF | Base optional features descriptor. |
| `tally.tip` | TIP | Tally Installation Package manifest. Describes the capsule bundle and version dependencies. |
| `updates.guf` | GUF | Global update file - tracks installed updates across capsules. |
| `updates.tuf` | TUF | Tally update file - records applied patch and hotfix versions. |

### TDL Directory (`tdl/`)

Contains Tally Definition Language (TDL) compiled files:

| File | Size | Description |
|------|------|-------------|
| `ACME_SelectedLineTotal.tcp` | Compiled TDL | Custom TDL plugin for line total calculations. Original `.tld` source not present. |
| `support desk.tcp` | Compiled TDL | Custom TDL plugin for support desk functionality. Source not present. |
| *(tdl/)* | *(empty)* | Additional TDL can be placed here; referenced by `User TDL=Yes` in tally.ini. |

The `appresources/plugins/TallyCapital/` directory also contains `lendingplugin.tcp` and `lendingplugin6.tcp` (compiled TDL for TallyCapital lending module).

### Language Directory (`lang/`)

| File | Purpose |
|------|---------|
| `0000arabic.dct` | Arabic language dictionary file. TallyPrime supports multiple languages via `.dct` dictionary files. Additional dictionaries for Hindi, Tamil, etc. can be added. |

### Plugins (`appresources/plugins/`)

#### TallyCapital Plugin

Path: `appresources/plugins/TallyCapital/`

This is a third-party lending/credit plugin integrated with TallyPrime:

| File | Purpose |
|------|---------|
| `lending.dll` | Native DLL implementing lending business logic. |
| `lendingplugin.tcp` | Compiled TDL for lending UI/reports. |
| `lendingplugin6.tcp` | Alternate version of lending TDL. |
| `lending.zip` | Archive of lending plugin resources. |
| `lending_response.json` | JSON response template for lending API calls. |
| `banner.jpg` | Plugin branding banner. |
| `csbanner.jpg` | Customer service banner. |
| `lenderslogo/` | Directory with lender logo images (BFL, CS, FL, GetVantage, HERO, INDIFI, KBL, LTFS). |

### Key Configuration from `tally.ini`

```ini
[TALLY]
Tally Gateway Server=DESKTOP-IUDTK7U:10000
User TDL=Yes
Default Companies=Yes
Load=100000
Data=C:\Users\Public\TallyPrime\data
ShowDashboardOnCompanyLoad=No
Client Server=None
ServerPort=9000
Enable ODBC Server=Yes
Load Buffering=Yes
Ignore Tcp Timeout=Yes
EnableOptimizedBatchProcessing=Yes
Config=C:\Program Files\TallyPrime
LangPath=C:\Program Files\TallyPrime\lang
Export Path=C:\Program Files\TallyPrime
Color=Yes
ComfortView=Bright
Width=1920
Height=1032
```

### Data Directory

The actual company data files are stored at `C:\Users\Public\TallyPrime\data` (as configured by the `Data=` directive). This directory contains `.dat` and `.tdf` files for each company loaded in TallyPrime. The XML exports at the installation root are snapshots of this data.

### Network Architecture

```
tally.exe <--> tallygatewayserver.exe (port 10000)
                  |
            License Server
                  |
            ODBC Clients (port 9000)
```

Tally Prime connects to the local gateway server for license management. ODBC clients can connect on port 9000 for direct SQL-like querying. The gateway server also supports remote client connections.
