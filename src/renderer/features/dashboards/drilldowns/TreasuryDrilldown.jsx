import React, { useState, useEffect } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { buildTreasuryOverview } from "../treasuryService.js";
import { DrilldownBase } from "./DrilldownBase.jsx";
import { sumRupees } from "../../../utils/money.js";

export function TreasuryDrilldown({ apiClient, companyContext, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiClient) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiClient.getAccountingData(companyContext),
      apiClient.getBankLedgers ? apiClient.getBankLedgers(companyContext) : Promise.resolve([])
    ]).then(([accounting, bankLedgers]) => {
      setData({ accounting, bankLedgers });
      setLoading(false);
    }).catch((err) => {
      setError(err.message || "Could not load treasury data. Check the selected company, then reopen this view from the Dashboard.");
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  const accounting = data?.accounting || {};
  const cashBank = accounting.cashBank || [];
  const treasury = buildTreasuryOverview({}, accounting, data?.bankLedgers || []);
  const banks = treasury.bankAccounts || [];
  const cashBalance = treasury.cash.bookCashBalance;
  const bankBalance = sumRupees(banks.map((bank) => bank.bookBalance));

  return (
    <DrilldownBase companyContext={companyContext} title="Treasury Overview" onNavigate={onNavigate} loading={loading} error={error} empty={!cashBank.length && !banks.length} emptyMessage="No cash or bank accounts configured.">
      <div className="drilldown-summary">
        <div className="metric-card"><strong>Cash Balance</strong><span>{formatCurrency(cashBalance)}</span></div>
        <div className="metric-card"><strong>Bank Balance</strong><span>{formatCurrency(bankBalance)}</span></div>
        <div className="metric-card"><strong>Total Treasury</strong><span>{formatCurrency(cashBalance + bankBalance)}</span></div>
      </div>
      {banks.length > 0 && (
        <>
          <h4 className="drilldown-section-title">Bank Accounts</h4>
          <table className="drilldown-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Bank Name</th>
                <th>Account #</th>
                <th>Book Balance</th>
              </tr>
            </thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id ?? b.name}>
                  <td>{b.name || b.account_name || b.bank_name}</td>
                  <td>{b.bankName || b.bank_name || "-"}</td>
                  <td>{b.accountNumber || b.account_number || "-"}</td>
                  <td className="num">{formatCurrency(b.bookBalance || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="drilldown-actions">
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("cash_book")}>Open Cash Book</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("bank_book")}>Open Bank Book</button>
        <button type="button" className="ghost-btn" onClick={() => onNavigate?.("bank_reconciliation")}>Bank Reconciliation</button>
      </div>
    </DrilldownBase>
  );
}
