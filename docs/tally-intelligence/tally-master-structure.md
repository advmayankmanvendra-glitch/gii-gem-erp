# Tally Master Structure

## Overview

TallyPrime organizes financial and inventory data through a hierarchical master entity system. This document details each master entity, its XML representation (as exported from the company **GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED**, GSTIN: `10AAJCG3823D1Z7`, Bihar), and field-level mappings.

## 1. Accounting Groups (`GROUPS.xml`)

Groups form the chart of accounts hierarchy. Each group has a parent-child structure mirroring double-entry accounting conventions.

### XML Structure (one `<GROUP>` element per group)

```xml
<GROUP NAME="Bank Accounts" RESERVEDNAME="Bank Accounts">
  <GUID>ed172209-b3c3-4944-a6d6-7392f4ac0452-00000016</GUID>
  <PARENT>Current Assets</PARENT>
  <GRPDEBITPARENT/>
  <GRPCREDITPARENT/>
  <ISBILLWISEON>No</ISBILLWISEON>
  <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
  <ISADDABLE>No</ISADDABLE>
  <ASORIGINAL>Yes</ASORIGINAL>
  <ISSUBLEDGER>No</ISSUBLEDGER>
  <ISREVENUE>No</ISREVENUE>
  <AFFECTSGROSSPROFIT>No</AFFECTSGROSSPROFIT>
  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  <TRACKNEGATIVEBALANCES>Yes</TRACKNEGATIVEBALANCES>
  <SORTPOSITION> 220</SORTPOSITION>
  <ALTERID> 5248</ALTERID>
</GROUP>
```

### Field Mapping

| XML Field | Description | Data Type |
|-----------|-------------|-----------|
| `NAME` | Group name (e.g., "Bank Accounts") | String |
| `RESERVEDNAME` | System-reserved group name identifier | String |
| `GUID` | Unique identifier across all masters | GUID |
| `PARENT` | Parent group name (empty for root groups) | String |
| `ISBILLWISEON` | Enables bill-wise tracking | Yes/No |
| `ISCOSTCENTRESON` | Enables cost centre allocation | Yes/No |
| `ISADDABLE` | Allows adding ledgers directly | Yes/No |
| `ISDEEMEDPOSITIVE` | Expected normal balance (Yes=Debit, No=Credit) | Yes/No |
| `ISSUBLEDGER` | Acts as sub-ledger parent | Yes/No |
| `ISREVENUE` | Revenue nature group | Yes/No |
| `AFFECTSGROSSPROFIT` | Included in gross profit calculation | Yes/No |
| `SORTPOSITION` | Display sort order | Number |

### Predefined Group Hierarchy (Reserved Groups)

```
Primary (Root)
├── Current Assets (RESERVED)
│   ├── Bank Accounts (RESERVED)
│   ├── Cash-in-Hand (RESERVED)
│   ├── Deposits (Assets)
│   ├── Loans & Advances (Assets)
│   ├── Stock-in-Hand (RESERVED)
│   └── Sundry Debtors (RESERVED)
├── Fixed Assets (RESERVED)
├── Investments (RESERVED)
├── Miscellaneous Expenses (Assets)
├── Current Liabilities
│   ├── Duties & Taxes (RESERVED)
│   ├── Provisions
│   ├── Sundry Creditors (RESERVED)
│   └── Bank OD A/c (RESERVED)
├── Capital Account (RESERVED)
├── Loan (Liabilities)
│   ├── Secured Loans
│   ├── Unsecured Loans
├── Suspense A/c
├── Revenue Accounts
│   ├── Direct Income (RESERVED)
│   ├── Indirect Income (RESERVED)
│   ├── Direct Expenses (RESERVED)
│   ├── Indirect Expenses (RESERVED)
├── Sales Accounts (RESERVED)
├── Purchase Accounts (RESERVED)
```

## 2. Accounting Ledgers (`LEDGERS.xml`)

Ledgers are the actual accounting heads under which transactions are recorded.

### XML Structure

```xml
<LEDGER NAME="Axis Bank" RESERVEDNAME="">
  <GUID>ed172209-...-0000001b</GUID>
  <PARENT>Bank Accounts</PARENT>
  <ISBILLWISEON>No</ISBILLWISEON>
  <ISCOSTCENTRESON>No</ISCOSTCENTRESON>
  <OPENINGBALANCE>146923.83</OPENINGBALANCE>
  <OBSTATUS>Cr</OBSTATUS>
  <CURRENCYSYMBOL>&#x20;</CURRENCYSYMBOL>  <!-- INR symbol -->
  <ISCAPACCT>No</ISCAPACCT>
  <ISEFFECTIVEDATEFORCOSTCENTRE>No</ISEFFECTIVEDATEFORCOSTCENTRE>
  <SORTPOSITION> 620</SORTPOSITION>
  <ALTERID> 5253</ALTERID>
</LEDGER>
```

### Key Fields

| XML Field | Description |
|-----------|-------------|
| `NAME` | Ledger name |
| `PARENT` | Parent group name (links to GROUP.NAME) |
| `OPENINGBALANCE` | Opening balance amount |
| `OBSTATUS` | Opening balance sign: `Dr` (Debit) or `Cr` (Credit) |
| `CURRENCYSYMBOL` | Unicode currency symbol (&#x20; = INR) |
| `ISCAPACCT` | Capital account flag |
| `ISBILLWISEON` | Bill-wise tracking enabled |
| `ISCOSTCENTRESON` | Cost centre tracking enabled |
| `MAILLINGNAME` | Alternate name for reporting |

## 3. Stock Groups (`STOCK GROUPS.xml`)

Stock groups classify inventory items into hierarchical categories.

### XML Structure

```xml
<STOCKGROUP NAME="1" RESERVEDNAME="">
  <GUID>ed172209-...-000000f7</GUID>
  <PARENT/>
  <COSTINGMETHOD>Avg. Cost</COSTINGMETHOD>
  <VALUATIONMETHOD>Avg. Price</VALUATIONMETHOD>
  <BASEUNITS>PCS</BASEUNITS>
  <ADDITIONALUNITS/>
  <ISBATCHWISEON>No</ISBATCHWISEON>
  <ISPERISHABLEON>No</ISPERISHABLEON>
  <IGNORENEGATIVESTOCK>No</IGNORENEGATIVESTOCK>
  <IGNOREGODOWNS>No</IGNOREGODOWNS>
  <ALTERID> 5399</ALTERID>
</STOCKGROUP>
```

### Fields

| Field | Values Found | Description |
|-------|-------------|-------------|
| `COSTINGMETHOD` | `Avg. Cost` | Method used for cost calculation |
| `VALUATIONMETHOD` | `Avg. Price` | Method used for inventory valuation |
| `BASEUNITS` | `PCS`, `BAG`, `BOX`, etc. | Primary unit of measure |
| `ISBATCHWISEON` | `No` | Batch/lot tracking enabled |
| `ISPERISHABLEON` | `No` | Perishable goods tracking |
| `IGNORENEGATIVESTOCK` | `No` | Allows negative stock |
| `IGNOREGODOWNS` | `No` | Enables godown-wise tracking |

### GST Details within Stock Groups

```xml
<GSTDETAILS.LIST>
  <APPLICABLEFROM>20230401</APPLICABLEFROM>
  <SRCOFGSTDETAILS>As per Company/Stock Group</SRCOFGSTDETAILS>
  <ISREVERSECHARGEAPPLICABLE>No</ISREVERSECHARGEAPPLICABLE>
  <ISNONGSTGOODS>No</ISNONGSTGOODS>
  <GSTINELIGIBLEITC>Yes</GSTINELIGIBLEITC>
  <STATEWISEDETAILS.LIST>
    <STATENAME>&#4; Any</STATENAME>
    <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD>
      <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
    </RATEDETAILS.LIST>
    <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
      <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
    </RATEDETAILS.LIST>
  </STATEWISEDETAILS.LIST>
</GSTDETAILS.LIST>
```

## 4. Stock Items (`STOCK ITEMS.xml`)

Stock items are the individual products in inventory.

### XML Structure

```xml
<STOCKITEM NAME="ABC Air Way" RESERVEDNAME="">
  <GUID>ed172209-...-000001fa</GUID>
  <PARENT>1</PARENT>
  <CATEGORYNAME>C</CATEGORYNAME>
  <BASEUNITS>PCS</BASEUNITS>
  <ADDITIONALUNITS/>
  <OPENINGBALANCE>0</OPENINGBALANCE>
  <OPENINGRATE>0</OPENINGRATE>
  <ISBATCHWISEON>No</ISBATCHWISEON>
  <ISPERISHABLEON>No</ISPERISHABLEON>
  <BATCHQTYDIFFPERCENT> 0</BATCHQTYDIFFPERCENT>
  <AVGRATE>0</AVGRATE>
  <SALEACCOUNTNAME>ABC Air Way</SALEACCOUNTNAME>
  <ALTERID> 5408</ALTERID>
</STOCKITEM>
```

### Fields

| Field | Description |
|-------|-------------|
| `PARENT` | Parent stock group name (links to STOCKGROUP.NAME) |
| `BASEUNITS` | Primary unit (e.g., PCS, BAG, BOX) |
| `ADDITIONALUNITS` | Secondary/conversion unit |
| `OPENINGBALANCE` | Opening stock quantity |
| `OPENINGRATE` | Opening stock rate per unit |
| `AVGRATE` | Current average rate |
| `CATEGORYNAME` | Stock category (links to STOCKCATEGORY.NAME) |
| `SALEACCOUNTNAME` | Default sales ledger for this item |
| `BATCHQTYDIFFPERCENT` | Allowed batch quantity variance |

## 5. Stock Categories (`STOCK CATEGORIES.xml`)

Stock categories provide an alternate classification (vs. stock group hierarchy).

```xml
<STOCKCATEGORY NAME="C" RESERVEDNAME="">
  <GUID>ed172209-...-00000041</GUID>
  <PARENT/>
  <ISADDABLE>Yes</ISADDABLE>
  <ALTERID> 5301</ALTERID>
</STOCKCATEGORY>
```

## 6. Units of Measure (`ALL INVENTORY MASTERS.xml`)

Units define measures for stock items.

### XML Structure

```xml
<UNIT NAME="BAG" RESERVEDNAME="">
  <NAME>BAG</NAME>
  <GUID>ed172209-...-00000379</GUID>
  <ISDELETED>No</ISDELETED>
  <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
  <ALTERID> 5978</ALTERID>
  <REPORTINGUQCDETAILS.LIST>
    <APPLICABLEFROM>20250401</APPLICABLEFROM>
    <REPORTINGUQCNAME>BAG-BAGS</REPORTINGUQCNAME>
  </REPORTINGUQCDETAILS.LIST>
</UNIT>
```

### Units Found

| Unit Name | Type | Reporting UQC |
|-----------|------|---------------|
| BAG | Simple | BAG-BAGS |
| BOX | Simple | BOX-BOX |
| PCS | Simple | (default) |
| NOS | Simple | (default) |
| Others as needed | Simple | Varies |

### Fields

| Field | Description |
|-------|-------------|
| `ISSIMPLEUNIT` | Yes = base unit; No = compound unit (e.g., "PCS" for pieces, "BAG" for bags) |
| `REPORTINGUQCDETAILS.LIST/REPORTINGUQCNAME` | GST/HSN UQC code for compliance reporting |
| `REPORTINGUQCDETAILS.LIST/APPLICABLEFROM` | Date from which UQC mapping applies |

## 7. Voucher Types (`VOUCHER TYPES.xml`)

Voucher types define transactional document types.

### XML Structure

```xml
<VOUCHERTYPE NAME="Receipt" RESERVEDNAME="Receipt">
  <GUID>ed172209-...-00000037</GUID>
  <PARENT>Receipt</PARENT>
  <MAILINGNAME>Rct</MAILINGNAME>
  <NUMBERINGMETHOD>Automatic</NUMBERINGMETHOD>
  <VOUCHERNUMBERINGBUDDY>Automated</VOUCHERNUMBERINGBUDDY>
  <USEZEROENTRIES>No</USEZEROENTRIES>
  <ISACTIVE>Yes</ISACTIVE>
  <ISOPTIONAL>No</ISOPTIONAL>
  <ASMFGJRNL>No</ASMFGJRNL>
  <ISTAXINVOICE>No</ISTAXINVOICE>
  <ISEWAYAPPLICABLE>No</ISEWAYAPPLICABLE>
  <SORTPOSITION> 240</SORTPOSITION>
  <ALTERID> 5951</ALTERID>
  <BEGINNINGNUMBER> 1</BEGINNINGNUMBER>
</VOUCHERTYPE>
```

### Fields

| Field | Description |
|-------|-------------|
| `NUMBERINGMETHOD` | `Automatic` or `Manual` sequential numbering |
| `BEGINNINGNUMBER` | Starting voucher number |
| `ISACTIVE` | Available for use in transactions |
| `ISOPTIONAL` | Optional voucher (can be toggled on/off) |
| `ISTAXINVOICE` | Marked as tax invoice for GST |
| `ISEWAYAPPLICABLE` | E-Way Bill generation applicable |
| `PREFIXLIST.LIST` | Number prefix configuration |
| `SUFFIXLIST.LIST` | Number suffix configuration |
| `RESTARTFROMLIST.LIST` | Number restart frequency (Yearly/Monthly) |

## Master Entity Relationship Diagram

```
├── Accounting Groups
│   └── Ledgers (PARENT → GROUP.NAME)
├── Stock Groups
│   └── Stock Items (PARENT → STOCKGROUP.NAME)
├── Stock Categories
│   └── Stock Items (CATEGORYNAME → STOCKCATEGORY.NAME)
├── Units
│   └── Stock Items (BASEUNITS → UNIT.NAME)
├── Voucher Types
│   └── Vouchers (VCHTYPE → VOUCHERTYPE.NAME)
├── Cost Categories/Centres (in Accounting Master.xml)
│   └── Ledger allocations, Voucher allocations
└── Currencies
    └── Ledgers (CURRENCYSYMBOL)
```
