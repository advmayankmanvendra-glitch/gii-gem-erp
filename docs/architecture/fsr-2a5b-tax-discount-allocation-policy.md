# Tax, Discount and Allocation Policy — FSR-2A.5B

## 1. GST Calculation

- Taxable amount first converted to minor units via `parseMoneyToMinor`
- GST amount = `calculatePercentage(taxableMinor, gstRatePct)`
- Example: taxable = ₹1,000 (100,000 paise), GST 18% → `Math.round(100000 * 18 / 100) = 18,000 paise` = ₹180.00
- GST on multiple items: each item's GST computed separately, then summed (not computed on total)
- Round-off: each tax line rounded individually, not on aggregate

## 2. Discount

- `calculatePercentage(amountMinor, discountPct)` if percentage discount
- Or `parseMoneyToMinor(discountAmount)` if fixed amount
- Discount entry split proportionally across taxable lines via `allocateMoney`

## 3. TDS

- TDS base amount → `parseMoneyToMinor` → `calculatePercentage(baseMinor, tdsRatePct)`
- TDS on GST component computed separately if applicable

## 4. Landed Cost Allocation

- Total landed cost (transport, insurance, etc.) → `parseMoneyToMinor`
- Allocated across inward stock items proportionally by quantity or value via `allocateMoney`
- Allocated landed cost added to item's stock_ledger `value_minor`
- Verification: sum of allocated amounts = total landed cost (exact in minor units)

## 5. Receipt/Payment Allocation

- Payment amount → `parseMoneyToMinor`
- Allocated across outstanding bills via `allocateMoney`
- TDS/GST TDS/Other deductions serve as allocation shares
- Verification: sum of allocations + deductions = payment amount (minor units)

## 6. Rounding Rule for Multi-Line Tax Invoices

- Each line: taxableMinor = parseMoneyToMinor(line.taxable)
- Each line: gstMinor = calculatePercentage(taxableMinor, gstPct)
- Invoice total GST = sum of line gstMinor values
- Invoice total = sum of taxableMinor + sum of gstMinor
- This is the exact amount that must balance in debit/credit minor units
- One-paise imbalances are not tolerated; the last line must absorb any rounding residual
