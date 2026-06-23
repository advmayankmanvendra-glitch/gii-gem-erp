import React from "react";
import { formatCurrency } from "../../utils/formatters.js";

export function PaymentReadinessTable({ rows, onNavigate }) {
  return (
    <section className="panel">
      <div className="panel-head"><div><h3>Payment Readiness</h3><span>{rows.length} order(s)</span></div></div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order Number</th><th>Department</th><th>Invoice Number</th><th>Invoice Date</th>
                <th>Invoice Amount</th><th>CRAC Status</th><th>CRAC Number</th><th>CRAC Date</th>
                <th>Days Since CRAC</th><th>Payment Status</th><th>Amount Received</th><th>Balance Outstanding</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.order_id}-${row.invoice_id}`}>
                  <td>{row.order_number}</td>
                  <td>{row.department_name}</td>
                  <td>{row.invoice_number || "-"}</td>
                  <td>{row.invoice_date || "-"}</td>
                  <td>{formatCurrency(row.invoice_amount || 0)}</td>
                  <td><span className={`status-pill ${row.crac_status === "Generated" ? "active" : "warning"}`}>{row.crac_status || "Not Required"}</span></td>
                  <td>{row.crac_number || "-"}</td>
                  <td>{row.crac_date || "-"}</td>
                  <td>{row.days_since_crac !== null ? Math.round(row.days_since_crac) : "-"}</td>
                  <td><span className={`status-pill ${row.payment_status === "Paid" ? "active" : "warning"}`}>{row.payment_status}</span></td>
                  <td>{formatCurrency(row.amount_received || 0)}</td>
                  <td>{formatCurrency(row.balance_outstanding || 0)}</td>
                  <td>
                    <div className="button-row">
                      {onNavigate && <button type="button" className="ghost-btn" onClick={() => onNavigate("supply_orders", { section: "entry" })}>View Order</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact"><strong>No Data</strong><span>No payment readiness records match the current filters.</span></div>
      )}
    </section>
  );
}
