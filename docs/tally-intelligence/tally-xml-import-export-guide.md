# Tally XML Import/Export Guide

## Overview

TallyPrime uses a standardized XML envelope format for all data interchange — import, export, and ODBC query responses. All XML files found in the installation (`GROUPS.xml`, `LEDGERS.xml`, `Transactions.xml`, etc.) follow this structure.

## Envelope Format

The universal XML wrapper consists of four nested containers:

```
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Action Verb</TALLYREQUEST>
  </HEADER>
  <BODY>
    <ACTION_DATA>
      <REQUESTDESC>
        <REPORTNAME>Target Report/Master</REPORTNAME>
        <STATICVARIABLES>...</STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>...</REQUESTDATA>
    </ACTION_DATA>
  </BODY>
</ENVELOPE>
```

### 1. `<ENVELOPE>` — Root Element

The root container for all Tally XML messages. Always present.

### 2. `<HEADER>` — Request Type

Contains a single `<TALLYREQUEST>` element with one of three action verbs:

| Verb | Purpose |
|------|---------|
| `Import Data` | Import masters or transactions into Tally |
| `Export Data` | Export data from Tally |
| `HTTP` | Used for ODBC/HTTP API queries |

The exported XML files use `Import Data` because they are structured as import-ready data — the same format Tally expects for data ingestion.

### 3. `<BODY>` — Payload Container

Wraps the request description and data using one of these elements:

| Element | Use Case |
|---------|----------|
| `<IMPORTDATA>` | When `TALLYREQUEST` is `Import Data` |
| `<EXPORTDATA>` | When `TALLYREQUEST` is `Export Data` |
| `<DESC>` | When `TALLYREQUEST` is `HTTP` (ODBC) |

#### `<REQUESTDESC>` — Request Descriptor

| Sub-element | Description |
|-------------|-------------|
| `<REPORTNAME>` | Identifies the target: `All Masters`, specific voucher types, or report names |
| `<STATICVARIABLES>` | Context variables (company, dates, filters) |

##### `<STATICVARIABLES>` Pattern

```xml
<STATICVARIABLES>
  <SVCURRENTCOMPANY>GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED</SVCURRENTCOMPANY>
</STATICVARIABLES>
```

Common static variables:

| Variable | Purpose |
|----------|---------|
| `SVCURRENTCOMPANY` | Target company name |
| `SVFROMDATE` | Start date for export filter |
| `SVTODATE` | End date for export filter |
| `EXPLODEFLAG` | Expand nested collections |
| `SVEXPORTFORMAT` | XML/HTML/PDF format specifier |

#### `<REQUESTDATA>` — Data Payload

Contains one or more `<TALLYMESSAGE>` elements.

### 4. `<TALLYMESSAGE>` — Data Unit

Each `<TALLYMESSAGE>` wraps a single business object (one group, one ledger, one voucher, etc.).

```xml
<TALLYMESSAGE xmlns:UDF="TallyUDF">
  <GROUP NAME="Bank Accounts" RESERVEDNAME="Bank Accounts">
    ...
  </GROUP>
</TALLYMESSAGE>
```

#### xmlns:UDF Namespace

The `xmlns:UDF="TallyUDF"` namespace is present on all TALLYMESSAGE elements. It allows custom user-defined fields to be included.

### 5. Object Elements

Each `<TALLYMESSAGE>` contains one of the following object elements:

| Element | File Source |
|---------|-------------|
| `<GROUP>` | GROUPS.xml, Accounting Master.xml |
| `<LEDGER>` | LEDGERS.xml, Accounting Master.xml |
| `<STOCKGROUP>` | STOCK GROUPS.xml, ALL INVENTORY MASTERS.xml |
| `<STOCKITEM>` | STOCK ITEMS.xml, ALL INVENTORY MASTERS.xml |
| `<STOCKCATEGORY>` | STOCK CATEGORIES.xml |
| `<UNIT>` | ALL INVENTORY MASTERS.xml |
| `<VOUCHER>` | Transactions.xml |
| `<VOUCHERTYPE>` | VOUCHER TYPES.xml, Accounting Master.xml |

## Key Attributes on Object Elements

### `NAME` and `RESERVEDNAME`

```xml
<GROUP NAME="Bank Accounts" RESERVEDNAME="Bank Accounts">
```

- `NAME`: The display name of the entity.
- `RESERVEDNAME`: System-reserved name (e.g., `Bank Accounts`, `Receipt`). Empty for user-created entities. Used by Tally to identify pre-defined groups/voucher types.

### `ACTION` Attribute

```xml
<VOUCHER ... ACTION="Create" OBJVIEW="Accounting Voucher View">
```

Used on `<VOUCHER>` elements to specify the import action:

| Value | Meaning |
|-------|---------|
| `Create` | Create new entry |
| `Modify` | Update existing entry |
| `Delete` | Remove entry |

### `OBJVIEW` Attribute

Specifies which Tally view to use:

| Value | Meaning |
|-------|---------|
| `Accounting Voucher View` | Standard accounting entry |
| `Invoice View` | GST invoice with inventory details |

## UTF-16 LE Encoding

All XML files use **UTF-16 Little Endian** encoding. This is critical for parsing:

- Files start with a BOM (Byte Order Mark): `FF FE`
- XML declaration: `<?xml version="1.0" encoding="UTF-16"?>`
- All character content uses 2-byte Unicode characters

**Impact on migration**: Standard XML parsers expecting UTF-8 will fail. A UTF-16-aware parser or pre-processing transcoding step is required.

## MERGE / Object Update Action

```xml
<OBJECTUPDATEACTION>Create</OBJECTUPDATEACTION>
```

Some elements include an `<OBJECTUPDATEACTION>` child element with values:

| Value | Meaning |
|-------|---------|
| `Create` | Insert new |
| `Modify` | Update existing |
| (empty) | Tally decides based on existence |

## LIST Elements (Collections)

Many TallyXML fields use `.LIST` suffix elements to denote collections:

```xml
<ALLLEDGERENTRIES.LIST>
  <LEDGERNAME>Axis Bank</LEDGERNAME>
  <AMOUNT>10000.00</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
  <LEDGERNAME>CENTRAL PUBLIC WORKS DEPARTMENT</LEDGERNAME>
  <AMOUNT>-10000.00</AMOUNT>
</ALLLEDGERENTRIES.LIST>
```

Common LIST types:

| LIST Element | Parent | Contains |
|-------------|--------|----------|
| `ALLLEDGERENTRIES.LIST` | VOUCHER | Ledger postings |
| `INVENTORYENTRIESINVOICE.LIST` | VOUCHER | Stock item details |
| `BATCHALLOCATIONS.LIST` | Inventory Entry | Godown/warehouse, batch |
| `ATTENDANCEENTRIES.LIST` | VOUCHER | Attendance records |
| `LANGUAGENAME.LIST` | Any master | Multi-lingual names |
| `GSTDETAILS.LIST` | GROUP/STOCKGROUP | GST configuration |
| `STATEWISEDETAILS.LIST` | GST Details | State-specific GST rates |
| `RATEDETAILS.LIST` | State Details | CGST/SGST rate breakdown |
| `REPORTINGUQCDETAILS.LIST` | UNIT | UQC mapping per period |
| `AUDITDETAILS.LIST` | Any master | Audit trail |
| `XBRLDETAILS.LIST` | GROUP/LEDGER | XBRL compliance data |

## Importing Data into Tally

To import data programmatically, send a POST request to `http://<tally-server>:9000` with the `<ENVELOPE>` XML payload.

### ODBC/HTTP API Usage

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>HTTP</TALLYREQUEST>
  </HEADER>
  <BODY>
    <DESC>
      <REQUESTDESC>
        <REPORTNAME>GROUP</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
    </DESC>
  </BODY>
</ENVELOPE>
```

This TallyREST/HTTP interface is used for live querying over port 9000 (ODBC Server port).

## Export Example (Tally's Internal Format)

The `Tally.xml` file uses a different, non-envelope format:

```xml
<ENVELOPE>
  <DSPPERIOD>1-Apr</DSPPERIOD>
  <DSPACCINFO>
    <DSPNETTAMT>
      <DSPNETTAMTA></DSPNETTAMTA>
    </DSPNETTAMT>
  </DSPACCINFO>
  ...
</ENVELOPE>
```

This is a display/report format, not the interchange format used for master/transaction data.

## Summary of Rules

1. Always wrap in `<ENVELOPE>`
2. Use `<HEADER><TALLYREQUEST>` to specify action
3. Use `<BODY>` with appropriate sub-container
4. Data goes under `<REQUESTDATA>` in `<TALLYMESSAGE>` blocks
5. Use `.LIST` suffix for repeating collections
6. Files use UTF-16 LE encoding with BOM
7. Object elements use `NAME`, `RESERVEDNAME`, `ACTION`, and `OBJVIEW` attributes
