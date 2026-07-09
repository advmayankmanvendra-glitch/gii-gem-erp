# Entity Reference Model

Universal entity reference model across Tally.ERP 9 and TallyPrime.

---

## 1. Core Entities

| Entity | Type | Description |
|--------|------|-------------|
| Company | Primary | Top-level accounting entity (organisation) |
| Group | Master | Classification for ledgers (parent-child hierarchy) |
| Ledger | Master | Individual account under a group |
| Voucher | Transaction | Financial or inventory transaction record |
| VoucherType | Master | Template classification for vouchers |
| StockItem | Master | Inventory item (goods or services tracked as stock) |
| StockGroup | Master | Classification hierarchy for stock items |
| Unit | Master | Unit of measurement for stock items |
| Godown | Master | Warehouse / storage location (parent-child hierarchy) |
| CostCentre | Master | Cost/profit centre for departmental accounting |
| CostCategory | Master | Grouping for cost centres |
| Currency | Master | Foreign currency master |
| Budget | Master | Budget definition for financial control |

---

## 2. Entity Relationship Diagram

```
Company 1 ─── 1→N Group
  │
  ├── 1→N VoucherType
  │       │
  │       └── 1→N Voucher
  │               │
  │               ├── 1→N LedgerEntry
  │               │       │
  │               │       └── M→1 Ledger (via LedgerEntry.LedgerName)
  │               │
  │               └── M→N StockItem (via InventoryEntry)
  │
  ├── 1→N StockGroup  ─── 1→N StockItem
  │                            │
  │                            └── M→N Voucher (via InventoryEntry)
  │
  ├── 1→N Godown (self-referential parent-child)
  │
  ├── 1→N Unit
  │
  ├── 1→N CostCategory  ─── 1→N CostCentre
  │
  ├── 1→N Currency
  │
  └── 1→N Budget

Group ─── 1→N Group (self-referential: parent-child sub-groups)
Godown ─── 1→N Godown (self-referential: parent-child sub-godowns)
```

### Relationship Details

| Source | Relationship | Target | Cardinality | Via |
|--------|-------------|--------|-------------|-----|
| Company | has | Group | 1→N | Direct ownership |
| Group | parent of | Group | 1→N | Self-referential (Parent field) |
| Group | contains | Ledger | 1→N | Ledger.GroupName |
| Company | has | VoucherType | 1→N | Direct ownership |
| VoucherType | templates | Voucher | 1→N | Voucher.VoucherTypeName |
| Voucher | has | LedgerEntry | 1→N | Line items on voucher |
| Voucher | contains | StockItem | M→N | InventoryEntries table |
| Company | has | StockGroup | 1→N | Direct ownership |
| StockGroup | parent of | StockGroup | 1→N | Self-referential (Parent field) |
| StockGroup | contains | StockItem | 1→N | StockItem.StockGroupName |
| Company | has | Godown | 1→N | Direct ownership |
| Godown | parent of | Godown | 1→N | Self-referential (Parent field) |
| Company | has | Unit | 1→N | Direct ownership |
| Company | has | CostCategory | 1→N | Direct ownership |
| CostCategory | contains | CostCentre | 1→N | CostCentre.CostCategoryName |
| Company | has | Currency | 1→N | Direct ownership |
| Company | has | Budget | 1→N | Direct ownership |

---

## 3. Key Attributes per Entity

### Company
- GUID (globally unique identifier)
- Name
- Mailing Name
- Address (multiple lines)
- State, Country, PIN Code
- GSTIN (if registered)
- PAN
- Financial Year From/To
- Books Beginning From
- Base Currency
- Security Controls (user access level)

### Group
- Name
- Parent Group (self-referential)
- Group Nature (Revenue, Capital, Liability, Asset, Expense, Income)
- Affect Gross Profit (Yes/No)
- Net Debit/Credit Balance for Reporting
- Used for Tax Calculation
- Method for Allocation of Group

### Ledger
- Name
- Group Name
- Opening Balance (with Dr/Cr type)
- GST Registration Type (Registered, Unregistered, Composite, Consumer)
- GSTIN (if registered)
- GST Rate / Nature of Transaction
- Bill-wise Details (default)
- Credit Period / Limit
- Mailing Details (Name, Address, Phone)
- E-mail (for e-invoicing)
- PAN / Aadhaar
- Bank Details (Account Number, IFSC, Bank Name, Branch)

### Voucher
- GUID
- Voucher Number (auto/manual)
- Date
- Voucher Type Name
- Narration (header-level)
- Amount (total)
- Post-dated / Staging date
- Is Optional
- Is Deemed Positive
- Effective Date for GST

### VoucherType
- Name
- Parent (e.g., Sales, Purchase, Payment, Receipt, Contra, Journal)
- Method of Voucher Numbering (Auto/Manual)
- Use for Common Narration (Yes/No)
- Use for Effective Date (Yes/No)
- Allow Zero-valued Entries
- Default Printing Configuration

### StockItem
- Name
- Stock Group Name
- Unit
- Opening Balance / Rate / Value
- Minimum Stock Quantity (reorder level)
- Maximum Stock Quantity
- Standard Cost (for valuation)
- Selling Price (multiple price levels)
- GST Applicable (Yes/No)
- HSN/SAC Code
- Rate of Duty (GST)
- Part Number / Alias / Barcode

### StockGroup
- Name
- Parent Stock Group (self-referential)
- GST Applicability (inheritable to items)
- Rate of Duty (inheritable)

### Unit
- Name (symbol)
- Formal Name
- Number of Decimal Places
- Conversion Factor (for compound units, e.g., 1 box = 12 pcs)

### Godown
- Name
- Parent Godown (self-referential)
- Address
- In-charge

### CostCentre
- Name
- Cost Category Name

### CostCategory
- Name
- Allocate Revenue Items
- Allocate Non-Revenue Items

### Currency
- Name
- Symbol
- ISO Code
- Decimal Places
- Exchange Rate (buying/selling)
- Rate Date (as on)

### Budget
- Name
- Financial Year
- Budget for (Group / Ledger / Cost Centre)
- Set/Alter Values (month-wise or annual)

---

## 4. Validation Rules

### Group Rules
- A group cannot have itself as its parent group (no circular reference)
- A group cannot be assigned as a child of a group that is already its descendant (acyclic hierarchy)
- Only Primary Groups (root level) can exist without a parent
- A group with existing ledgers cannot be deleted; must be set to inactive
- A group being deleted must have no sub-groups

### Ledger Rules
- Every ledger must belong to exactly one group
- A ledger cannot be created under a group that is reserved (e.g., certain predefined groups)
- Ledger name must be unique within a company
- Opening balance must be of valid type (Dr/Cr) matching group nature
- GSTIN must be valid as per GSTIN format validation (15 characters)
- Credit limit must be non-negative
- A ledger with existing transactions cannot be deleted

### Voucher Rules
- Debits must equal credits in every voucher (unless inventory voucher with auto-balancing)
- Voucher number must be unique per voucher type per financial year
- Voucher date must fall within the company's financial year
- Voucher date cannot be before the last closing date of the books
- Reference voucher (if linked) must exist and be of compatible type
- Tax amounts must be consistent with taxable values and rates
- Inventory quantities must be positive and within available stock (if negative stock disabled)
- For GST invoices: GSTIN of buyer mandatory for B2B
- For e-invoice: valid IRN required; same invoice cannot have two IRNs

### Stock Item Rules
- Stock item must belong to either a stock group or be standalone (uncategorised)
- Unit of measure must be defined and valid
- For batch/lot tracking items: batch number and expiry date mandatory
- For serialised items: each serial number must be unique per item
- Negative stock not allowed (if configured)
- Rate cannot be negative
- Standard cost must be positive (if using standard costing)

### Godown Rules
- Godown cannot be its own parent (no circular reference)
- Godown hierarchy must be acyclic
- A godown with existing stock cannot be deleted

### Unit Rules
- Unit name must be unique
- For compound units, conversion factor must reference an existing simple unit
- Conversion must be mathematically consistent (no circular conversion chain)

### Cost Centre Rules
- Cost centre must belong to exactly one cost category
- Cost category allocation must be consistent (revenue or non-revenue)

### Currency Rules
- Exchange rate must be positive
- Base currency cannot be deleted

### Budget Rules
- Budget period must be within the current financial year
- Budget values must be numeric and non-negative

---

## 5. Audit Trail

### Common Audit Fields (Applicable to All Entities)

| Field | Type | Description |
|-------|------|-------------|
| GUID | UUID | Globally Unique Identifier; immutable once assigned |
| CreatedDate | DateTime | Timestamp of entity creation |
| CreatedBy | String | User who created the entity |
| ModifiedDate | DateTime | Timestamp of last modification |
| ModifiedBy | String | User who last modified the entity |
| IsDeleted | Boolean | Soft-delete flag (true = inactive/deleted) |
| DeletedDate | DateTime | Timestamp of deletion (if soft-deleted) |
| DeletedBy | String | User who deleted the entity |

### Voucher-Specific Audit Fields

| Field | Type | Description |
|-------|------|-------------|
| AuditNumber | Integer | Incremental audit log entry number |
| AlterationDetails | Text | Log of changes made during each alteration |
| AlterationDate | DateTime | Date/time of each alteration |
| AlterationUser | String | User who made the alteration |
| OldValue | Text | Previous value of changed field |
| NewValue | Text | New value of changed field |

### Audit Tracking Methods

- **Full Audit Trail:** All changes logged with before/after values (vouchers)
- **Simple Audit:** Only last modification timestamp and user tracked (masters)
- **Soft Delete:** Entities marked as deleted rather than physically removed
- **Deletion Protection:** Entities with child records or transaction history cannot be permanently deleted
- **Revision History:** For statutory documents (invoices, credit notes), revision numbers tracked for compliance
