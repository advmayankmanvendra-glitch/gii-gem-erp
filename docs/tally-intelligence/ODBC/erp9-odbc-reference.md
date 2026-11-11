# Tally.ERP 9 ODBC Interface Reference

> Phase D — Tally Intelligence Layer
> Last updated: 2026-07-01

---

## 1. ODBC Architecture

Tally.ERP 9 implements a custom ODBC (Open Database Connectivity) interface that operates on a **two-in-one** model: Tally acts simultaneously as the **ODBC server** and the **ODBC driver**. There is no separate database server process — the Tally application itself listens on a TCP socket (default port 9000) and accepts ODBC client connections.

Key architectural points:

- **Self-contained**: No external RDBMS (no SQL Server, Oracle, etc.). Tally manages its own proprietary data store and exposes a subset of it through an ODBC-compatible wire protocol.
- **TCP-based**: Communication occurs over TCP/IP using a proprietary protocol layered on top of standard ODBC calls. Clients connect via `127.0.0.1:9000` (or any configured interface).
- **Single-threaded query model**: Tally processes ODBC queries sequentially. Concurrent client connections are queued.
- **Proprietary SQL dialect**: The SQL parser is built into Tally and supports a limited subset of SQL-92. It is NOT ANSI SQL — extensions and restrictions apply.
- **Direct engine access**: ODBC queries read directly from Tally's in-memory state and data files. No intermediate cache or snapshot layer exists.
- **No ODBC schema files**: Tally does not ship `.sql`, `.ddl`, or schema definition files. The schema is hard-coded into the Tally binary. Discovery must be done through `SQLTables` / `SQLColumns` ODBC calls or by consulting published documentation.

---

## 2. Configuration

### 2.1 tally.ini Settings

ODBC is enabled and configured in `tally.ini`, located in the Tally.ERP 9 installation directory (typically `C:\Program Files\Tally.ERP9\` or `%PROGRAMFILES%\Tally.ERP9\`).

| Setting | Description | Example |
|---|---|---|
| `ODBCServer` | Enable/disable the ODBC server component | `ODBCServer=Yes` |
| `ODBCPort` | TCP port for ODBC listener | `ODBCPort=9000` |
| `ODBCDataDirectory` | Path to company data files | `ODBCDataDirectory=C:\Users\Public\Tally.ERP9\Data` |

Full `tally.ini` ODBC section example:

```ini
[Configuration]
ODBCServer=Yes
ODBCPort=9000
ODBCDataDirectory=C:\Users\Public\Tally.ERP9\Data
```

### 2.2 TallyPrime v1.1.7

TallyPrime uses the same ODBC architecture with the following defaults:

| Setting | Value |
|---|---|
| `ODBCPort` | 9000 |
| Data directory | `C:\Users\Public\TallyPrime\data` |

### 2.3 Firewall Considerations

If connecting remotely (not recommended for production), port 9000 must be open in Windows Firewall:

```
netsh advfirewall firewall add rule name="Tally ODBC" dir=in action=allow protocol=TCP localport=9000
```

---

## 3. Connection Method

### 3.1 ODBC DSN (System or User DSN)

1. Open **ODBC Data Source Administrator** (`odbcad32.exe`).
2. Go to the **System DSN** or **User DSN** tab.
3. Click **Add**.
4. Select **Tally ODBC Driver** (registered by `regodbc32.exe`).
5. Configure:
   - **Data Source Name**: e.g. `TallyERP9`
   - **Server**: `localhost` (or remote IP)
   - **Port**: `9000`
6. Click **Test Connection**.

### 3.2 Connection String Formats

**ODBC DSN (Windows)**:
```
DSN=TallyERP9;SERVER=localhost;PORT=9000;
```

**DSN-less connection**:
```
DRIVER={Tally ODBC Driver};SERVER=localhost;PORT=9000;
```

**PowerShell / .NET (System.Data.Odbc)**:
```powershell
$conn = New-Object System.Data.Odbc.OdbcConnection
$conn.ConnectionString = "DSN=TallyERP9;SERVER=localhost;PORT=9000;"
$conn.Open()
```

**Python (pyodbc)**:
```python
import pyodbc
conn = pyodbc.connect("DSN=TallyERP9;SERVER=localhost;PORT=9000;")
```

**Excel / Power Query**:
- Data > Get Data > From Other Sources > From ODBC
- DSN or connection string as above

### 3.3 Authentication

Tally ODBC does not implement username/password authentication. Any client that can reach the TCP port can connect. This has security implications — the ODBC port should not be exposed outside trusted networks.

---

## 4. Tally ODBC Schema

The following tables are exposed by Tally's ODBC interface. All table and column names are uppercase.

### 4.1 Company Master

**Table**: `Company`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Unique company identifier |
| `NAME` | VARCHAR | Company name |
| `MAILINGNAME` | VARCHAR | Mailing/legal name |
| `ADDRESS` | VARCHAR | Registered address |
| `STATE` | VARCHAR | State for GST |
| `PINCODE` | VARCHAR | Postal code |
| `PHONE` | VARCHAR | Contact phone |
| `EMAIL` | VARCHAR | Contact email |
| `WEBSITE` | VARCHAR | Company website |
| `PAN` | VARCHAR | Permanent Account Number |
| `GSTNO` | VARCHAR | GST registration number |
| `CST` | VARCHAR | CST number |
| `TIN` | VARCHAR | TIN number |
| `SERVICETAXNO` | VARCHAR | Service tax registration |
| `LICENSENO` | VARCHAR | License number |
| `FANAME` | VARCHAR | Financial year name |
| `FROMDATE` | DATE | Financial year start |
| `TODATE` | DATE | Financial year end |
| `BOOKSBEGINNINGFROM` | DATE | Books opening date |
| `GUID` | VARCHAR | Unique identifier |

### 4.2 Chart of Accounts

**Table**: `Group`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Group identifier |
| `NAME` | VARCHAR | Group name |
| `PARENT` | VARCHAR | Parent group name |
| `GROUPNAME` | VARCHAR | Alias for name |
| `GROUPGUID` | VARCHAR | Parent group GUID |
| `NATUREOFGROUP` | VARCHAR | Nature (Assets/Liabilities/Income/Expense) |
| `AFFECTSGROSSPROFIT` | VARCHAR | Yes/No |
| `ISREVENUE` | VARCHAR | Yes/No |
| `NETDEBITCREDITBALANCE` | VARCHAR | Debit/Credit |
| `CANDELETE` | VARCHAR | Yes/No |

**Table**: `Ledger`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Ledger identifier |
| `NAME` | VARCHAR | Ledger name |
| `LEDGERNAME` | VARCHAR | Alias for name |
| `PARENT` | VARCHAR | Group name |
| `GROUPNAME` | VARCHAR | Group name |
| `GROUPGUID` | VARCHAR | Parent group GUID |
| `OPENINGBALANCE` | DOUBLE | Opening balance |
| `CLOSINGBALANCE` | DOUBLE | Closing balance (calculated) |
| `ADDRESS` | VARCHAR | Party address |
| `STATE` | VARCHAR | State |
| `PINCODE` | VARCHAR | Postal code |
| `PHONE` | VARCHAR | Phone number |
| `EMAIL` | VARCHAR | Email |
| `PAN` | VARCHAR | PAN number |
| `GSTNO` | VARCHAR | GST number |
| `TIN` | VARCHAR | TIN number |
| `CST` | VARCHAR | CST number |
| `SERVICETAXNO` | VARCHAR | Service tax number |
| `BANKNAME` | VARCHAR | Bank name |
| `BRANCHNAME` | VARCHAR | Bank branch |
| `ACCOUNTNUMBER` | VARCHAR | Bank account number |
| `IFSCCODE` | VARCHAR | IFSC code |
| `SWIFTCODE` | VARCHAR | SWIFT code |
| `MICRCODE` | VARCHAR | MICR code |
| `CANDELETE` | VARCHAR | Yes/No |

### 4.3 Stock Masters

**Table**: `StockGroup`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Group identifier |
| `NAME` | VARCHAR | Stock group name |
| `PARENT` | VARCHAR | Parent stock group |
| `GROUPNAME` | VARCHAR | Group name |
| `GROUPGUID` | VARCHAR | Parent group GUID |
| `CANDELETE` | VARCHAR | Yes/No |

**Table**: `StockItem`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Item identifier |
| `NAME` | VARCHAR | Item name |
| `STOCKITEMNAME` | VARCHAR | Alias |
| `PARENT` | VARCHAR | Stock group name |
| `GROUPNAME` | VARCHAR | Stock group name |
| `GROUPGUID` | VARCHAR | Stock group GUID |
| `UNITS` | VARCHAR | Base unit name |
| `BASEUNITS` | VARCHAR | Base unit |
| `ADDITIONALUNITS` | VARCHAR | Additional unit |
| `GSTAPPLICABLE` | VARCHAR | Yes/No |
| `GSTTYPEOFSUPPLY` | VARCHAR | Supply type |
| `HSNCODE` | VARCHAR | HSN/SAC code |
| `HSCCODE` | VARCHAR | Alias for HSN |
| `RATEOFDUTY` | DOUBLE | Tax rate |
| `OPENINGSTOCK` | DOUBLE | Opening stock quantity |
| `OPENINGSTOCKVALUE` | DOUBLE | Opening stock value |
| `CLOSINGSTOCK` | DOUBLE | Closing stock quantity |
| `CLOSINGSTOCKVALUE` | DOUBLE | Closing stock value |
| `RATE` | DOUBLE | Selling rate |
| `AVGRATE` | DOUBLE | Average rate |
| `STDVAR` | VARCHAR | Standard variation |
| `CANDELETE` | VARCHAR | Yes/No |
| `GUID` | VARCHAR | Identifier |

**Table**: `Unit`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Unit identifier |
| `NAME` | VARCHAR | Unit name |
| `SYMBOL` | VARCHAR | Symbol |
| `FORMALNAME` | VARCHAR | Formal name |
| `DECIMALPLACES` | INT | Decimal places |
| `NUMBEROFDECIMALPLACES` | INT | Same as above |
| `CANDELETE` | VARCHAR | Yes/No |

**Table**: `Godown`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Godown identifier |
| `NAME` | VARCHAR | Godown name |
| `PARENT` | VARCHAR | Parent godown |
| `GROUPNAME` | VARCHAR | Group name |
| `GROUPGUID` | VARCHAR | Parent group GUID |
| `ADDRESS` | VARCHAR | Address |
| `CANDELETE` | VARCHAR | Yes/No |

### 4.4 Voucher Types

**Table**: `VoucherType`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Voucher type identifier |
| `NAME` | VARCHAR | Voucher type name |
| `VOUCHERTYPENAME` | VARCHAR | Alias |
| `PARENT` | VARCHAR | Parent type |
| `USEFORPOSINVOICE` | VARCHAR | Yes/No |
| `USEFORJOURNAL` | VARCHAR | Yes/No |
| `USEFORPAYMENT` | VARCHAR | Yes/No |
| `USEFORRECEIPT` | VARCHAR | Yes/No |
| `USEFORSALES` | VARCHAR | Yes/No |
| `USEFORPURCHASE` | VARCHAR | Yes/No |
| `USEFORCREDITNOTE` | VARCHAR | Yes/No |
| `USEFORDEBITNOTE` | VARCHAR | Yes/No |
| `CANDELETE` | VARCHAR | Yes/No |

### 4.5 Voucher Entry Tables

**Table**: `Voucher`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Voucher identifier |
| `VOUCHERNUMBER` | VARCHAR | Voucher number |
| `VOUCHERTYPENAME` | VARCHAR | Voucher type |
| `DATE` | DATE | Voucher date |
| `POSTEDDATE` | DATE | Posting date |
| `NARRATION` | VARCHAR | Narration / memo |
| `PARTYLEDGERNAME` | VARCHAR | Party ledger (for sales/purchase) |
| `PARTYGSTIN` | VARCHAR | Party GSTIN |
| `PARTYADDRESS` | VARCHAR | Party address on voucher |
| `PARTYSTATE` | VARCHAR | Party state |
| `ISGST` | INT | GST flag (0/1) |
| `GSTNARRATION` | VARCHAR | GST narration |
| `TAXTYPE` | VARCHAR | Tax type |
| `ISOPTIONAL` | VARCHAR | Yes/No |
| `ISCANCELLED` | VARCHAR | Yes/No |
| `ELECTRONICTYPEOFDEALING` | VARCHAR | e-commerce flag |
| `DIFFERENTIALAMOUNT` | DOUBLE | Differential amt |
| `EFFECTIVEDATE` | DATE | Effective date |
| `CREATEDDATE` | DATE | Entry creation date |
| `ALTEREDDATE` | DATE | Last modified date |
| `ENTEREDBY` | VARCHAR | Created by user |
| `ALTEREDBY` | VARCHAR | Modified by user |

### 4.6 Accounting Tables

**Table**: `VoucherAccounting`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Line identifier |
| `VOUCHERGUID` | VARCHAR | Parent voucher GUID |
| `VOUCHERNUMBER` | VARCHAR | Voucher number |
| `DATE` | DATE | Voucher date |
| `LEDGERNAME` | VARCHAR | Ledger account |
| `LEDGERGUID` | VARCHAR | Ledger GUID |
| `GROUPNAME` | VARCHAR | Group name |
| `AMOUNT` | DOUBLE | Debit (positive) or Credit (negative) |
| `DEBITAMOUNT` | DOUBLE | Debit amount |
| `CREDITAMOUNT` | DOUBLE | Credit amount |
| `NARRATION` | VARCHAR | Line narration |
| `BILLNAME` | VARCHAR | Bill reference name |
| `BILLGUID` | VARCHAR | Bill reference GUID |
| `BATCHNAME` | VARCHAR | Batch allocation ref |
| `COSTCENTRENAME` | VARCHAR | Cost centre name |
| `COSTCENTREGUID` | VARCHAR | Cost centre GUID |

### 4.7 Inventory Tables

**Table**: `VoucherInventory`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Line identifier |
| `VOUCHERGUID` | VARCHAR | Parent voucher GUID |
| `VOUCHERNUMBER` | VARCHAR | Voucher number |
| `DATE` | DATE | Voucher date |
| `STOCKITEMNAME` | VARCHAR | Stock item name |
| `STOCKITEMGUID` | VARCHAR | Stock item GUID |
| `GROUPNAME` | VARCHAR | Stock group |
| `BATCHNAME` | VARCHAR | Batch/lot name |
| `GODOWNNAME` | VARCHAR | Godown |
| `RATE` | DOUBLE | Rate per unit |
| `AMOUNT` | DOUBLE | Line total |
| `QUANTITY` | DOUBLE | Quantity |
| `BILLNAME` | VARCHAR | Bill reference |
| `BILLGUID` | VARCHAR | Bill reference GUID |
| `NARRATION` | VARCHAR | Line narration |
| `ADDITIONALDETAILS` | VARCHAR | Additional details |
| `DESTINATIONGODOWN` | VARCHAR | Destination godown (transfers) |
| `SOURCEGODOWN` | VARCHAR | Source godown (transfers) |

### 4.8 Bill-wise Details

**Table**: `Billwise`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Line identifier |
| `VOUCHERGUID` | VARCHAR | Parent voucher GUID |
| `VOUCHERNUMBER` | VARCHAR | Voucher number |
| `DATE` | DATE | Voucher date |
| `LEDGERNAME` | VARCHAR | Ledger name |
| `BILLNAME` | VARCHAR | Bill name / reference |
| `BILLTYPE` | VARCHAR | Bill type (New/Agst Ref/On Account/Advance) |
| `AMOUNT` | DOUBLE | Amount |
| `AMOUNTDUE` | DOUBLE | Amount due |
| `CLOSINGBALANCE` | DOUBLE | Closing balance |
| `PERCENTAGE` | DOUBLE | Allocation percentage |

**Bill Type values**: `New Ref`, `Agst Ref`, `On Account`, `Advance`

### 4.9 Cost Centre / Cost Category

**Table**: `CostCentre`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Cost centre identifier |
| `NAME` | VARCHAR | Cost centre name |
| `CATEGORY` | VARCHAR | Cost category name |
| `CATEGORYGUID` | VARCHAR | Cost category GUID |
| `CANDELETE` | VARCHAR | Yes/No |

**Table**: `CostCategory`

| Column | Type | Description |
|---|---|---|
| `GUID` | VARCHAR | Category identifier |
| `NAME` | VARCHAR | Category name |
| `ALLOCATIONOF` | VARCHAR | Allocation method |
| `CANDELETE` | VARCHAR | Yes/No |

---

## 5. regodbc32.exe

### 5.1 Purpose

`regodbc32.exe` (~2.5 MB) is Tally's ODBC driver registration utility. It installs the Tally ODBC Driver into the Windows ODBC Driver Manager so that client applications (Excel, Power BI, custom apps) can discover and use the driver via DSN entries.

### 5.2 Usage

| Command | Action |
|---|---|
| `regodbc32.exe /reg` | Register (install) the ODBC driver |
| `regodbc32.exe /unreg` | Unregister (remove) the ODBC driver |
| `regodbc32.exe /silent` | Run silently (no UI) |

Registration adds entries to `HKEY_LOCAL_MACHINE\SOFTWARE\ODBC\ODBCINST.INI` with driver name `Tally ODBC Driver`.

### 5.3 Typical Installation Path

```
C:\Program Files\Tally.ERP9\regodbc32.exe
```

### 5.4 Re-registration

After Tally re-installation or if ODBC connections fail, re-run:

```cmd
regodbc32.exe /unreg
regodbc32.exe /reg
```

Admin privileges may be required.

---

## 6. Known Limitations of Tally ODBC

### 6.1 Read-Only Access

Tally ODBC is **read-only**. No INSERT, UPDATE, DELETE, or DDL statements are supported. Writing data back to Tally requires XML import (`Tally.ERP9\Import` functionality) or the Tally Developer API.

### 6.2 Limited SQL Support

The SQL parser supports a subset of SQL-92. Notable restrictions:

| Feature | Support | Notes |
|---|---|---|
| `SELECT` | Yes | Required columns or `*` |
| `WHERE` | Partial | Some operators may not work |
| `AND` / `OR` | Yes | |
| `IN` | Partial | May fail with large lists |
| `LIKE` | Partial | Wildcard support varies |
| `ORDER BY` | Yes | Single column, ASC/DESC |
| `GROUP BY` | Limited | May return unexpected results |
| `HAVING` | No | |
| `JOIN` | No (early versions) | Some later versions support limited JOIN |
| Subqueries | No | |
| Aggregate functions | Partial | `SUM`, `COUNT`, `MAX`, `MIN` may work on some tables |
| `DISTINCT` | Yes | |
| `TOP` / `LIMIT` | No | Use `WHERE` filters to reduce data |

### 6.3 No JOIN Support (Pre-TallyPrime)

In Tally.ERP 9, JOINs between tables (e.g. `Voucher` JOIN `VoucherAccounting`) are **not supported**. Data must be fetched separately and joined in the client application. TallyPrime v1.1.7 reportedly adds limited JOIN capability.

### 6.4 Performance Issues

- **Full table scans**: Most queries trigger a full table scan. There is no query optimisation or index usage.
- **Serial execution**: All ODBC requests are processed sequentially. Concurrent connections queue up.
- **Large dataset degradation**: Queries on companies with >100k vouchers can take 30+ seconds.
- **Memory impact**: ODBC queries cause Tally to load all relevant data into memory, increasing Tally's RAM usage.
- **No pagination**: There is no server-side cursor or pagination. Fetching a partial result set is not possible — the entire result must be generated and transmitted.

### 6.5 Character Encoding Issues

- The driver uses the system's default ANSI code page (Windows-1252 for English systems).
- Unicode characters (e.g. Hindi, Tamil, Gujarati text in party names) may be corrupted or appear as `?`.
- Tally.ERP 9 stores data in UTF-16 internally, but the ODBC driver translates to ANSI on output.
- TallyPrime improves this with UTF-8 support in later versions.

### 6.6 Other Limitations

- **No multiple companies in one query**: The DSN connects to one company at a time (the currently open company in Tally).
- **Tally must be running**: ODBC queries fail if Tally is not running.
- **Company must be open**: The target company must be loaded (opened) in Tally's UI.
- **Port conflicts**: Only one ODBC listener per Tally instance per port.
- **No SSL/TLS**: All traffic is plain TCP. Credentials (though none are used) and data are not encrypted.
- **32-bit driver limitation**: `regodbc32.exe` registers a 32-bit driver. 64-bit applications may need the 32-bit ODBC Administrator (`%windir%\SysWOW64\odbcad32.exe`).

---

## 7. ODBC vs XML Export Comparison

| Aspect | ODBC | XML Export |
|---|---|---|
| **Access model** | Live query via TCP | File-based export |
| **Data freshness** | Real-time (as of last save) | Snapshot at export time |
| **Performance** | Slow for large datasets, serial | Fast (file write, then process) |
| **Filtering** | WHERE clauses (limited) | Pre-filter via Tally UI or TDL |
| **JOINs** | Not supported (ERP9) | Only via post-processing |
| **Unicode** | May be corrupted | Native UTF-16 / UTF-8 |
| **Automation** | Direct programmatic access | Requires export trigger + file parsing |
| **Setup** | DSN + driver registration | Tally export menu or TDL automation |
| **Reliability** | Connection drops, timeouts | Deterministic (file either exists or not) |
| **Use case** | Ad-hoc queries, small datasets, dashboards | Bulk ETL, data warehousing, archival |
| **Security** | No auth, plain-text TCP | File-system level only |
| **Tooling** | Excel, Power BI, ODBC clients | XSLT, XML parsers, ETL pipelines |

### When to use ODBC

- Real-time dashboarding (small to medium datasets)
- Quick lookups and ad-hoc analysis
- Integration with tools that only support ODBC (e.g. legacy reporting)
- Prototyping and schema discovery

### When to use XML Export

- Bulk data extraction (full company data)
- Scheduled ETL pipelines (nightly exports)
- Unicode / multilingual data
- Data archival and versioned snapshots
- Avoiding runtime dependency on Tally

---

## 8. Setup Guide

### 8.1 Enable ODBC in Tally.ERP 9

1. Close Tally.ERP 9 if running.
2. Open `tally.ini` in the Tally installation directory (e.g. `C:\Program Files\Tally.ERP9\tally.ini`).
3. Ensure the following lines exist under `[Configuration]`:

   ```ini
   ODBCServer=Yes
   ODBCPort=9000
   ODBCDataDirectory=C:\Users\Public\Tally.ERP9\Data
   ```

4. Save the file.
5. Start Tally.ERP 9.
6. Open a company (or create one).

### 8.2 Register ODBC Driver

Run `regodbc32.exe` as Administrator:

```cmd
"C:\Program Files\Tally.ERP9\regodbc32.exe" /reg
```

Verify registration in Registry:

```cmd
reg query HKLM\SOFTWARE\ODBC\ODBCINST.INI /s | findstr "Tally"
```

### 8.3 Create System DSN (Windows)

1. Open **ODBC Data Source Administrator (32-bit)**:
   - 64-bit Windows: `%windir%\SysWOW64\odbcad32.exe`
   - 32-bit Windows: `%windir%\system32\odbcad32.exe`
2. **System DSN** tab > **Add**.
3. Select **Tally ODBC Driver**.
4. Enter:
   - **Data Source Name**: `TallyERP9_Live`
   - **Server**: `localhost`
   - **Port**: `9000`
5. Click **OK**.
6. Click **Test Connection** to verify.

### 8.4 Test Connection (Python)

```powershell
python -c "
import pyodbc
conn = pyodbc.connect('DSN=TallyERP9_Live;SERVER=localhost;PORT=9000;')
cursor = conn.cursor()
cursor.execute('SELECT NAME, MAILINGNAME FROM Company')
for row in cursor.fetchall():
    print(row)
conn.close()
"
```

### 8.5 Test Connection (PowerShell)

```powershell
$conn = New-Object System.Data.Odbc.OdbcConnection
$conn.ConnectionString = "DSN=TallyERP9_Live;SERVER=localhost;PORT=9000;"
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT NAME, MAILINGNAME FROM Company"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Host "$($reader['NAME']) - $($reader['MAILINGNAME'])"
}
$reader.Close()
$conn.Close()
```

### 8.6 Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `[Tally ODBC Driver]Driver not capable` | Query uses unsupported SQL | Simplify the SQL statement |
| `[Tally ODBC Driver]Cannot open a company` | No company is open in Tally | Open a company in Tally's UI |
| `[Tally ODBC Driver]Connection refused` | Tally not running or ODBC disabled | Check `tally.ini`, restart Tally |
| `[Tally ODBC Driver]Communication link failure` | Port 9000 blocked or wrong port | Verify port with `netstat -an \| findstr 9000` |
| `Data source name not found and no default driver specified` | Driver not registered | Run `regodbc32.exe /reg` as admin |
| Garbled/missing unicode text | ANSI code page limitation | Use XML export instead |
| Performance timeout on large queries | Full table scan of large dataset | Filter with WHERE; consider XML export |

### 8.7 Verify ODBC Listener is Active

```cmd
netstat -an | findstr ":9000"
```

Expected output: `TCP 0.0.0.0:9000 0.0.0.0:0 LISTENING`

### 8.8 Port Conflict Resolution

If another service uses port 9000, change the ODBC port in `tally.ini`:

```ini
ODBCPort=9001
```

Update the DSN `PORT` value accordingly.

---

## Appendix A: Quick SQL Query Examples

```sql
-- List all companies
SELECT GUID, NAME, MAILINGNAME, FROMDATE, TODATE FROM Company;

-- All ledgers with group and balance
SELECT NAME, PARENT, OPENINGBALANCE, CLOSINGBALANCE FROM Ledger;

-- Stock items with group and HSN
SELECT NAME, PARENT, UNITS, HSNCODE, CLOSINGSTOCK, CLOSINGSTOCKVALUE FROM StockItem;

-- Recent vouchers (last 30 days)
SELECT VOUCHERNUMBER, VOUCHERTYPENAME, DATE, PARTYLEDGERNAME, NARRATION
FROM Voucher
WHERE DATE >= '01-Jun-2026';

-- Accounting entries for a specific voucher
SELECT LEDGERNAME, DEBITAMOUNT, CREDITAMOUNT, NARRATION
FROM VoucherAccounting
WHERE VOUCHERNUMBER = '123';

-- Inventory details for sales vouchers
SELECT STOCKITEMNAME, QUANTITY, RATE, AMOUNT, GODOWNNAME
FROM VoucherInventory
WHERE VOUCHERTYPENAME = 'Sales';
```

---

## Appendix B: File Locations Summary

| Component | Path |
|---|---|
| Tally.ERP 9 Installation | `C:\Program Files\Tally.ERP9\` |
| tally.ini | `C:\Program Files\Tally.ERP9\tally.ini` |
| regodbc32.exe | `C:\Program Files\Tally.ERP9\regodbc32.exe` |
| Company data (ERP9) | `C:\Users\Public\Tally.ERP9\Data\` |
| Company data (TallyPrime) | `C:\Users\Public\TallyPrime\data\` |
| ODBC Admin (32-bit, 64-bit OS) | `%windir%\SysWOW64\odbcad32.exe` |
| ODBC Admin (32-bit, 32-bit OS) | `%windir%\system32\odbcad32.exe` |
