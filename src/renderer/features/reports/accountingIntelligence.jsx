import React from "react";
import { formatCurrency } from "../../utils/formatters.js";

const profileMap = {
  trial_balance: {
    title: "Universal accounting structure",
    note: "Ledger balances are grouped so accountants can verify the books without editing ledger entries directly.",
    path: ["Trial Balance", "Group", "Ledger", "Voucher", "Source", "Documents", "Audit Trail"]
  },
  profit_loss: {
    title: "Profit and loss structure",
    note: "Income, purchases, stock movement, direct expenses and indirect expenses should reconcile to posted vouchers and order profitability.",
    path: ["Profit & Loss", "Group", "Ledger", "Voucher", "Order / Expense", "Profitability Evidence"]
  },
  balance_sheet: {
    title: "Balance sheet structure",
    note: "Assets and liabilities are presented from posted ledger balances as on the selected report date.",
    path: ["Balance Sheet", "Group", "Ledger", "Voucher", "Source", "Supporting Document", "Audit Trail"]
  },
  gst_register: {
    title: "GST verification structure",
    note: "GST register lines should reconcile with GST summary, sales, purchases, receipts and payment evidence.",
    path: ["GST Register", "Invoice / Purchase", "Voucher", "GST Summary", "Source", "Audit Trail"]
  },
  tds_register: {
    title: "TDS verification structure",
    note: "TDS and GST TDS deductions should reconcile with receivable allocations and department ledgers.",
    path: ["TDS Register", "Receipt Allocation", "Invoice", "Department Ledger", "Audit Trail"]
  },
  party_ledger: {
    title: "Party ledger verification",
    note: "Party balances should reconcile with bill-wise receivables, payables and allocation workflows.",
    path: ["Party Ledger", "Voucher", "Invoice / Purchase", "Allocation", "Source", "Audit Trail"]
  }
};

const governmentSupplyChecks = [
  "Order-wise profit",
  "GST impact",
  "Employee incentive",
  "Supplier payable",
  "Department receivable",
  "Stock reservation",
  "Procurement requirement",
  "Document checklist",
  "Order closure readiness"
];

/** Classifies an account row into a commerce-friendly report group. */
export function classifyAccountGroup(row = {}) {
  const type = String(row.account_type || row.type || "").toLowerCase();
  const name = String(row.account_name || row.ledger_name || "").toLowerCase();
  if (name.includes("trade receivable") || name.includes("sundry debtor")) return "Trade Receivables";
  if (name.includes("trade payable") || name.includes("sundry creditor")) return "Trade Payables";
  if (name.includes("bank")) return "Bank / Cash";
  if (name.includes("cash")) return "Bank / Cash";
  if (name.includes("gst") || name.includes("tds") || name.includes("duties")) return "Duties & Taxes";
  if (name.includes("sales")) return "Sales Accounts";
  if (name.includes("purchase")) return "Purchase Accounts";
  if (type.includes("fixed")) return "Fixed Assets";
  if (type.includes("current asset") || type === "asset") return "Current Assets";
  if (type.includes("asset")) return "Fixed / Current Assets";
  if (type.includes("current liab")) return "Current Liabilities";
  if (type.includes("liab")) return "Loans / Liabilities";
  if (type.includes("equity") || type.includes("capital")) return "Capital / Equity";
  if (type.includes("income")) return "Income";
  if (type.includes("direct expense")) return "Direct Expenses";
  if (type.includes("expense")) return "Indirect Expenses";
  return "Suspense / Other";
}

/** Adds presentation-only group and Dr/Cr labels to accounting rows. */
export function enrichAccountingRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    structure_group: row.structure_group || classifyAccountGroup(row),
    closing_side: row.closing_side || getBalanceSide(row)
  }));
}

/** Builds the read-only intelligence panel for accounting reports. */
export function AccountingStructureSummary({ view, data = {}, rows = [], config = {} }) {
  const profile = profileMap[view] || profileMap.party_ledger;
  const metrics = buildStatementMetrics(view, data, rows);
  const supplyFacts = buildGovernmentSupplyFacts(data);
  return (
    <div className="accounting-intelligence-panel">
      <div className="accounting-intelligence-header">
        <div>
          <strong>{profile.title}</strong>
          <span>{profile.note}</span>
        </div>
        <small>{config.title || "Report"} uses posted or validated ERP data only.</small>
      </div>
      <div className="accounting-intelligence-grid">
        {metrics.map((metric) => (
          <div className="metric-line" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <EvidencePath title="Drilldown evidence path" steps={profile.path} />
      {supplyFacts.length ? (
        <div className="government-supply-map">
          <strong>Government supply intelligence</strong>
          <div>
            {supplyFacts.map((fact) => <span key={fact}>{fact}</span>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Builds the stock report intelligence panel without changing stock math. */
export function StockAccountingStructureSummary({ mode, selectedItem, totals = {}, rows = [] }) {
  const activeLabel = mode === "summary" ? "Stock Summary" : mode === "monthly" ? "Monthly Movement" : "Stock Item Ledger";
  const itemLabel = selectedItem?.item_name || "All stock items";
  const useReportTotals = mode === "summary";
  const stockMetrics = [
    ["Inward Value", formatCurrency(useReportTotals ? totals.inwardValue : sumRows(rows, "inward_value"))],
    ["Outward Value", formatCurrency(useReportTotals ? totals.outwardValue : sumRows(rows, "outward_value"))],
    ["Closing Value", formatCurrency(useReportTotals ? totals.closingValue : getLastValue(rows, "closing_value"))],
    ["Verification Mode", activeLabel]
  ];
  return (
    <div className="accounting-intelligence-panel stock-intelligence-panel">
      <div className="accounting-intelligence-header">
        <div>
          <strong>Stock verification structure</strong>
          <span>{itemLabel} can be traced from stock summary into monthly movement and voucher-wise stock ledger.</span>
        </div>
        <small>Stock values are read from existing inventory movement data.</small>
      </div>
      <div className="accounting-intelligence-grid">
        {stockMetrics.map(([label, value]) => (
          <div className="metric-line" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <EvidencePath
        title="Stock evidence path"
        steps={["Stock Summary", "Item Position", "Monthly Movement", "Stock Ledger", "GRN / Issue / Adjustment", "Order / Procurement / Invoice", "Voucher"]}
      />
    </div>
  );
}

/** Renders a compact evidence path used by accounting and stock reports. */
function EvidencePath({ title, steps }) {
  return (
    <div className="accounting-evidence-path" aria-label={title}>
      <strong>{title}</strong>
      <div>
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            <span className="accounting-evidence-step">{step}</span>
            {index < steps.length - 1 ? <small>&gt;</small> : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/** Builds summary metrics from already-loaded report data. */
function buildStatementMetrics(view, data, rows) {
  if (view === "profit_loss") {
    const summary = data.profitLoss || {};
    return [
      { label: "Income", value: formatCurrency(summary.income || 0) },
      { label: "Expenses", value: formatCurrency(summary.expenses || 0) },
      { label: "Net Profit", value: formatCurrency(summary.netProfit || 0) },
      { label: "Rows", value: rows.length }
    ];
  }
  if (view === "balance_sheet") {
    const summary = data.balanceSheet || {};
    return [
      { label: "Assets", value: formatCurrency(summary.assets || 0) },
      { label: "Liabilities + Equity", value: formatCurrency(summary.liabilitiesAndEquity || 0) },
      { label: "Difference", value: formatCurrency(summary.difference || 0) },
      { label: "Rows", value: rows.length }
    ];
  }
  if (view === "gst_register") {
    const registers = data.gstRegisters || {};
    return [
      { label: "Output GST", value: formatCurrency(registers.outputGst || registers.outputGST || 0) },
      { label: "Input GST", value: formatCurrency(registers.inputGst || registers.inputGST || 0) },
      { label: "Net Payable", value: formatCurrency(registers.payable || 0) },
      { label: "Rows", value: rows.length }
    ];
  }
  return [
    { label: "Debit Total", value: formatCurrency(sumRows(rows, "debit")) },
    { label: "Credit Total", value: formatCurrency(sumRows(rows, "credit")) },
    { label: "Difference", value: formatCurrency(Math.abs(sumRows(rows, "debit") - sumRows(rows, "credit"))) },
    { label: "Rows", value: rows.length }
  ];
}

/** Converts available report arrays into government supply evidence labels. */
function buildGovernmentSupplyFacts(data) {
  const facts = [];
  addFact(facts, "Department receivable", data.billWiseReceivables?.length);
  addFact(facts, "Supplier payable", data.billWisePayables?.length);
  addFact(facts, "Receipt allocation", data.allocationReconciliation?.length);
  addFact(facts, "Party reconciliation", data.partyReconciliation?.length);
  if (!facts.length) return governmentSupplyChecks.slice(0, 5);
  return facts;
}

/** Adds a labeled fact when source evidence is present. */
function addFact(facts, label, count) {
  if (Number(count || 0) > 0) facts.push(`${label}: ${count} row(s)`);
}

/** Computes a visible Dr/Cr indicator from row balances. */
function getBalanceSide(row) {
  const debit = Number(row.debit || 0);
  const credit = Number(row.credit || 0);
  const amount = Number(row.amount ?? row.balance ?? debit - credit);
  if (debit > credit || amount > 0) return "Dr";
  if (credit > debit || amount < 0) return "Cr";
  return "-";
}

/** Sums numeric values from a report row list. */
function sumRows(rows, key) {
  return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0);
}

/** Returns a numeric value from the last row for running-balance style reports. */
function getLastValue(rows, key) {
  return Number(rows.at(-1)?.[key] || 0);
}
