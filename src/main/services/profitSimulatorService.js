// Profit Simulator: what-if figures on top of the order profitability report.
// Nothing here is saved or posted; it only recalculates totals for the screen.
// The calculation lives in the main process (AGENTS.md: no business logic in screens).

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

// Sums the order profitability rows into the baseline the simulator starts from.
export function profitBaseline(rows = []) {
  const totals = rows.reduce((acc, row) => ({
    billingValue: acc.billingValue + toNumber(row.billingValue),
    purchaseValue: acc.purchaseValue + toNumber(row.inventoryCostBasis ?? row.purchaseValue),
    grossMargin: acc.grossMargin + toNumber(row.grossMargin),
    gstInputLoss: acc.gstInputLoss + toNumber(row.gstInputLoss),
    totalExpenses: acc.totalExpenses + toNumber(row.totalExpenses),
    employeeIncentive: acc.employeeIncentive + toNumber(row.employeeIncentive),
    netCompanyProfit: acc.netCompanyProfit + toNumber(row.netCompanyProfit)
  }), { billingValue: 0, purchaseValue: 0, grossMargin: 0, gstInputLoss: 0, totalExpenses: 0, employeeIncentive: 0, netCompanyProfit: 0 });
  const roi = totals.purchaseValue > 0 ? (totals.netCompanyProfit / totals.purchaseValue) * 100 : 0;
  return { ...totals, roi };
}

// Applies the percentage adjustments to the baseline. Percentages are clamped so a
// typing slip cannot produce a meaningless figure (for example a 5,000% incentive).
export function simulateScenario(baseline, params = {}) {
  const pct = (value, min, max) => Math.min(Math.max(toNumber(value), min), max) / 100;
  const billingAdj = 1 + pct(params.billingAdjustment, -100, 1000);
  const costAdj = 1 + pct(params.costAdjustment, -100, 1000);
  const expenseAdj = 1 + pct(params.expenseAdjustment, -100, 1000);
  const incentivePct = pct(params.incentivePercent, 0, 100);
  const gstRate = pct(params.gstRateOverride, 0, 100);

  const billing = baseline.billingValue * billingAdj;
  const cost = baseline.purchaseValue * costAdj;
  const grossMargin = billing - cost;
  const gstImpact = baseline.gstInputLoss > 0 && gstRate > 0
    ? grossMargin * gstRate
    : baseline.gstInputLoss * expenseAdj;
  const expenses = baseline.totalExpenses * expenseAdj;
  const initialProfit = grossMargin - gstImpact - expenses;
  const incentive = initialProfit * incentivePct;
  const netProfit = initialProfit - incentive;
  const roi = cost > 0 ? (netProfit / cost) * 100 : 0;
  return { billing, cost, grossMargin, gstImpact, expenses, incentive, netProfit, roi };
}

// One call for the screen: the baseline from the live report and the scenario on top.
export function profitSimulation(rows, params) {
  const baseline = profitBaseline(rows);
  return { rows, baseline, scenario: simulateScenario(baseline, params) };
}
