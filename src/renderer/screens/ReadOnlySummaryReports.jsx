import React from "react";
import { SummaryTable } from "../components/common.jsx";
import { sumRupees } from "../utils/money.js";

export function EmployeePerformanceSummary({ rows }) {
  const byEmployee = groupRows(rows, "employee_name", (items) => ({
    orders: items.length,
    billing: sumRows(items, "billingValue"),
    collections: sumRows(items, "amountReceived"),
    profit: sumRows(items, "netCompanyProfit"),
    incentive: sumRows(items, "employeeIncentive")
  }));

  return <SummaryTable title="Employee Ranking Dashboard" rows={byEmployee} columns={["orders", "billing", "collections", "profit", "incentive"]} />;
}

export function CashFlowSummary({ accounting, onNavigate }) {
  const rows = (accounting?.cashBank || []).map((row) => ({
    name: `${row.transaction_date} ${row.transaction_type}`,
    received: row.debit,
    paid: row.credit,
    balance: row.balance
  }));

  return (
    <>
      <SummaryTable title="Cash/Bank Book" rows={rows} columns={["received", "paid", "balance"]} />
      <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("cash_bank_ledger")}>View Full Cash/Bank Ledger Report</button></div>
    </>
  );
}

export function GstSummary({ accounting, onNavigate }) {
  const gst = accounting?.gstSummary;
  const rows = gst ? [{
    name: "Current Period",
    input_gst: gst.inputGst,
    output_gst: gst.outputGst,
    net_gst_payable: gst.netGstPayable,
    gst_impact: gst.gstImpactOnProfitability
  }] : [];

  return (
    <>
      <SummaryTable title="GST Summary" rows={rows} columns={["input_gst", "output_gst", "net_gst_payable", "gst_impact"]} />
      <div className="workflow-note" style={{ marginTop: 8 }}><button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("gst_register")}>View Full GST Register</button></div>
    </>
  );
}

export function AccountingReportsIndex({ accounting, onNavigate }) {
  return (
    <>
      <SummaryTable title="Accounting Reports Index" rows={[
        { name: "Day Book", rows: accounting?.dayBook?.length || 0 },
        { name: "Trial Balance", rows: accounting?.trialBalance?.length || 0 },
        { name: "General Ledger", rows: accounting?.ledger?.length || 0 },
        { name: "Cash/Bank Book", rows: accounting?.cashBank?.length || 0 },
        { name: "Profit & Loss", rows: accounting?.profitLoss?.rows?.length || 0 },
        { name: "Balance Sheet", rows: accounting?.balanceSheet?.rows?.length || 0 },
        { name: "Receivable Ageing", rows: accounting?.receivables?.length || 0 },
        { name: "Supplier Payable Ageing", rows: accounting?.payables?.length || 0 },
        { name: "GST Summary", rows: accounting?.gstSummary ? 1 : 0 }
      ]} columns={["rows"]} />
      <div className="workflow-note" style={{ marginTop: 8 }}>
        <button className="ghost-btn" type="button" onClick={() => onNavigate && onNavigate("day_book")}>Open Day Book</button>
        <button className="ghost-btn" type="button" style={{ marginLeft: 8 }} onClick={() => onNavigate && onNavigate("trial_balance")}>Open Trial Balance</button>
        <button className="ghost-btn" type="button" style={{ marginLeft: 8 }} onClick={() => onNavigate && onNavigate("ledger_view")}>Open General Ledger</button>
      </div>
    </>
  );
}

function groupRows(rows, key, build) {
  const groups = new Map();
  rows.forEach((row) => {
    const name = row[key] || "Unassigned";
    groups.set(name, [...(groups.get(name) || []), row]);
  });
  return [...groups.entries()].map(([name, items]) => ({ name, ...build(items) })).sort((a, b) => (b.profit || 0) - (a.profit || 0));
}

function sumRows(rows, key) {
  return sumRupees(rows.map((row) => row[key]));
}
