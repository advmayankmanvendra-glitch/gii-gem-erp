// Percentage expenses (owner decision EXP, 10 Nov 2026 IST): "% of gross" is worked out on the
// posted invoices' gross value (taxable value plus GST) and "% of taxable" on their taxable value
// (invoices.billing_value). Before, the taxable value was treated as the gross value.
export function expenseFormulaAmount(expense, { taxableValue = 0, grossValue = 0 } = {}) {
  const percentage = Number(expense?.percentage || 0) / 100;
  if (expense?.calculation_method === "percentage_gross") return Number(grossValue || 0) * percentage;
  if (expense?.calculation_method === "percentage_taxable") return Number(taxableValue || 0) * percentage;
  return Number(expense?.fixed_amount || 0);
}
