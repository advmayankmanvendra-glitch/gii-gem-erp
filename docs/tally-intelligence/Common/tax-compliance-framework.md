# Tax Compliance Framework

Common tax compliance constructs across Tally.ERP 9 and TallyPrime.

---

## 1. GST Registration

**GSTIN Structure:** `29ABCDE1234F1Z5`

| Position | Length | Description |
|----------|--------|-------------|
| 1–2      | 2      | State Code (01–37) |
| 3–12     | 10     | PAN of legal entity |
| 13       | 1      | Entity code (number of registrations in same state under same PAN) |
| 14       | 1      | Default: Z |
| 15       | 1      | Check digit (alphanumeric) |

**Composition vs Regular:**

| Feature | Composition | Regular |
|---------|-------------|---------|
| Threshold | Up to ₹1.5Cr (₹75L for special category states) | Above threshold or voluntary |
| Tax Rate | Fixed low rate (1% manufacturing, 5% restaurant, 6% other) | Standard slab rates |
| Input Credit | Not available | Full ITC available |
| Returns | CMP-08 (quarterly), GSTR-4 (annual) | GSTR-1, GSTR-3B, GSTR-9 |
| Invoice Note | "Composition Taxable Person" on invoices | Standard invoice |
| Registration Type | Regular (with composition scheme) | Regular (normal scheme) |

**Tally Handling:**
- GSTIN stored per company and per party ledger
- Composition toggle in GST configuration
- Auto-validation of GSTIN format during entry

---

## 2. Tax Rate Structure

**GST Slabs:**

- **0%** – Essential goods (food grains, milk, education, healthcare)
- **5%** – Common use items (packaged food, ₹10K insurance premium)
- **12%** – Standard rate (processed food, computers, mobile phones)
- **18%** – General rate (IT services, telecom, restaurants, AC hotels)
- **28%** – Luxury/demerit goods (luxury cars, tobacco, aerated drinks)

**CGST/SGST/IGST Split:**

- **Intra-state (Within same state):** Total GST = CGST + SGST (equal split)
  - Example: 18% slab → 9% CGST + 9% SGST
- **Inter-state (Across states):** Total GST = IGST (full rate)
  - Example: 18% slab → 18% IGST

**Cess:** Additional cess on top of 28% for luxury/demerit goods (compensates states for revenue loss).

**Tally Handling:**
- Tax rate defined in GST Rate Groups (percentage-based)
- CGST/SGST/IGST ledgers auto-created per rate
- Place of Supply logic determines intra vs inter-state
- Rounding rules configurable (per line / per bill)

---

## 3. HSN/SAC Classification

**HSN (Harmonized System of Nomenclature) – Goods:**

| Digit Count | Usage |
|-------------|-------|
| 4 digits | Mandatory for all taxpayers (from 2021) |
| 6 digits | Recommended for B2B transactions |
| 8 digits | Full classification for specific items |

- First 2 digits: Chapter (e.g., 84 – Machinery)
- Next 2 digits: Heading (e.g., 8430 – Earth moving machinery)
- Next 2 digits: Sub-heading (e.g., 843010 – Pile drivers)
- Last 2 digits: Tariff item

**SAC (Service Accounting Code) – Services:**

- Always 8 digits
- First 2 digits: 99 (services chapter)
- Next 2 digits: Section (e.g., 99 – Services)
- Next 2 digits: Group
- Last 2 digits: Service code

**Tally Handling:**
- HSN/SAC stored in stock item masters or service ledgers
- Auto-populated on invoices
- Configurable at item group level for inheritance

---

## 4. Invoice Format

**Mandatory Fields for GST Invoice:**

| Field | Description |
|-------|-------------|
| Invoice Number | Serial number unique for financial year |
| Invoice Date | Date of issue |
| Seller Details | Name, address, GSTIN |
| Buyer Details | Name, address, GSTIN (if registered) |
| Shipping Address | Place of supply |
| HSN/SAC Code | Minimum 4 digits |
| Item Description | Goods/services description |
| Quantity / UOM | Units of measurement |
| Rate | Unit price |
| Taxable Value | Amount before tax |
| GST Rate | Applicable rate(s) |
| CGST Amount | Intra-state central tax |
| SGST Amount | Intra-state state tax |
| IGST Amount | Inter-state integrated tax |
| Total Invoice Value | Gross total (in words and figures) |
| QR Code | Required for e-invoices |
| IRN | Invoice Reference Number (e-invoicing) |

**E-invoicing Requirements (Turnover > ₹5Cr):**
- IRN generated from NIC/GSP portal
- Dynamic QR code with IRN, GSTIN of supplier, amount, GSTIN of receiver
- Invoice Reference Number (IRN) is 64-character alphanumeric hash
- Signed JSON / QR code embedded on invoice

**Tally Handling:**
- Invoice templates configurable (Print Configuration)
- E-invoice JSON generation (TallyPrime)
- IRN auto-population from portal response
- QR code rendering on print preview

---

## 5. Return Filing

**GSTR-1 (Outward Supplies):**

| Frequency | Due Date | Details |
|-----------|----------|---------|
| Monthly (QRMP: Quarterly) | 11th / 13th of following month | Invoice-wise outward supply data |
| Quarterly (Composition) | Not applicable | |

- B2B invoices – full details (GSTIN, invoice no, value, tax)
- B2C invoices – consolidated (state-wise, rate-wise)
- Credit/Debit notes – linked to original invoice
- Export supplies – with shipping bill details
- Nil-rated / exempt supplies

**GSTR-3B (Summary Return):**

| Frequency | Due Date | Details |
|-----------|----------|---------|
| Monthly | 20th of following month | Summary of outward, inward, ITC, tax payment |

- 3.1(a) – Outward taxable supplies
- 3.1(b) – Outward zero-rated / nil-rated
- 4(A) – ITC claimed (imports, domestic, reverse charge)
- 5 – ITC reversal (exempt supply, personal use)
- 6 – Interest / late fee
- 7 – Tax paid (cash + credit ledger)

**GSTR-9 (Annual Return):**

| Frequency | Due Date | Details |
|-----------|----------|---------|
| Annual | 31st December of following FY | Consolidated annual figures |

- Part I – Basic details
- Part II – Outward supply details
- Part III – ITC details
- Part IV – Tax paid
- Part V – Other details
- Part VI – Additional liability
- Part VII – Refund / demand

**GSTR-2A / 2B (Inward Supplies):**

| Return | Type | Details |
|--------|------|---------|
| GSTR-2A | Dynamic (real-time) | Auto-populated from counterparty GSTR-1 |
| GSTR-2B | Static (monthly) | Fixed statement for ITC reconciliation |

**Tally Handling:**
- Auto-generation of GSTR-1 return data from vouchers
- GSTR-3B summary computation
- GSTR-2A/2B reconciliation reports
- Returns export to JSON/Excel for portal upload
- Offline utility integration

---

## 6. TDS / TCS

**TDS (Tax Deducted at Source) – Key Sections:**

| Section | Nature | Rate | Threshold (FY 2025-26) |
|---------|--------|------|------------------------|
| 192 | Salary (as per slab) | Slab rate | Basic exemption limit |
| 194A | Interest on securities | 10% | ₹40,000 (₹5,000) |
| 194C | Contract payments | 1% / 2% | ₹30,000 single / ₹1,00,000 annual |
| 194H | Commission / Brokerage | 5% | ₹15,000 |
| 194I | Rent | 2% / 10% | ₹2,40,000 annual |
| 194J | Professional / Technical fees | 10% | ₹30,000 |
| 194Q | Purchase of goods | 0.1% | ₹50,00,000 annual |

**TCS (Tax Collected at Source) – Key Sections:**

| Section | Nature | Rate | Threshold |
|---------|--------|------|-----------|
| 206C(1) | Sale of scrap | 1% | No threshold |
| 206C(1H) | Sale of goods | 0.1% | ₹50,00,000 annual |
| 206C(1G) | Foreign remittance (LRS) | 5% / 20% | ₹7,00,000 |

**TDS/TCS Return Filing:**

| Form | Period | Due Date |
|------|--------|----------|
| 24Q | Quarterly | 15th of month following quarter |
| 26Q | Quarterly | 15th of month following quarter |
| 27Q | Quarterly | 15th of month following quarter |
| 27EQ | Quarterly | 15th of month following quarter |

**Tally Handling:**
- TDS/TCS masters per section with rate and threshold
- Auto-deduction at voucher entry
- TDS/TCS Challan generation
- Form 16 / 16A generation
- Return file export (FVU format)

---

## 7. E-way Bill

**Generation:**

| Criteria | Trigger |
|----------|---------|
| Goods value > ₹50,000 | Mandatory for inter-state and intra-state (some states) |
| Consignment type | Supply, transfer, job work |
| Transportation mode | Road, rail, air, ship |

**Validity:**

| Distance | Validity Period |
|----------|----------------|
| Up to 100 km | 1 day |
| 100–300 km | 3 days |
| 300–500 km | 5 days |
| 500–1,000 km | 10 days |
| > 1,000 km | 15 days |

**Extension:**
- Valid for 8 additional blocks of equivalent original validity
- Extension must be requested before expiry
- Part A (invoice details) cannot be changed after generation
- Part B (vehicle details) can be updated

**Tally Handling:**
- E-way bill generation from invoice/shipment interface
- Part A data auto-populated from invoice
- Multi-part e-way bill for multiple invoices
- Consolidated e-way bill for bulk consignments
- E-way bill tracking and status reports

---

## 8. E-invoicing

**Applicability:**

| Turnover Threshold | Effective From |
|--------------------|---------------|
| > ₹5 Crore | Mandatory |
| Voluntary | Optional for others |

**IRN Generation:**
- IRN = 64-character unique hash
- Generated via Invoice Registration Portal (IRP) / GSP
- Input: Invoice JSON (mandatory fields + optional fields)
- Output: IRN + Signed JSON + QR Code + E-way bill number (optional)

**QR Code Contains:**
- GSTIN of supplier
- GSTIN of receiver
- Invoice number and date
- Invoice value (taxable + tax)
- Number of line items
- HSN code of main item
- IRN (hash)

**Invoice Reference Number (IRN):**
- Unique for each invoice
- Generated once; cannot be regenerated
- Cancellation allowed within 24 hours (on IRP)

**Tally Handling:**
- Generate invoice JSON as per GST Council schema
- Post JSON to IRP/GSP via API integration
- Receive and store IRN and signed QR code
- Embed QR code on invoice print
- E-invoice cancellation API
- E-invoice register for audit trail

---

## 9. GST Reports

**Tax Ledger:**
- Electronic Credit Ledger (ITC available)
- Electronic Liability Ledger (tax payable)
- Electronic Cash Ledger (cash deposited)
- Daily / periodic balance view

**Input Credit:**
- ITC Available (as per books)
- ITC Claimed (as per GSTR-3B)
- ITC Reversed (Rule 42/43 – exempt/exempt supply)
- ITC as per GSTR-2A/2B
- ITC mismatch report (books vs 2A/2B vs 3B)
- Ineligible ITC (personal use, exempt supply, blocked credit)

**Output Liability:**
- Liability as per books
- Liability as per GSTR-1
- Liability as per GSTR-3B
- Short/excess payment report
- Late payment interest computation

**Payment Reconciliation:**
- Tax paid vs liability comparison
- Cash ledger vs challan reconciliation
- Credit ledger utilisation tracking
- Interest and late fee computation
- Refund tracking and reconciliation
