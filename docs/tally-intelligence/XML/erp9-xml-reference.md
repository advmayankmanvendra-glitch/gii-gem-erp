# Tally.ERP 9 XML Export Reference

## 1. Installation State

The Tally.ERP 9 installation at `C:\Program Files\Tally\Tally.ERP9` contains **no XML export files** and **no company data**. The user data directory `C:\Users\Public\Tally.ERP9\Data` is empty. Because no company has been set up, Tally.ERP 9 has never generated any XML exports.

This document describes the **expected** TallyXML structure based on standard TallyXML format knowledge and validated against an active TallyPrime v1.1.7 installation (see Section 6).

---

## 2. TallyXML Envelope Structure

Every TallyXML document is wrapped in a root `<ENVELOPE>` element with three nested sections:

```
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>...</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>...</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        ... repeated <TALLYMESSAGE> blocks ...
      </REQUESTDATA>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
```

### 2.1 HEADER

| Element | Value | Description |
|---|---|---|
| `<TALLYREQUEST>` | `Export Data` | Indicates data is being exported from Tally |
| `<TALLYREQUEST>` | `Import Data` | Indicates data is being imported into Tally |

For exports, `Export Data` is used; for imports, `Import Data`. The document structure is identical otherwise (the TallyPrime export files use `Import Data` because they are designed to be re-imported).

### 2.2 BODY

The body contains either `<EXPORTDATA>` (for exports) or `<IMPORTDATA>` (for imports).

#### 2.2.1 REQUESTDESC

| Element | Description |
|---|---|
| `<REPORTNAME>` | The logical report name, e.g. `All Masters` |
| `<STATICVARIABLES>` | Container for static context variables |
| `<SVCURRENTCOMPANY>` | The company name from which data was exported |

#### 2.2.2 REQUESTDATA

Contains one or more `<TALLYMESSAGE>` elements. Each `<TALLYMESSAGE>` wraps a single data record.

---

## 3. Master Data Elements

Each master record appears inside a `<TALLYMESSAGE>` element. The opening tag carries the element name as the record type and a `NAME` attribute with the master name. Common attributes:

| Attribute | Applies To | Description |
|---|---|---|
| `NAME` | All masters | The display name of the record |
| `RESERVEDNAME` | Groups, Voucher Types | Internal reserved name (often same as NAME) |
| `ACTION` | Vouchers | `Create` when exporting data |

### 3.1 GROUP

Defines an accounting group (e.g., Bank Accounts, Sundry Debtors).

```
<GROUP NAME="Bank Accounts" RESERVEDNAME="Bank Accounts">
  <GUID>uuid</GUID>
  <PARENT>Current Assets</PARENT>
  <ISBILLWISEON>No</ISBILLWISEON>
  <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
  <ISADDABLE>No</ISADDABLE>
  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  <SORTPOSITION> 220</SORTPOSITION>
  <ALTERID> 5248</ALTERID>
</GROUP>
```

| Sub-element | Description |
|---|---|
| `<GUID>` | Globally unique identifier |
| `<PARENT>` | Name of the parent group |
| `<ISBILLWISEON>` | Whether bill-wise tracking is enabled (`Yes`/`No`) |
| `<ISCOSTCENTRESON>` | Whether cost centre tracking is enabled |
| `<ISADDABLE>` | Whether new ledgers can be added under this group |
| `<ISDEEMEDPOSITIVE>` | Whether the group has a natural debit balance (`Yes`) or credit balance |
| `<SORTPOSITION>` | Display sort order position |
| `<ALTERID>` | Internal Tally alter ID |

### 3.2 LEDGER

Defines an accounting ledger under a group.

```
<LEDGER NAME="Cash" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <PARENT>Cash-in-Hand</PARENT>
  <OPENINGBALANCE>0</OPENINGBALANCE>
  <ISBILLWISEON>No</ISBILLWISEON>
  <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
  <ALTERID> 5301</ALTERID>
</LEDGER>
```

| Sub-element | Description |
|---|---|
| `<PARENT>` | The group under which this ledger is classified |
| `<OPENINGBALANCE>` | Opening balance amount |
| `<ISBILLWISEON>` | Bill-wise tracking enabled |
| `<ISCOSTCENTRESON>` | Cost centre tracking enabled |

### 3.3 STOCKGROUP

Defines an inventory stock group.

```
<STOCKGROUP NAME="Raw Material" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <PARENT/>
  <COSTINGMETHOD>Avg. Cost</COSTINGMETHOD>
  <VALUATIONMETHOD>Avg. Price</VALUATIONMETHOD>
  <BASEUNITS>PCS</BASEUNITS>
  <ISBATCHWISEON>No</ISBATCHWISEON>
  <ISADDABLE>No</ISADDABLE>
</STOCKGROUP>
```

### 3.4 STOCKITEM

Defines an inventory stock item.

```
<STOCKITEM NAME="Cement 50kg" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <PARENT>Raw Material</PARENT>
  <BASEUNITS>BAG</BASEUNITS>
  <OPENINGBALANCE>1000</OPENINGBALANCE>
  <OPENINGVALUE>50000</OPENINGVALUE>
  <GSTAPPLICABLE>Yes</GSTAPPLICABLE>
  <HSNCODE>2523.29</HSNCODE>
</STOCKITEM>
```

### 3.5 UNIT

Defines a unit of measurement.

```
<UNIT NAME="BAG" RESERVEDNAME="">
  <NAME>BAG</NAME>
  <GUID>uuid</GUID>
  <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
  <ALTERID> 5978</ALTERID>
</UNIT>
```

| Sub-element | Description |
|---|---|
| `<ISSIMPLEUNIT>` | `Yes` for simple units, `No` for compound units |
| `<REPORTINGUQCDETAILS.LIST>` | GST reporting UQC mapping details |

### 3.6 GODOWN

Defines a warehouse/storage location.

```
<GODOWN NAME="Main Store" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <PARENT/>
</GODOWN>
```

### 3.7 CURRENCY

Defines a currency master.

```
<CURRENCY NAME="?" RESERVEDNAME="">
  <MAILINGNAME>INR</MAILINGNAME>
  <ORIGINALNAME>?</ORIGINALNAME>
  <EXPANDEDSYMBOL>INR</EXPANDEDSYMBOL>
  <DECIMALSYMBOL>paise</DECIMALSYMBOL>
  <DECIMALPLACES> 2</DECIMALPLACES>
  <ISSUFFIX>No</ISSUFFIX>
  <HASSPACE>Yes</HASSPACE>
  <INMILLIONS>No</INMILLIONS>
</CURRENCY>
```

### 3.8 COSTCENTRE

Defines a cost centre for Profit & Loss allocation.

```
<COSTCENTRE NAME="Marketing" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <CATEGORY>Primary Cost Category</CATEGORY>
</COSTCENTRE>
```

### 3.9 COSTCATEGORY

Defines a cost category that groups cost centres.

```
<COSTCATEGORY NAME="Primary Cost Category" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <ALLOCATEREVENUE>Yes</ALLOCATEREVENUE>
  <ALLOCATENONREVENUE>Yes</ALLOCATENONREVENUE>
</COSTCATEGORY>
```

### 3.10 VOUCHERTYPE

Defines a voucher type configuration.

```
<VOUCHERTYPE NAME="Receipt" RESERVEDNAME="Receipt">
  <GUID>uuid</GUID>
  <PARENT>Receipt</PARENT>
  <MAILINGNAME>Rct</MAILINGNAME>
  <NUMBERINGMETHOD>Automatic</NUMBERINGMETHOD>
  <ISACTIVE>Yes</ISACTIVE>
  <USEZEROENTRIES>No</USEZEROENTRIES>
</VOUCHERTYPE>
```

### 3.11 EMPLOYEE

Defines an employee master (Payroll).

```
<EMPLOYEE NAME="John Doe" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <EMPLOYEEGROUP>Staff</EMPLOYEEGROUP>
  <DATEOFJOINING>20240101</DATEOFJOINING>
</EMPLOYEE>
```

### 3.12 ATTENDANCE / ATTENDANCETYPE

Defines attendance types used in payroll.

```
<ATTENDANCE NAME="Present" RESERVEDNAME="">
  <GUID>uuid</GUID>
  <ATTENDANCEPRODUCTION>No</ATTENDANCEPRODUCTION>
  <ATTENDANCEPERIOD>Month</ATTENDANCEPERIOD>
</ATTENDANCE>
```

---

## 4. Transaction Data: VOUCHER

Vouchers are the primary transaction element.

```
<VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
  <DATE>20260302</DATE>
  <GUID>uuid</GUID>
  <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
  <VOUCHERNUMBER>137</VOUCHERNUMBER>
  <PARTYLEDGERNAME>CENTRAL PUBLIC WORKS DEPARTMENT</PARTYLEDGERNAME>
  <EFFECTIVEDATE>20260302</EFFECTIVEDATE>
  <ISDELETED>No</ISDELETED>
  <AUDITED>No</AUDITED>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERENTRY>
      <LEDGERNAME>Cash</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <AMOUNT>50000.00</AMOUNT>
    </LEDGERENTRY>
    <LEDGERENTRY>
      <LEDGERNAME>CENTRAL PUBLIC WORKS DEPARTMENT</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>-50000.00</AMOUNT>
    </LEDGERENTRY>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
```

### 4.1 VOUCHER Attributes

| Attribute | Description |
|---|---|
| `VCHTYPE` | Voucher type name (e.g., `Receipt`, `Payment`, `Sales`, `Purchase`, `Journal`, `Contra`, `Credit Note`, `Debit Note`) |
| `ACTION` | `Create` for new records, `Alter` for modifications |
| `OBJVIEW` | View type: `Accounting Voucher View`, `Inventory Voucher View`, `Payroll Voucher View` |
| `VCHKEY` | Internal voucher key (compound ID) |
| `REMOTEID` | Remote synchronization ID |

### 4.2 VOUCHER Sub-elements

| Sub-element | Description |
|---|---|
| `<DATE>` | Voucher date in YYYYMMDD format |
| `<GUID>` | Globally unique identifier |
| `<VOUCHERTYPENAME>` | The voucher type name |
| `<VOUCHERNUMBER>` | The voucher number |
| `<PARTYLEDGERNAME>` | The primary party ledger for this voucher |
| `<EFFECTIVEDATE>` | Effective date (may differ from DATE) |
| `<NARRATION>` | Voucher narration text |
| `<ISDELETED>` | Deletion flag |
| `<AUDITED>` | Audit status |
| `<ALLLEDGERENTRIES.LIST>` | Container for ledger entry lines |
| `<INVENTORYENTRIES.LIST>` | Container for inventory entry lines |

### 4.3 LEDGERENTRY

Each entry inside `<ALLLEDGERENTRIES.LIST>`:

| Element | Description |
|---|---|
| `<LEDGERNAME>` | Name of the ledger |
| `<ISDEEMEDPOSITIVE>` | Whether the entry is debit (`Yes`) or credit (`No`) |
| `<AMOUNT>` | Transaction amount (positive for debits, negative for credits) |
| `<BILLALLOCATIONS.LIST>` | Bill-wise allocation details |
| `<COSTALLOCATIONS.LIST>` | Cost centre allocation details |

### 4.4 Common VCHTYPE Values

| VCHTYPE | Description |
|---|---|
| `Receipt` | Money received |
| `Payment` | Money paid |
| `Sales` | Sales invoice |
| `Purchase` | Purchase invoice |
| `Contra` | Contra entry (transfer between cash/bank) |
| `Journal` | Journal entry |
| `Credit Note` | Credit note |
| `Debit Note` | Debit note |
| `Attendance` | Attendance entry (Payroll) |
| `Payroll` | Payroll entry |

---

## 5. Known Limitations

### 5.1 UTF-16 LE Encoding with BOM

Tally.ERP 9 writes all XML files in **UTF-16 Little Endian** encoding with a **Byte Order Mark (BOM)** (0xFF 0xFE). Standard XML parsers expecting UTF-8 will fail. The `?` visible at byte position 0 in raw reads is the rendering of the BOM `0xFF 0xFE` when interpreted as a single-byte character set.

```
Byte offset 0: 0xFF (BOM byte 1)
Byte offset 1: 0xFE (BOM byte 2)
Byte offset 2: 0x3C ('<')
Byte offset 3: 0x00 (null byte, UTF-16 LE high byte)
```

Files must be read/decoded using `UTF-16LE` encoding. There is **no XML declaration** (`<?xml version="1.0" encoding="UTF-16"?>`) in Tally-generated XML files; the encoding is inferred solely from the BOM.

### 5.2 Non-Conformant XML (Repeated Tags Without Wrapping)

TallyXML is **NOT standard XML**. Multiple records of the same type appear as **repeated sibling elements** inside `<REQUESTDATA>` without an array wrapper element:

```xml
<REQUESTDATA>
  <TALLYMESSAGE>
    <GROUP NAME="Bank Accounts" RESERVEDNAME="Bank Accounts">...</GROUP>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <GROUP NAME="Current Assets" RESERVEDNAME="Current Assets">...</GROUP>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
    <LEDGER NAME="Cash" RESERVEDNAME="">...</LEDGER>
  </TALLYMESSAGE>
</REQUESTDATA>
```

Standard DOM parsers will either:
- Overwrite earlier elements with later ones of the same tag name, or
- Fail on duplicate keys.

Streaming/SAX parsers or Tally-specific XML libraries must be used.

### 5.3 List Suffix Convention

Collection sub-elements use the `.LIST` suffix:

| Element | Content |
|---|---|
| `<ALLLEDGERENTRIES.LIST>` | Contains `<LEDGERENTRY>` elements |
| `<INVENTORYENTRIES.LIST>` | Contains `<INVENTORYENTRY>` elements |
| `<BILLALLOCATIONS.LIST>` | Contains `<BILLALLOCATION>` elements |
| `<COSTALLOCATIONS.LIST>` | Contains `<COSTALLOCATION>` elements |
| `<LANGUAGENAME.LIST>` | Contains multi-language name mappings |

Some `.LIST` elements carry a `TYPE` or `MERGE` attribute:

```xml
<OLDAUDITENTRYIDS.LIST TYPE="Number">
  <OLDAUDITENTRYIDS>-1</OLDAUDITENTRYIDS>
</OLDAUDITENTRYIDS.LIST>
<REMOTECMPINFO.LIST MERGE="Yes">
  <NAME>uuid</NAME>
  <REMOTECMPNAME>Company Name</REMOTECMPNAME>
</REMOTECMPINFO.LIST>
```

### 5.4 Numeric and Date Formats

| Type | Format | Example |
|---|---|---|
| Date | `YYYYMMDD` (no separators) | `20260302` |
| DateTime | `YYYYMMDDHHmmssfff` (17 digits) | `20260413153843000` |
| Amount | Decimal with `.` separator, padded with spaces | ` 50000.00` |
| Boolean | `Yes` / `No` (not `true` / `false`) | Yes |
| Integer | Padded with leading space | ` 5248` |
| Null/Empty | Self-closing tag `<PARENT/>` or empty `<PARENT></PARENT>` | — |

### 5.5 No XML Declaration

Tally.ERP 9 **does not emit** an `<?xml?>` declaration. The BOM is the sole encoding indicator. This means:

- Files cannot be validated with `<?xml ...?>` expecting parsers.
- Some tools may fail to detect the encoding without the declaration.
- Parsers must be configured explicitly for UTF-16 LE.

### 5.6 Namespace Declaration

Each `<TALLYMESSAGE>` carries a namespace declaration:

```xml
<TALLYMESSAGE xmlns:UDF="TallyUDF">
```

The `UDF` prefix is used for user-defined fields. No other namespace is typically declared.

---

## 6. Reference: TallyPrime v1.1.7 XML Exports

The following export files exist at `C:\Program Files\TallyPrime\` from a populated TallyPrime installation. These serve as a real-world reference for the expected structure and scale.

| File | Size | Content |
|---|---|---|
| `Tally.xml` | 137 KB | Company metadata, DSPPERIOD data, display info |
| `GROUPS.xml` | 189 KB | Accounting group masters |
| `LEDGERS.xml` | 3.4 MB | Accounting ledger masters |
| `Stock Groups.xml` | 9 KB | Inventory stock group masters |
| `Stock Items.xml` | 7.4 MB | Inventory stock item masters |
| `Stock Categories.xml` | 1.5 KB | Stock category definitions |
| `VOUCHER TYPES.xml` | 213 KB | Voucher type configuration |
| `Accounting Master.xml` | 3.8 MB | Combined accounting masters (cost centres, categories, currencies, payroll) |
| `ALL INVENTORY MASTERS.xml` | 7.6 MB | Combined inventory masters (units, stock groups, stock items, godowns) |
| `Transactions.xml` | 4.8 MB | All voucher transactions |

All files use the envelope structure described in Section 2 with `TALLYREQUEST` set to `Import Data` and `SVCURRENTCOMPANY` pointing to the company name.

---

## 7. Export vs Import Request Types

Tally can produce XML for two purposes:

| TALLYREQUEST | BODY Element | Direction |
|---|---|---|
| `Export Data` | `<EXPORTDATA>` | Tally -> File |
| `Import Data` | `<IMPORTDATA>` | File -> Tally |

The structure of `<EXPORTDATA>` and `<IMPORTDATA>` is identical. The distinction is semantic: Tally exports typically set `TALLYREQUEST` to `Export Data`, while files intended for re-import use `Import Data`. The TallyPrime reference files all use `Import Data` because they were generated as importable snapshots.

---

## 8. Standard TallyXML Attributes

| Attribute | Used On | Purpose |
|---|---|---|
| `$ACTION` | DEPRECATED in modern Tally; use `ACTION` attribute | Create/Alter/Delete |
| `ACTION` | `<VOUCHER>`, `<UNIT>` | `Create`, `Alter`, `Delete` |
| `VCHTYPE` | `<VOUCHER>` | Identifies the voucher type |
| `NAME` | All master elements | The master name |
| `RESERVEDNAME` | Groups, Voucher Types | Internal system name |
| `CHILDOF` | (historical) | Parent-child relationship |
| `PARENT` | Sub-elements | Parent name in XML content (not attribute) |
| `REMOTEID` | `<VOUCHER>` | Remote sync GUID |
| `VCHKEY` | `<VOUCHER>` | Internal voucher compound key |
| `OBJVIEW` | `<VOUCHER>` | View type identifier |
| `MERGE` | `.LIST` elements | `Yes` to merge with existing data |
| `TYPE` | `.LIST` elements | Data type of list items (e.g., `String`, `Number`) |
