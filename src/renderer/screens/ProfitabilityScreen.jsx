import React, { useEffect, useState } from "react";
import { EmptyState, Metric } from "../components/common.jsx";
import { ReportToolbar } from "../components/forms/index.jsx";
import { formatCurrency } from "../utils/formatters.js";

export function ProfitabilityScreen({ notify, companyContext, apiClient, onNavigate }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    apiClient.getProfitability(companyContext).then(setRows).catch((error) => notify(error.message, "error"));
  }, [companyContext?.company_id, companyContext?.company_scope]);

  const totals = rows.reduce((acc, row) => ({
    billingValue: acc.billingValue + row.billingValue,
    purchaseValue: acc.purchaseValue + (row.inventoryCostBasis ?? row.purchaseValue),
    grossMargin: acc.grossMargin + row.grossMargin,
    gstInputLoss: acc.gstInputLoss + row.gstInputLoss,
    totalExpenses: acc.totalExpenses + row.totalExpenses,
    employeeIncentive: acc.employeeIncentive + row.employeeIncentive,
    netCompanyProfit: acc.netCompanyProfit + row.netCompanyProfit
  }), { billingValue: 0, purchaseValue: 0, grossMargin: 0, gstInputLoss: 0, totalExpenses: 0, employeeIncentive: 0, netCompanyProfit: 0 });

  return (
    <section className="page">
      <div className="metric-grid profit-grid">
        <Metric label="Billing" value={formatCurrency(totals.billingValue)} note="Total invoices" icon="file" />
        <Metric label="Gross Margin" value={formatCurrency(totals.grossMargin)} note="Billing - cost basis" icon="trend" />
        <Metric label="GST Impact" value={formatCurrency(totals.gstInputLoss)} note="Gross margin x GST rate" icon="bank" />
        <Metric label="Net Profit" value={formatCurrency(totals.netCompanyProfit)} note="After expense and incentive" icon="rupee" />
      </div>
      <section className="panel records-panel report-panel">
        <ReportToolbar
          title="Order-wise Profitability"
          note={`${companyContext?.company_name || "No company selected"} - Gross Margin - GST Input Loss - Dynamic Expenses - Employee Incentive`}
        />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Billing</th>
                  <th>Cost Basis</th>
                  <th>Gross Margin</th>
                  <th>GST Impact</th>
                  <th>Expenses</th>
                  <th>Incentive</th>
                  <th>Net Profit</th>
                  <th>ROI</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.order_number}</strong><br /><span>{row.department_name} - {row.employee_name}</span></td>
                    <td>{formatCurrency(row.billingValue)}</td>
                    <td>{formatCurrency(row.inventoryCostBasis ?? row.purchaseValue)}<br /><span>{row.inventoryCostSource || "Procurement Value"}</span></td>
                    <td>{formatCurrency(row.grossMargin)}</td>
                    <td>{formatCurrency(row.gstInputLoss)}</td>
                    <td>{formatCurrency(row.totalExpenses)}</td>
                    <td>{formatCurrency(row.employeeIncentive)}</td>
                    <td><strong className={row.netCompanyProfit < 0 ? "loss" : "profit"}>{formatCurrency(row.netCompanyProfit)}</strong></td>
                    <td>{Number(row.roiPercentage || 0).toFixed(2)}%</td>
                    <td><button className="ghost-btn small-btn" type="button" onClick={() => onNavigate && onNavigate("supply_orders", { recordId: row.id })} title="View order details">View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No profitability data" note="Create an order, procurement, billing and expenses to calculate profit." />}
      </section>
    </section>
  );
}
