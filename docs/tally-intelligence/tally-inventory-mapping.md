# Tally Inventory Mapping to GII GeM ERP

## Overview

This document maps TallyPrime's inventory management entities to the GII GeM ERP. The source data comes from `ALL INVENTORY MASTERS.xml` (7.6 MB), `STOCK GROUPS.xml` (9 KB), `STOCK ITEMS.xml` (7.4 MB), and `STOCK CATEGORIES.xml` (1.5 KB).

## 1. Units of Measure → GII ERP UoM

### Tally Source: `ALL INVENTORY MASTERS.xml` — `<UNIT>` elements

| Tally Field | Example | GII ERP Mapping |
|-------------|---------|----------------|
| `NAME` | BAG, BOX, PCS, NOS | Unit of Measure Code |
| `ISSIMPLEUNIT` | Yes | Base UoM flag |
| `ADDITIONALUNITS` | (empty for simple units) | Conversion UoM |
| `REPORTINGUQCDETAILS.LIST/REPORTINGUQCNAME` | BAG-BAGS, BOX-BOX | GST UQC Code |

### Units Found in Data

| Unit Name | Simple? | Reporting UQC | GST UQC Code |
|-----------|---------|---------------|-------------|
| BAG | Yes | BAG-BAGS | BAGS |
| BOX | Yes | BOX-BOX | BOX |
| PCS | Yes | *(default)* | PCS |
| NOS | Yes | *(default)* | NOS |

### Mapping Rules

- Simple units (`ISSIMPLEUNIT=Yes`) map directly to ERP UoM records
- UQC codes from `REPORTINGUQCDETAILS.LIST` become the GST compliance UoM in the ERP
- Compound units (if present) would require conversion factor mapping

## 2. Stock Groups → GII ERP Item Groups

### Tally Source: `STOCK GROUPS.xml` — `<STOCKGROUP>` elements

| Tally Field | Example | GII ERP Mapping |
|-------------|---------|----------------|
| `NAME` | 1 | Item Group Code/Name |
| `PARENT` | (empty or parent name) | Parent Item Group (hierarchy) |
| `COSTINGMETHOD` | Avg. Cost | Costing Method |
| `VALUATIONMETHOD` | Avg. Price | Valuation Method |
| `BASEUNITS` | PCS | Default UoM for group |
| `ISBATCHWISEON` | No | Batch/Lot tracking flag |
| `ISPERISHABLEON` | No | Perishable flag |
| `IGNORENEGATIVESTOCK` | No | Allow negative stock |
| `IGNOREGODOWNS` | No | Warehouse tracking |

### Hierarchy Mapping

```
Tally: Stock Group "1" (Root)
  └── "1.1" (Child)
        └── "1.1.1" (Grandchild)

GII ERP: Item Group "1" (Root Category)
  └── "1.1" (Sub-category)
        └── "1.1.1" (Sub-sub-category)
```

### Costing & Valuation

Tally uses specific costing and valuation methods that must be replicated:

| Tally Method | GII ERP Equivalent | Notes |
|-------------|-------------------|-------|
| Avg. Cost (Average Cost) | Weighted Average | Default method found in data |
| FIFO (First In First Out) | FIFO | Not found in current data but standard Tally option |
| Standard Cost | Standard Costing | Not found in current data |
| Last Purchase Cost | Last Purchase Rate | For reporting only |

## 3. Stock Items → GII ERP Item Master

### Tally Source: `STOCK ITEMS.xml` — `<STOCKITEM>` elements

| Tally Field | Example | GII ERP Field |
|-------------|---------|--------------|
| `NAME` | ABC Air Way | Item Name / Product Name |
| `PARENT` | 1 (Stock Group name) | Item Group (FK) |
| `CATEGORYNAME` | C | Item Category (FK) |
| `BASEUNITS` | PCS | Primary UoM |
| `ADDITIONALUNITS` | (empty) | Secondary UoM |
| `OPENINGBALANCE` | 0 | Opening Stock Quantity |
| `OPENINGRATE` | 0 | Opening Stock Rate |
| `AVGRATE` | 0 | Current Average Rate |
| `SALEACCOUNTNAME` | ABC Air Way | Default Sales Account |
| `ISBATCHWISEON` | No | Batch Tracking |
| `ISPERISHABLEON` | No | Perishable |
| `BATCHQTYDIFFPERCENT` | 0 | Batch Variance % |

### Additional Fields from Inventory Entries (Transactions.xml)

| Transaction Field | GII ERP Field |
|-------------------|--------------|
| `RATE` (per unit) | Unit Price |
| `AMOUNT` | Line Total |
| `ACTUALQTY` | Actual Quantity |
| `BILLEDQTY` | Billed Quantity |
| `GODOWNNAME` | Warehouse |

### Item Identification

Each stock item has a unique `GUID` in Tally. For the ERP:

- Use `NAME` as the primary identifier (natural key)
- Preserve `GUID` as an external reference for audit/traceability
- Generate a new ERP item code if needed

## 4. Stock Categories → GII ERP Categories

### Tally Source: `STOCK CATEGORIES.xml` — `<STOCKCATEGORY>` elements

| Tally Field | GII ERP Mapping |
|-------------|----------------|
| `NAME` | Category Code |
| `PARENT` | Parent Category |

Stock categories are an **alternative classification** system (independent of stock group hierarchy). The ERP should support both:
- **Primary classification**: Stock Group → Item Group
- **Alternate classification**: Stock Category → Item Category

## 5. Godowns/Warehouses → GII ERP Warehouses

### Tally Source: `Transactions.xml` — `INVENTORYENTRIESINVOICE.LIST/BATCHALLOCATIONS.LIST/GODOWNNAME`

Godowns are not exported as separate masters in the XML files. They appear as string references within inventory transaction records.

| Tally Source | GII ERP Mapping |
|-------------|----------------|
| `GODOWNNAME` (from batch allocations) | Warehouse Name |
| *(location details not in export)* | Warehouse Address / Type |

### Implementation Approach

1. Scan all `INVENTORYENTRIESINVOICE.LIST` entries across all transactions
2. Extract unique `GODOWNNAME` values
3. Create corresponding warehouse records in GII ERP
4. Default warehouse: "Main Location" (commonly used in single-godown setups)

## 6. Stock Valuation Data

### Opening Stock

From `STOCK ITEMS.xml`:

```
Opening Value = OPENINGBALANCE × OPENINGRATE
```

Where `OPENINGBALANCE > 0` and `OPENINGRATE > 0` indicates stock-in-hand at the start of the period.

### Current Average Rate

`AVGRATE` reflects the weighted average cost at the time of export. The ERP should calculate this dynamically based on purchase transactions.

## 7. Cross-Reference: Inventory in Vouchers

From `Transactions.xml`, the inventory entries provide the transaction-level linkage:

```xml
<VOUCHER VCHTYPE="Sales" ...>
  <INVENTORYENTRIESINVOICE.LIST>
    <STOCKITEMNAME>Product ABC</STOCKITEMNAME>   <!-- → Item Master -->
    <RATE>100.00</RATE>                            <!-- → Unit Price -->
    <AMOUNT>100000.00</AMOUNT>                     <!-- → Line Total -->
    <ACTUALQTY>1000</ACTUALQTY>                    <!-- → Quantity -->
    <BILLEDQTY>1000</BILLEDQTY>                    <!-- → Billed Qty -->
    <GODOWNNAME>Main Location</GODOWNNAME>        <!-- → Warehouse -->
    <BATCHALLOCATIONS.LIST>...</BATCHALLOCATIONS.LIST>
    <ACCOUNTINGALLOCATIONS.LIST>
      <LEDGERNAME>Sales @ 18%</LEDGERNAME>        <!-- → GL Account -->
      <AMOUNT>100000.00</AMOUNT>
      <GSTTAXASSESSABLEVALUE>100000.00</GSTTAXASSESSABLEVALUE>
    </ACCOUNTINGALLOCATIONS.LIST>
  </INVENTORYENTRIESINVOICE.LIST>
</VOUCHER>
```

This linking allows the ERP to reconstruct:
- Which items were sold/purchased
- At what rate and quantity
- Which tax treatment applied
- Which warehouse/godown was affected

## 8. Inventory Migration Sequence

```
1. Units          → UoM Master
2. Stock Groups   → Item Groups (with hierarchy)
3. Stock Categories → Item Categories
4. Stock Items    → Item Master (with group, category, UoM references)
5. Godowns        → Warehouses (extracted from transaction data)
6. Opening Stock  → Stock Opening Balance (quantity + value)
7. Transactions   → Stock Movements (purchases in, sales out)
```

## 9. Data Quality Notes

| Potential Issue | Observation |
|----------------|-------------|
| Zero opening balances | Many items have `OPENINGBALANCE=0` and `OPENINGRATE=0` — these are new items with no stock |
| Missing godown data | If `BATCHALLOCATIONS.LIST` is empty, the godown reference is absent; assign to default warehouse |
| Negative stock | `IGNORENEGATIVESTOCK=No` — this stock group disallows negative stock; verify no negative entries exist |
| Duplicate item names | Check for case-sensitive duplicates in STOCK ITEMS.xml; Tally allows same name in different groups |
| Missing HSN codes | HSN may be absent at item level; inherited from stock group or company |

## 10. ERP Data Structures Required

The GII GeM ERP must support at minimum:

- **UoM Master**: Code, Name, UQC Code, IsBase, ConversionFactor
- **Item Group Master**: Code, Name, ParentId, CostingMethod, ValuationMethod
- **Item Category Master**: Code, Name, ParentId
- **Item Master**: Code, Name, GroupId, CategoryId, BaseUoMId, AvgRate, OpeningQty, HSN Code
- **Warehouse Master**: Code, Name, Address
- **Stock Opening Balance**: ItemId, WarehouseId, Quantity, Rate, Value, AsOfDate
- **Stock Movement**: TransactionId, ItemId, WarehouseId, Quantity, Rate, Value, Direction (In/Out)
