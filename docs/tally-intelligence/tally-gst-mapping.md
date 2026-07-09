# Tally GST Mapping to GII GeM ERP

## Overview

This document maps the GST (Goods and Services Tax) configuration and data from TallyPrime to the GII GeM ERP system, based on the GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED data.

## Company-Level GST Details

From `Transactions.xml` and `VOUCHER TYPES.xml`:

| Field | Tally XML Source | Value | GII ERP Mapping |
|-------|-----------------|-------|-----------------|
| GSTIN | `CMPGSTIN` | 10AAJCG3823D1Z7 | Company Tax Registration |
| State | `CMPGSTSTATE` | Bihar | State Code (10) |
| Registration Type | `CMPGSTREGISTRATIONTYPE` | Regular | Tax Registration Type |
| Registration Name | `GSTREGISTRATION` attribute | Bihar Registration | Registration Name |
| Tax Unit | `TAXUNITNAME` | Bihar Registration | Tax Unit |
| Constitution | *(not in XML)* | Private Limited | Business Constitution |

### GSTIN Breakdown

`10AAJCG3823D1Z7`
- `10` — State Code (Bihar)
- `AAJCG3823D` — PAN (AAJCG3823D)
- `1` — Entity Number
- `Z` — Default (Alphabet check digit)
- `7` — Checksum digit

## GST Rate Structure

### Rate Determination

GST rates are determined from:
1. Stock Group level (`GSTDETAILS.LIST` within STOCKGROUP)
2. Stock Item level (override)
3. Company level (default)

### XML Rate Details Pattern

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
      <GSTRATE>9.00</GSTRATE>  <!-- if specified -->
      <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
    </RATEDETAILS.LIST>
    <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD>
      <GSTRATE>9.00</GSTRATE>
      <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
    </RATEDETAILS.LIST>
    <RATEDETAILS.LIST>
      <GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD>
      <GSTRATE>18.00</GSTRATE>
      <GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE>
    </RATEDETAILS.LIST>
  </STATEWISEDETAILS.LIST>
</GSTDETAILS.LIST>
```

### Tax Head Mapping

| Tally Tax Head | Rate Split | GST Component | GII ERP Tax Ledger |
|---------------|------------|---------------|-------------------|
| CGST @ 9% | 9% of taxable | Central GST | Output CGST 9% |
| SGST @ 9% | 9% of taxable | State GST | Output SGST 9% |
| IGST @ 18% | 18% of taxable | Integrated GST | Output IGST 18% |
| Input CGST @ 9% | 9% of taxable | Input Central GST | Input CGST 9% |
| Input SGST @ 9% | 9% of taxable | Input State GST | Input SGST 9% |
| Input IGST @ 18% | 18% of taxable | Input Integrated GST | Input IGST 18% |

## Transaction-Level GST Fields

### On Sales Voucher

| Tally XML Field | Description | GII ERP Field |
|----------------|-------------|--------------|
| `CMPGSTIN` | Seller GSTIN | Company GSTIN |
| `CMPGSTREGISTRATIONTYPE` | Regular/Composition | Registration Type |
| `CMPGSTSTATE` | Bihar | Seller State |
| `PARTYLEDGERNAME` | Buyer name | Customer Name |
| `PARTYGSTIN` *(in purchase)* | Buyer/Supplier GSTIN | Party GSTIN |
| `PARTYGSTREGISTRATIONTYPE` | Registration type | Party Reg Type |
| `PARTYGSTSTATE` | Party's state | Party State |
| `PLACEOFSUPPLY` | Where supply occurs | Place of Supply |
| `GSTTAXTYPEOFSUPPLY` | Goods/Services | Supply Type |
| `GSTTAXASSESSABLEVALUE` | Value before GST | Taxable Value |
| `ISREVERSECHARGEAPPLICABLE` | RCM flag | Reverse Charge |
| `VCHGSTCLASS` | GST class | Tax Classification |

### Party GST Registration Type

Values observed or possible from Tally:

| Value | Meaning | GII ERP Mapping |
|-------|---------|-----------------|
| Regular | Registered under GST | Registered |
| Composition | Composition scheme | Composition |
| Unregistered | Not registered | Unregistered |
| Consumer | Consumer (no GSTIN) | Consumer |
| Overseas | Foreign party | SEZ/Export |
| SEZ | SEZ unit | SEZ |
| SEZ Developer | SEZ developer | SEZ Developer |
| Deemed Export | Deemed export | Deemed Export |
| URD | Unregistered Dealer | URD |
| Govt | Government department | Government |
| e-Commerce | E-commerce operator | e-Commerce |

### GST Tax Type of Supply

| Value | Meaning |
|-------|---------|
| Goods | Physical goods |
| Services | Services |
| Goods & Services | Mixed supply |

## GST Ledger Accounts

From `LEDGERS.xml`, GST-related ledgers follow a naming convention:

```
[CGST/SGST/IGST] [@ Rate] [Output/Input]
```

Examples:
- `CGST @ 9%` — Output CGST
- `SGST @ 9%` — Output SGST
- `IGST @ 18%` — Output IGST
- `Input CGST @ 9%` — Input CGST
- `Input SGST @ 9%` — Input SGST
- `Input IGST @ 18%` — Input IGST

These ledgers are typically under the **Duties & Taxes** group.

## HSN/SAC Mapping

### In Stock Items

HSN/SAC details are specified per stock item or stock group:

```xml
<HSNDETAILS.LIST>
  <APPLICABLEFROM>20230401</APPLICABLEFROM>
  <HSNSACCODE>XXXXXXXX</HSNSACCODE>
  <HSNSACDESC>Description</HSNSACDESC>
  <HSNQUALITY>Goods</HSNQUALITY>
</HSNDETAILS.LIST>
```

| Tally Field | GII ERP Mapping |
|-------------|-----------------|
| `HSNSACCODE` | HSN/SAC Code in Item Master |
| `HSNSACDESC` | Description |
| `HSNQUALITY` | Goods (HSN) or Services (SAC) |

## GST Treatment by Transaction Type

### Intra-State Supply (Both parties in Bihar)

```
Taxable Value: 100,000
CGST @ 9%: 9,000
SGST @ 9%: 9,000
Total Invoice: 118,000
```

### Inter-State Supply (Party outside Bihar)

```
Taxable Value: 100,000
IGST @ 18%: 18,000
Total Invoice: 118,000
```

### Purchase (Receiving Input Credit)

```
Taxable Value: 100,000
Input CGST @ 9%: 9,000
Input SGST @ 9%: 9,000
Total Payable: 118,000
```

## GST Compliance Reports Required

| Report | Tally Source | GII ERP Requirement |
|--------|-------------|-------------------|
| GSTR-1 (Outward) | Sales + Credit Note vouchers with GST | Generate from sales data |
| GSTR-3B (Summary) | Aggregated GST data | Monthly return summary |
| GSTR-2A (Inward) | Purchase + Debit Note vouchers | Auto-populate from vendor data |
| GST Payment Challan | Output - Input = Net GST payable | Track payments |
| HSN/SAC Summary | Group by HSNSACCODE | Report for GSTR-1 |
| e-Way Bill | E-Way Bill data | Integration if applicable |

## Key Mapping Decisions

1. **Tax Ledgers → Tax Rates**: Each GST ledger (e.g., `CGST @ 9%`) maps to a specific tax rate in the ERP. The ERP should define tax rates as rate slabs, not individual ledgers, to allow percentage-based calculations.

2. **Input vs Output**: Tally uses separate ledgers for input and output GST. The ERP should track both input credit and output liability, with auto-setoff logic.

3. **Reverse Charge**: `ISREVERSECHARGEAPPLICABLE=Yes` triggers RCM (Reverse Charge Mechanism). The ERP should flag such transactions for self-invoicing and separate reporting.

4. **Place of Supply**: Determines CGST+SGST (intra-state) vs. IGST (inter-state). The ERP must auto-detect based on seller state vs. place of supply.

5. **HSN/SAC**: Extract all unique HSN/SAC codes from stock items and stock groups. Map to the ERP's item classification.
