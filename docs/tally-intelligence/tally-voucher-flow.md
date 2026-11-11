# Tally Voucher Flow

## Overview

TallyPrime uses voucher types to categorize financial and inventory transactions. Each voucher type defines a specific posting template that determines which ledgers, stock items, and GST fields are relevant. This document describes the standard voucher types found in `VOUCHER TYPES.xml` and `Transactions.xml` for **GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED**.

## Voucher Type Summary

| Voucher Type | Reserved Name | GST Applicable | Inventory | Common Use |
|-------------|---------------|----------------|-----------|------------|
| Receipt | Receipt | No | No | Customer payments received |
| Payment | Payment | No | No | Supplier/vendor payments |
| Sales | Sales | Yes | Yes | Goods/services sold |
| Purchase | Purchase | Yes | Yes | Goods/services purchased |
| Journal | Journal | Yes | No | Adjustments, credit entries |
| Contra | Contra | No | No | Bank transfers, cash deposits |
| Credit Note | Credit Note | Yes | Yes | Sales returns, credit adjustments |
| Debit Note | Debit Note | Yes | Yes | Purchase returns, debit adjustments |

## 1. Receipt Voucher

Records money received (typically from customers or other income sources).

### XML Pattern from Transactions.xml

```xml
<VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">
  <DATE>20260302</DATE>
  <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
  <VOUCHERNUMBER>137</VOUCHERNUMBER>
  <PARTYLEDGERNAME>CENTRAL PUBLIC WORKS DEPARTMENT</PARTYLEDGERNAME>
  <GSTREGISTRATION TAXTYPE="GST" TAXREGISTRATION="10AAJCG3823D1Z7">Bihar Registration</GSTREGISTRATION>
  <CMPGSTIN>10AAJCG3823D1Z7</CMPGSTIN>
  <CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
  <CMPGSTSTATE>Bihar</CMPGSTSTATE>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Axis Bank</LEDGERNAME>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
    <AMOUNT>10000.00</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>CENTRAL PUBLIC WORKS DEPARTMENT</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <AMOUNT>-10000.00</AMOUNT>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
```

### Posting Logic

- Debit: Bank/Cash ledger (positive amount, `ISDEEMEDPOSITIVE=Yes`)
- Credit: Party/Sundry Debtors ledger (negative amount, `ISDEEMEDPOSITIVE=No`)
- Cash or bank ledger selected based on payment mode.

## 2. Payment Voucher

Records money paid out.

### Posting Logic

- Debit: Party/Sundry Creditors ledger
- Credit: Bank/Cash ledger
- May include Bank Charges, TDS, or other expense ledgers.

## 3. Sales Voucher

Records sale of goods or services with GST.

### XML Pattern

```xml
<VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice View">
  <DATE>20260302</DATE>
  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <VOUCHERNUMBER>INV-001</VOUCHERNUMBER>
  <PARTYLEDGERNAME>BUYER NAME</PARTYLEDGERNAME>
  <GSTREGISTRATION TAXTYPE="GST" TAXREGISTRATION="10AAJCG3823D1Z7">Bihar Registration</GSTREGISTRATION>
  <CMPGSTIN>10AAJCG3823D1Z7</CMPGSTIN>
  <CMPGSTREGISTRATIONTYPE>Regular</CMPGSTREGISTRATIONTYPE>
  <CMPGSTSTATE>Bihar</CMPGSTSTATE>
  <PLACEOFSUPPLICE>Bihar</PLACEOFSUPPLICE>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sundry Debtors</LEDGERNAME>
    <AMOUNT>118000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Sales @ 18%</LEDGERNAME>
    <AMOUNT>-100000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <GSTTAXTYPEOFSUPPLY>Goods</GSTTAXTYPEOFSUPPLY>
    <GSTTAXASSESSABLEVALUE>100000.00</GSTTAXASSESSABLEVALUE>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>CGST @ 9%</LEDGERNAME>
    <AMOUNT>-9000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>SGST @ 9%</LEDGERNAME>
    <AMOUNT>-9000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  </ALLLEDGERENTRIES.LIST>
  <INVENTORYENTRIESINVOICE.LIST>
    <STOCKITEMNAME>Product ABC</STOCKITEMNAME>
    <RATE>100.00</RATE>
    <AMOUNT>100000.00</AMOUNT>
    <ACTUALQTY>1000</ACTUALQTY>
    <BILLEDQTY>1000</BILLEDQTY>
    <GSTTAXASSESSABLEVALUE>100000.00</GSTTAXASSESSABLEVALUE>
    <BATCHALLOCATIONS.LIST>
      <GODOWNNAME>Main Location</GODOWNNAME>
    </BATCHALLOCATIONS.LIST>
  </INVENTORYENTRIESINVOICE.LIST>
</VOUCHER>
```

### Posting Logic

- Debit: Sundry Debtors (total invoice value including tax)
- Credit: Sales Account (assessable value)
- Credit: CGST, SGST/UTGST or IGST (tax amounts)
- Inventory: Stock Item quantity reduced from godown

## 4. Purchase Voucher

Records purchase of goods or services.

### Posting Logic

- Debit: Purchase Account (assessable value)
- Debit: Input CGST, Input SGST/UTGST or Input IGST (on purchases with GST)
- Credit: Sundry Creditors (total payable)
- Inventory: Stock Item quantity increased at godown

## 5. Journal Voucher

Used for non-cash/non-bank adjustments.

### Common Uses

- Credit/Debit note adjustments
- Provision entries
- Interest accruals
- Fixed asset depreciation
- TDS entries
- GST liability adjustment

### XML Pattern

```xml
<VOUCHER VCHTYPE="Journal" ACTION="Create">
  <DATE>20260331</DATE>
  <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Interest Expense</LEDGERNAME>
    <AMOUNT>5000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  </ALLLEDGERENTRIES.LIST>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>Interest Payable</LEDGERNAME>
    <AMOUNT>-5000.00</AMOUNT>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
```

## 6. Contra Voucher

Records transfers between bank and cash accounts.

### Common Transactions

- Cash deposit to bank
- Bank to bank transfer
- Cash withdrawal from bank

### Posting Logic

- Debit: Target bank/cash ledger
- Credit: Source bank/cash ledger

## 7. Credit Note

Records sales returns or credit to customers.

### Posting Logic

- Debit: Sales Returns ledger (or reverse of sales)
- Debit: Output GST (CGST + SGST/IGST) reversed
- Credit: Sundry Debtors
- Inventory: Stock Item quantity increased (return to godown)

## 8. Debit Note

Records purchase returns or debit from suppliers.

### Posting Logic

- Debit: Sundry Creditors
- Credit: Purchase Returns ledger
- Credit: Input GST reversed
- Inventory: Stock Item quantity decreased

## Key GST Fields on All GST Vouchers

| Field | Example | Description |
|-------|---------|-------------|
| `GSTREGISTRATION` | `TAXTYPE="GST" TAXREGISTRATION="10AAJCG3823D1Z7"` | Company's GST registration reference |
| `TAXUNITNAME` | `Bihar Registration` | Tax unit name for GST |
| `CMPGSTIN` | `10AAJCG3823D1Z7` | Company GSTIN |
| `CMPGSTREGISTRATIONTYPE` | `Regular` | Normal/Composition/Unregistered |
| `CMPGSTSTATE` | `Bihar` | Company's registered state |
| `PARTYGSTIN` | *(on purchase)* | Supplier's GSTIN |
| `PARTYGSTREGISTRATIONTYPE` | `Regular` | Party's GST registration type |
| `PARTYGSTSTATE` | *(on purchase)* | Party's GST state |
| `PLACEOFSUPPLY` | `Bihar` | Place of supply (intra/inter-state) |
| `GSTTAXTYPEOFSUPPLY` | `Goods` or `Services` | Type of supply |
| `GSTTAXASSESSABLEVALUE` | `100000.00` | Value before tax |
| `ISREVERSECHARGEAPPLICABLE` | `No` | Reverse charge flag |

## Voucher Type Configuration

From `VOUCHER TYPES.xml`, each voucher type has:

| Setting | Example | Impact |
|---------|---------|--------|
| `NUMBERINGMETHOD` | Automatic/Manual | Determines how voucher numbers are assigned |
| `ISACTIVE` | Yes/No | Whether the type is available for use |
| `ISTAXINVOICE` | Yes/No | Whether it generates a tax invoice |
| `ISEWAYAPPLICABLE` | Yes/No | Whether E-Way Bill generation is triggered |
| `USEFORPOSINVOICE` | Yes/No | Point of Sale invoice mode |
| `ISOPTIONAL` | Yes/No | Whether it can be excluded from reports |
| `RESTARTFROMLIST.LIST` | Yearly/Monthly | Number series reset frequency |

## Flow Diagram

```
Party Payment (Receipt) ────→ Bank/Cash Dr, Party Cr
Party Payment Out (Payment) ──→ Party Dr, Bank/Cash Cr

Sales Invoice ──────────────→ Debtors Dr, Sales Cr, CGST/SGST Cr
                               Inventory Out (-Qty)
Purchase Invoice ───────────→ Purchases Dr, Input CGST/SGST Dr
                               Creditors Cr, Inventory In (+Qty)

Credit Note ────────────────→ Sales Returns Dr, Input CGST/SGST Dr
                               Debtors Cr, Inventory In (+Qty)
Debit Note ─────────────────→ Creditors Dr, Purchases Returns Cr
                               Output CGST/SGST Cr, Inventory Out (-Qty)

Contra ─────────────────────→ Bank Dr/Cr, Cash Cr/Dr
Journal ────────────────────→ Multi-ledger Dr/Cr (no cash/bank/inventory)
```
