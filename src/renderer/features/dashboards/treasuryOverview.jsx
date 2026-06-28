import React from "react";
import { formatCurrency } from "../../utils/formatters.js";

/** Renders one read-only treasury summary value. */
function TreasuryMetric({ label, value, note }) {
  return (
    <div className="treasury-metric">
      <span>{label}</span>
      <strong>{formatCurrency(value || 0)}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

/** Renders read-only treasury visibility without posting or reconciliation mutations. */
export function TreasuryOverview({ treasury, refreshTime, onOpen }) {
  if (!treasury) return null;
  const banks = treasury.bankAccounts || [];

  return (
    <section className="panel treasury-overview">
      <div className="treasury-head">
        <div>
          <h2>Treasury Overview</h2>
          <p>Cash and bank book visibility for review, reconciliation and collection planning.</p>
        </div>
        <div className="treasury-actions">
          {refreshTime && <span>Last refresh: {refreshTime}</span>}
          <button type="button" className="ghost-btn" onClick={() => onOpen?.("cash_book")}>Cash Book</button>
          <button type="button" className="ghost-btn" onClick={() => onOpen?.("bank_book")}>Bank Book</button>
          <button type="button" className="ghost-btn" onClick={() => onOpen?.("bank_reconciliation")}>Reconciliation</button>
        </div>
      </div>

      <div className="treasury-metrics">
        <TreasuryMetric label="Cash Book Balance" value={treasury.cash?.bookCashBalance} note="Posted cash ledger" />
        <TreasuryMetric label="Available Cash" value={treasury.cash?.availableCash} note="Same as book balance until cash approval rules expand" />
        <TreasuryMetric label="Cash Difference" value={treasury.cash?.difference} note="Expected to remain zero" />
        <TreasuryMetric label="Cash + Bank Total" value={treasury.totals?.bookBalance} note="Read-only dashboard total" />
      </div>

      <div className="treasury-bank-table-wrap">
        <table className="treasury-bank-table">
          <thead>
            <tr>
              <th>Bank Account</th>
              <th>Bank</th>
              <th>Book Balance</th>
              <th>Available Balance</th>
              <th>Difference</th>
              <th>Last Reconciled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {banks.map((bank) => (
              <tr key={bank.id || bank.name}>
                <td>{bank.name}</td>
                <td>{bank.bankName}</td>
                <td>{formatCurrency(bank.bookBalance || 0)}</td>
                <td>{formatCurrency(bank.availableBalance || 0)}</td>
                <td>{formatCurrency(bank.difference || 0)}</td>
                <td>{bank.lastReconciled || "Not reconciled"}</td>
                <td>
                  <button type="button" className="ghost-btn" onClick={() => onOpen?.("bank_book")}>Ledger</button>
                  <button type="button" className="ghost-btn" onClick={() => onOpen?.("bank_reconciliation")}>Reconcile</button>
                </td>
              </tr>
            ))}
            {!banks.length && (
              <tr>
                <td colSpan="7" className="treasury-empty">No active bank rows found for this dashboard context.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {treasury.alerts?.length > 0 && (
        <div className="treasury-alerts">
          {treasury.alerts.map((alert) => <span key={alert} className="treasury-alert">{alert}</span>)}
        </div>
      )}
    </section>
  );
}
