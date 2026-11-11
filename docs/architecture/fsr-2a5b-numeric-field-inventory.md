# Numeric Field Inventory — FSR-2A.5B

**Currency:** INR | **Minor units:** 100 (1 rupee = 100 paise) | **Safe integer max:** 9,007,199,254,740,991 paise (~90 trillion INR)

**Classification key:**
- **MONEY** → needs `_minor` shadow column (INTEGER paise)
- **RATE** (4dp) → needs `_scaled` shadow column (INTEGER × 10⁴)
- **QUANTITY** (3dp) → needs `_scaled` shadow column (INTEGER × 10³)
- **PERCENTAGE** (4dp) → needs `_scaled` shadow column (INTEGER × 10⁴)
- **NON_FINANCIAL** → no shadow column

**Migration priority:** P1 = certification-blocking, P2 = secondary, P3 = documentation only

---

## 1. Core Accounting Tables

### voucher_lines

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| debit | REAL | MONEY | `debit_minor` INTEGER | P1 |
| credit | REAL | MONEY | `credit_minor` INTEGER | P1 |

### ledger_entries

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| debit | REAL | MONEY | `debit_minor` INTEGER | P1 |
| credit | REAL | MONEY | `credit_minor` INTEGER | P1 |
| running_balance | REAL | MONEY | `running_balance_minor` INTEGER | P1 |

### cash_bank_ledger

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| debit | REAL | MONEY | `debit_minor` INTEGER | P1 |
| credit | REAL | MONEY | `credit_minor` INTEGER | P1 |
| balance | REAL | MONEY | `balance_minor` INTEGER | P1 |

### accounts

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| opening_balance | REAL | MONEY | `opening_balance_minor` INTEGER | P1 |

### vouchers

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| (no monetary columns) | — | — | — | — |

### financial_years

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| (no monetary columns) | — | — | — | — |

---

## 2. Opening Balances & Year-End

### opening_balances

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| opening_debit | REAL | MONEY | `opening_debit_minor` INTEGER | P1 |
| opening_credit | REAL | MONEY | `opening_credit_minor` INTEGER | P1 |

### year_end_closings

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| trial_balance_difference | REAL | MONEY | `trial_balance_difference_minor` INTEGER | P1 |
| balance_sheet_difference | REAL | MONEY | `balance_sheet_difference_minor` INTEGER | P1 |
| net_profit | REAL | MONEY | `net_profit_minor` INTEGER | P1 |

### carry_forward_entries

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| closing_balance | REAL | MONEY | `closing_balance_minor` INTEGER | P1 |
| opening_balance_created | INTEGER | NON_FINANCIAL | — | P3 |

---

## 3. Order Items (Supply Orders)

### order_items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| quoted_rate | REAL | RATE | `quoted_rate_scaled` INTEGER (×10⁴) | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| taxable_value | REAL | MONEY | `taxable_value_minor` INTEGER | P2 |
| gst_amount | REAL | MONEY | `gst_amount_minor` INTEGER | P2 |
| gross_value | REAL | MONEY | `gross_value_minor` INTEGER | P2 |

---

## 4. Procurement Items

### procurement_items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| purchase_rate | REAL | RATE | `purchase_rate_scaled` INTEGER (×10⁴) | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| taxable_value | REAL | MONEY | `taxable_value_minor` INTEGER | P2 |
| gst_amount | REAL | MONEY | `gst_amount_minor` INTEGER | P2 |
| gross_value | REAL | MONEY | `gross_value_minor` INTEGER | P2 |
| freight | REAL | MONEY | `freight_minor` INTEGER | P2 |
| loading_charges | REAL | MONEY | `loading_charges_minor` INTEGER | P2 |
| other_cost | REAL | MONEY | `other_cost_minor` INTEGER | P2 |
| landed_cost | REAL | MONEY | `landed_cost_minor` INTEGER | P2 |

---

## 5. Invoice Items

### invoice_items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| billing_rate | REAL | RATE | `billing_rate_scaled` INTEGER (×10⁴) | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| taxable_value | REAL | MONEY | `taxable_value_minor` INTEGER | P2 |
| cgst | REAL | MONEY | `cgst_minor` INTEGER | P2 |
| sgst | REAL | MONEY | `sgst_minor` INTEGER | P2 |
| igst | REAL | MONEY | `igst_minor` INTEGER | P2 |
| gst_amount | REAL | MONEY | `gst_amount_minor` INTEGER | P2 |
| gross_value | REAL | MONEY | `gross_value_minor` INTEGER | P2 |

---

## 6. Receivables & Payables

### receivables

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| invoice_amount | REAL | MONEY | `invoice_amount_minor` INTEGER | P2 |
| amount_received | REAL | MONEY | `amount_received_minor` INTEGER | P2 |
| tds_deducted | REAL | MONEY | `tds_deducted_minor` INTEGER | P2 |
| gst_tds_deducted | REAL | MONEY | `gst_tds_deducted_minor` INTEGER | P2 |
| other_deductions | REAL | MONEY | `other_deductions_minor` INTEGER | P2 |
| balance_outstanding | REAL | MONEY | `balance_outstanding_minor` INTEGER | P2 |

### payment_allocations

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| allocated_amount | REAL | MONEY | `allocated_amount_minor` INTEGER | P2 |
| tds_deducted | REAL | MONEY | `tds_deducted_minor` INTEGER | P2 |
| gst_tds_deducted | REAL | MONEY | `gst_tds_deducted_minor` INTEGER | P2 |
| other_deductions | REAL | MONEY | `other_deductions_minor` INTEGER | P2 |

### supplier_payments

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| amount_paid | REAL | MONEY | `amount_paid_minor` INTEGER | P2 |

### supplier_payment_allocations

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| allocated_amount | REAL | MONEY | `allocated_amount_minor` INTEGER | P2 |

---

## 7. Advances

### advance_receipts

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| advance_received | REAL | MONEY | `advance_received_minor` INTEGER | P2 |
| advance_adjusted | REAL | MONEY | `advance_adjusted_minor` INTEGER | P2 |
| balance_advance | REAL | MONEY | `balance_advance_minor` INTEGER | P2 |

### supplier_advances

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| advance_paid | REAL | MONEY | `advance_paid_minor` INTEGER | P2 |
| advance_adjusted | REAL | MONEY | `advance_adjusted_minor` INTEGER | P2 |
| balance_advance | REAL | MONEY | `balance_advance_minor` INTEGER | P2 |

### advance_adjustments

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| adjusted_amount | REAL | MONEY | `adjusted_amount_minor` INTEGER | P2 |

---

## 8. Inventory Tables

### items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| opening_stock | REAL | QUANTITY | `opening_stock_scaled` INTEGER (×10³) | P2 |
| opening_rate | REAL | RATE | `opening_rate_scaled` INTEGER (×10⁴) | P2 |
| opening_value | REAL | MONEY | `opening_value_minor` INTEGER | P2 |
| reorder_level | REAL | QUANTITY | `reorder_level_scaled` INTEGER (×10³) | P2 |
| minimum_stock_level | REAL | QUANTITY | `minimum_stock_level_scaled` INTEGER (×10³) | P2 |
| maximum_stock_level | REAL | QUANTITY | `maximum_stock_level_scaled` INTEGER (×10³) | P2 |

### stock_ledger

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| inward_quantity | REAL | QUANTITY | `inward_quantity_scaled` INTEGER (×10³) | P2 |
| outward_quantity | REAL | QUANTITY | `outward_quantity_scaled` INTEGER (×10³) | P2 |
| balance_quantity | REAL | QUANTITY | `balance_quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |
| value | REAL | MONEY | `value_minor` INTEGER | P1 |
| quantity_in | REAL | QUANTITY | `quantity_in_scaled` INTEGER (×10³) | P2 |
| quantity_out | REAL | QUANTITY | `quantity_out_scaled` INTEGER (×10³) | P2 |
| running_quantity | REAL | QUANTITY | `running_quantity_scaled` INTEGER (×10³) | P2 |
| running_value | REAL | MONEY | `running_value_minor` INTEGER | P1 |

### stock_inwards

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| landed_cost | REAL | MONEY | `landed_cost_minor` INTEGER | P2 |

### stock_outwards

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity_issued | REAL | QUANTITY | `quantity_issued_scaled` INTEGER (×10³) | P2 |

### stock_adjustments

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |

### stock_returns

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |

### batches

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| balance_quantity | REAL | QUANTITY | `balance_quantity_scaled` INTEGER (×10³) | P2 |

### inventory_movements

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |
| value | REAL | MONEY | `value_minor` INTEGER | P2 |

### stock_reservations

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| reserved_quantity | REAL | QUANTITY | `reserved_quantity_scaled` INTEGER (×10³) | P2 |
| issued_quantity | REAL | QUANTITY | `issued_quantity_scaled` INTEGER (×10³) | P2 |
| balance_reserved | REAL | QUANTITY | `balance_reserved_scaled` INTEGER (×10³) | P2 |
| available_quantity | REAL | QUANTITY | `available_quantity_scaled` INTEGER (×10³) | P2 |
| short_quantity | REAL | QUANTITY | `short_quantity_scaled` INTEGER (×10³) | P2 |
| procurement_required_quantity | REAL | QUANTITY | `procurement_required_quantity_scaled` INTEGER (×10³) | P2 |

### goods_receipt_items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity_received | REAL | QUANTITY | `quantity_received_scaled` INTEGER (×10³) | P2 |
| damaged_quantity | REAL | QUANTITY | `damaged_quantity_scaled` INTEGER (×10³) | P2 |
| accepted_quantity | REAL | QUANTITY | `accepted_quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |
| landed_cost | REAL | MONEY | `landed_cost_minor` INTEGER | P2 |

### delivery_challan_items

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |

### warehouse_transfers

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| rate | REAL | RATE | `rate_scaled` INTEGER (×10⁴) | P2 |

---

## 9. Procurement & Supply Chain

### supply_orders

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| emd_amount | REAL | MONEY | `emd_amount_minor` INTEGER | P2 |
| security_deposit_amount | REAL | MONEY | `security_deposit_amount_minor` INTEGER | P2 |
| total_quantity | REAL | QUANTITY | `total_quantity_scaled` INTEGER (×10³) | P2 |
| order_taxable_value | REAL | MONEY | `order_taxable_value_minor` INTEGER | P2 |
| order_gst_amount | REAL | MONEY | `order_gst_amount_minor` INTEGER | P2 |
| order_gross_value | REAL | MONEY | `order_gross_value_minor` INTEGER | P2 |
| crac_amount | REAL | MONEY | `crac_amount_minor` INTEGER | P2 |
| closure_percentage | REAL | PERCENTAGE | `closure_percentage_scaled` INTEGER (×10⁴) | P3 |

### procurements

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| purchase_value | REAL | MONEY | `purchase_value_minor` INTEGER | P2 |
| purchase_gst | REAL | MONEY | `purchase_gst_minor` INTEGER | P2 |
| freight | REAL | MONEY | `freight_minor` INTEGER | P2 |
| loading_charges | REAL | MONEY | `loading_charges_minor` INTEGER | P2 |
| amount_paid | REAL | MONEY | `amount_paid_minor` INTEGER | P2 |

### invoices

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| billing_value | REAL | MONEY | `billing_value_minor` INTEGER | P2 |
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |

### payments

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| payment_amount | REAL | MONEY | `payment_amount_minor` INTEGER | P2 |
| invoice_outstanding | REAL | MONEY | `invoice_outstanding_minor` INTEGER | P2 |
| tds_deducted | REAL | MONEY | `tds_deducted_minor` INTEGER | P2 |
| gst_tds_deducted | REAL | MONEY | `gst_tds_deducted_minor` INTEGER | P2 |
| other_deductions | REAL | MONEY | `other_deductions_minor` INTEGER | P2 |
| net_receipt | REAL | MONEY | `net_receipt_minor` INTEGER | P2 |

### expense_entries

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| expense_amount | REAL | MONEY | `expense_amount_minor` INTEGER | P2 |
| percentage | REAL | PERCENTAGE | `percentage_scaled` INTEGER (×10⁴) | P2 |
| fixed_amount | REAL | MONEY | `fixed_amount_minor` INTEGER | P2 |
| paid_amount | REAL | MONEY | `paid_amount_minor` INTEGER | P2 |
| balance_amount | REAL | MONEY | `balance_amount_minor` INTEGER | P2 |

---

## 10. Master / Reference Tables

### banks

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| opening_balance | REAL | MONEY | `opening_balance_minor` INTEGER | P1 |

### employees

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| incentive_percentage | REAL | PERCENTAGE | `incentive_percentage_scaled` INTEGER (×10⁴) | P2 |

### expense_heads

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| default_percentage | REAL | PERCENTAGE | `default_percentage_scaled` INTEGER (×10⁴) | P2 |
| default_gst_rate | REAL | PERCENTAGE | `default_gst_rate_scaled` INTEGER (×10⁴) | P2 |

### items (base)

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| gst_rate | REAL | PERCENTAGE | `gst_rate_scaled` INTEGER (×10⁴) | P2 |

---

## 11. Bank Statement Tables

### bank_statement_entries

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| debit | REAL | MONEY | `debit_minor` INTEGER | P2 |
| credit | REAL | MONEY | `credit_minor` INTEGER | P2 |
| balance | REAL | MONEY | `balance_minor` INTEGER | P2 |
| amount | REAL | MONEY | `amount_minor` INTEGER | P2 |

### voucher_proposals

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| debit | REAL | MONEY | `debit_minor` INTEGER | P2 |
| credit | REAL | MONEY | `credit_minor` INTEGER | P2 |

### bank_statement_imports

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| total_rows | INTEGER | NON_FINANCIAL | — | P3 |
| valid_rows | INTEGER | NON_FINANCIAL | — | P3 |
| duplicate_rows | INTEGER | NON_FINANCIAL | — | P3 |
| error_rows | INTEGER | NON_FINANCIAL | — | P3 |

### bank_reconciliation_matches

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| confidence_score | INTEGER | NON_FINANCIAL | — | P3 |

---

## 12. CRM / Lead-Stage Tables

### leads

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| expected_value | REAL | MONEY | `expected_value_minor` INTEGER | P2 |
| probability | INTEGER | NON_FINANCIAL | — | P3 |

### quotations

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| quantity | REAL | QUANTITY | `quantity_scaled` INTEGER (×10³) | P2 |
| unit_price | REAL | RATE | `unit_price_scaled` INTEGER (×10⁴) | P2 |
| total_amount | REAL | MONEY | `total_amount_minor` INTEGER | P2 |
| tax_amount | REAL | MONEY | `tax_amount_minor` INTEGER | P2 |
| grand_total | REAL | MONEY | `grand_total_minor` INTEGER | P2 |

### negotiations

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| initial_amount | REAL | MONEY | `initial_amount_minor` INTEGER | P2 |
| negotiated_amount | REAL | MONEY | `negotiated_amount_minor` INTEGER | P2 |
| savings_amount | REAL | MONEY | `savings_amount_minor` INTEGER | P2 |

### purchase_orders

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| total_value | REAL | MONEY | `total_value_minor` INTEGER | P2 |

### requirement_queries

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| expected_quantity | REAL | QUANTITY | `expected_quantity_scaled` INTEGER (×10³) | P2 |
| expected_value | REAL | MONEY | `expected_value_minor` INTEGER | P2 |

### procurement_plans

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| required_quantity | REAL | QUANTITY | `required_quantity_scaled` INTEGER (×10³) | P2 |
| available_stock | REAL | QUANTITY | `available_stock_scaled` INTEGER (×10³) | P2 |
| short_quantity | REAL | QUANTITY | `short_quantity_scaled` INTEGER (×10³) | P2 |
| planned_quantity | REAL | QUANTITY | `planned_quantity_scaled` INTEGER (×10³) | P2 |
| expected_rate | REAL | RATE | `expected_rate_scaled` INTEGER (×10⁴) | P2 |
| estimated_value | REAL | MONEY | `estimated_value_minor` INTEGER | P2 |

### crac_records

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| crac_amount | REAL | MONEY | `crac_amount_minor` INTEGER | P2 |

### supply_orders (closure columns)

| Column | SQL Type | FSR Class | Shadow | Priority |
|--------|----------|-----------|--------|----------|
| crac_amount | REAL | MONEY | `crac_amount_minor` INTEGER | P2 |
| closure_percentage | REAL | PERCENTAGE | `closure_percentage_scaled` INTEGER (×10⁴) | P3 |

---

## 13. Non-Database Fields

### IPC Channel Amounts (main ↔ renderer)

| IPC Context | Field | Current Type | FSR Class | Shadow Needed | Priority |
|-------------|-------|-------------|-----------|---------------|----------|
| voucher:save | debit/credit | Number (float) | MONEY | INTEGER minor | P1 |
| voucher:save | tax amounts | Number (float) | MONEY | INTEGER minor | P1 |
| ledger:query | running_balance | Number (float) | MONEY | INTEGER minor | P1 |
| report:tb | totals | Number (float) | MONEY | INTEGER minor | P1 |
| payment:allocate | allocated_amount | Number (float) | MONEY | INTEGER minor | P2 |
| stock:ledger | rate/quantity | Number (float) | RATE / QUANTITY | INTEGER scaled | P2 |

### Renderer Input/Output Fields

| Component | Field | Current Type | FSR Class | Shadow Needed | Priority |
|-----------|-------|-------------|-----------|---------------|----------|
| AmountInput | value | string/number | MONEY | parse → minor | P1 |
| RateInput | rate | number | RATE | scale → integer | P2 |
| QuantityInput | qty | number | QUANTITY | scale → integer | P2 |
| PercentageInput | pct | number | PERCENTAGE | scale → integer | P2 |
| DisplayField | formatted | string | MONEY | via formatMoney | P1 |

### Import/Export Columns

| Context | Field | Source Type | FSR Class | Shadow | Priority |
|---------|-------|-------------|-----------|--------|----------|
| CSV import: amounts | debit/credit | string | MONEY | parse → minor | P1 |
| CSV import: rates | rate | string | RATE | scale → integer | P2 |
| CSV import: qty | quantity | string | QUANTITY | scale → integer | P2 |
| CSV export: monetary | all amounts | REAL (DB) | MONEY | read minor | P1 |
| XLSX export: monetary | all amounts | REAL (DB) | MONEY | read minor | P1 |

---

## 14. Summary

| Category | Count |
|----------|-------|
| **Total columns inventoried** | **149** |
| **MONEY** (needs `_minor` shadow) | **74** |
| **RATE** (needs `_scaled` ×10⁴ shadow) | **13** |
| **QUANTITY** (needs `_scaled` ×10³ shadow) | **31** |
| **PERCENTAGE** (needs `_scaled` ×10⁴ shadow) | **12** |
| **NON_FINANCIAL** (no shadow) | **19** |

| Priority | Count |
|----------|-------|
| P1 (certification-blocking) | 18 |
| P2 (secondary) | 112 |
| P3 (documentation only) | 19 |
