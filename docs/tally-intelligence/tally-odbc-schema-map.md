# Tally ODBC Schema Map

## Overview

TallyPrime provides an ODBC (Open Database Connectivity) interface that allows external applications to query live data using SQL. This document covers the ODBC configuration found in the installation and documents the known Tally ODBC schema for reference.

## ODBC Configuration

### tally.ini Settings

From `C:\Program Files\TallyPrime\tally.ini`:

```ini
Enable ODBC Server=Yes
ServerPort=9000
```

These settings enable Tally's HTTP-based ODBC server on TCP port 9000. External applications can connect by sending HTTP POST requests with XML payloads to `http://<tally-server>:9000`.

### No ODBC Driver Files Found

**Important**: The TallyPrime installation at `C:\Program Files\TallyPrime` does **not** contain:
- Any ODBC driver DLLs (e.g., `TallyODBC_*.dll`)
- ODBC schema documentation
- Sample connection strings or configuration scripts

The ODBC functionality is served directly by the `tally.exe` process through its HTTP listener on port 9000. Client machines would need to install the **Tally ODBC Driver** separately (typically available from Tally Solutions' website or the Tally installation media).

## Connection Method

### HTTP XML API (TallyREST)

Tally ODBC uses a REST-like interface where SQL queries are sent as XML via HTTP POST:

```
POST http://<server>:9000
Content-Type: application/xml
```

#### Request Format

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>HTTP</TALLYREQUEST>
  </HEADER>
  <BODY>
    <DESC>
      <REQUESTDESC>
        <REPORTNAME>Group</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
    </DESC>
  </BODY>
</ENVELOPE>
```

#### SQL-Like Query

```xml
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>HTTP</TALLYREQUEST>
  </HEADER>
  <BODY>
    <DESC>
      <TALLYREQUEST>HTTP</TALLYREQUEST>
      <HTTP>True</HTTP>
      <SQL>SELECT NAME, PARENT, OPENINGBALANCE FROM LEDGER</SQL>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
```

## Known Tally ODBC Table Structures

Based on the Tally data model, the following tables are available through ODBC. Column names in Tally ODBC may use slightly different naming conventions.

### ACCOUNTINGMASTER

| Column | Type | Source Field |
|--------|------|-------------|
| GROUPNAME | String | GROUP.NAME |
| PARENT | String | GROUP.PARENT |
| RESERVEDNAME | String | GROUP.RESERVEDNAME |
| ISDEEMEDPOSITIVE | String (Yes/No) | GROUP.ISDEEMEDPOSITIVE |

### LEDGER

| Column | Type | Source Field |
|--------|------|-------------|
| NAME | String | LEDGER.NAME |
| PARENT | String | LEDGER.PARENT |
| OPENINGBALANCE | Double | LEDGER.OPENINGBALANCE |
| OBSTATUS | String | LEDGER.OBSTATUS (Dr/Cr) |
| MAILINGNAME | String | LEDGER.MAILLINGNAME |
| CURRENCYSYMBOL | String | LEDGER.CURRENCYSYMBOL |

### STOCKGROUP

| Column | Type | Source Field |
|--------|------|-------------|
| NAME | String | STOCKGROUP.NAME |
| PARENT | String | STOCKGROUP.PARENT |
| COSTINGMETHOD | String | STOCKGROUP.COSTINGMETHOD |
| VALUATIONMETHOD | String | STOCKGROUP.VALUATIONMETHOD |
| BASEUNITS | String | STOCKGROUP.BASEUNITS |

### STOCKITEM

| Column | Type | Source Field |
|--------|------|-------------|
| NAME | String | STOCKITEM.NAME |
| PARENT | String | STOCKITEM.PARENT (Stock Group) |
| CATEGORYNAME | String | STOCKITEM.CATEGORYNAME |
| BASEUNITS | String | STOCKITEM.BASEUNITS |
| OPENINGBALANCE | Double | STOCKITEM.OPENINGBALANCE |
| OPENINGRATE | Double | STOCKITEM.OPENINGRATE |
| AVGRATE | Double | STOCKITEM.AVGRATE |

### VOUCHER

| Column | Type | Source Field |
|--------|------|-------------|
| DATE | Date | VOUCHER.DATE |
| VOUCHERTYPENAME | String | VOUCHER.VOUCHERTYPENAME |
| VOUCHERNUMBER | String | VOUCHER.VOUCHERNUMBER |
| PARTYLEDGERNAME | String | VOUCHER.PARTYLEDGERNAME |
| AMOUNT | Double | Sum of ledger entries |
| NARRATION | String | VOUCHER.NARRATION |
| CSTFORMISSUETYPE | String | VOUCHER.CSTFORMISSUETYPE |
| CMPGSTIN | String | VOUCHER.CMPGSTIN |

### LEDGERENTRIES

| Column | Type | Source Field |
|--------|------|-------------|
| VOUCHERGUID | GUID | Parent voucher GUID |
| LEDGERNAME | String | ALLLEDGERENTRIES.LIST.LEDGERNAME |
| AMOUNT | Double | ALLLEDGERENTRIES.LIST.AMOUNT |
| ISDEEMEDPOSITIVE | String | ALLLEDGERENTRIES.LIST.ISDEEMEDPOSITIVE |
| GSTTAXASSESSABLEVALUE | Double | ALLLEDGERENTRIES.LIST.GSTTAXASSESSABLEVALUE |

### INVENTORYENTRIES

| Column | Type | Source Field |
|--------|------|-------------|
| VOUCHERGUID | GUID | Parent voucher GUID |
| STOCKITEMNAME | String | INVENTORYENTRIESINVOICE.LIST.STOCKITEMNAME |
| RATE | Double | INVENTORYENTRIESINVOICE.LIST.RATE |
| AMOUNT | Double | INVENTORYENTRIESINVOICE.LIST.AMOUNT |
| ACTUALQTY | Double | INVENTORYENTRIESINVOICE.LIST.ACTUALQTY |
| BILLEDQTY | Double | INVENTORYENTRIESINVOICE.LIST.BILLEDQTY |
| GODOWNNAME | String | BATCHALLOCATIONS.LIST.GODOWNNAME |

### UNIT

| Column | Type | Source Field |
|--------|------|-------------|
| NAME | String | UNIT.NAME |
| ISSIMPLEUNIT | String | UNIT.ISSIMPLEUNIT |
| ADDITIONALUNITS | String | UNIT.ADDITIONALUNITS |
| REPORTINGUQCNAME | String | REPORTINGUQCDETAILS.LIST.REPORTINGUQCNAME |

## Connection via ODBC (Windows DSN)

If the Tally ODBC driver is installed on a client machine, a System DSN can be configured:

1. Open **ODBC Data Sources (32-bit or 64-bit)**
2. Add a new System DSN
3. Select **Tally ODBC Driver** from the list
4. Configure: Server Name (IP), Port (9000), Company Name
5. Test connection

### Connection String Examples

```
DSN=TallyODBC;Server=localhost;Port=9000;Company=GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED
```

## Limitations of ODBC Querying

- **Read-only**: ODBC interface is query-only; no inserts, updates, or deletes
- **Single company**: Each connection targets one company at a time
- **Performance**: Heavy queries may impact TallyPrime's responsiveness
- **No joins**: Complex relational joins may not work as in standard SQL
- **Limited SQL**: Only SELECT statements with basic WHERE, ORDER BY are supported
- **Date format**: Tally uses DD-MMM-YYYY format (e.g., `1-Apr-2025`)

## Data Access Recommendation

For the GII ERP migration, the exported XML files provide a **complete, static snapshot** of all data. The ODBC interface is useful for:

1. **Verification**: Cross-checking migrated data against live Tally
2. **Incremental sync**: Picking up new transactions after the initial export (if co-existence is needed)
3. **Reporting**: Building real-time dashboards that query Tally directly (temporary, during cut-over)

The XML export approach is preferred for initial bulk migration because:
- No live Tally dependency
- Complete data snapshot at a point in time
- Easier parsing with standard XML tools
- No performance impact on production Tally
