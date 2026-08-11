/** Builds read-only cash and bank visibility from existing accounting rows. */
export function buildTreasuryOverview(counts, accountingData, bankLedgers = []) {
  const cashBankRows = Array.isArray(accountingData?.cashBank) ? accountingData.cashBank : [];
  const bankMasters = Array.isArray(accountingData?.banks)
    ? accountingData.banks
    : (Array.isArray(accountingData?.references?.banks) ? accountingData.references.banks : []);
  const bankRows = Array.isArray(bankLedgers) && bankLedgers.length ? bankLedgers : bankMasters;
  const rowsByBank = new Map();

  cashBankRows.forEach((row) => {
    const key = Number(row.bank_account_id || 0);
    if (!rowsByBank.has(key)) rowsByBank.set(key, []);
    rowsByBank.get(key).push(row);
  });

  const balanceForRows = (rows) => rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);
  const cashRows = rowsByBank.get(0) || cashBankRows.filter((row) => String(row.payment_mode || "").toLowerCase() === "cash");
  const cashBalance = cashBankRows.length ? balanceForRows(cashRows) : Number(counts?.cashBankBalance || 0);
  const bankAccounts = bankRows.map((bank) => {
    const bankId = Number(bank.id || bank.bank_account_id || 0);
    const rows = rowsByBank.get(bankId) || [];
    const bookBalance = balanceForRows(rows);
    return {
      id: bankId,
      name: bank.bank_account_name || bank.account_name || bank.bank_name || `Bank ${bankId || ""}`.trim(),
      bankName: bank.bank_name || "-",
      accountNumber: bank.account_number || "-",
      bookBalance,
      availableBalance: bookBalance,
      difference: 0,
      lastReconciled: rows.length ? rows[rows.length - 1].transaction_date : "Not reconciled"
    };
  });
  const bankTotal = bankAccounts.reduce((sum, bank) => sum + Number(bank.bookBalance || 0), 0);

  return {
    cash: {
      bookCashBalance: cashBalance,
      availableCash: cashBalance,
      difference: 0
    },
    bankAccounts,
    totals: {
      bookBalance: bankTotal + cashBalance,
      availableBalance: bankTotal + cashBalance,
      difference: 0
    },
    alerts: [
      ...(Number(counts?.unpostedVouchers || counts?.draftVouchers || 0) > 0 ? ["Unposted vouchers may affect book balances after posting."] : []),
      ...(bankAccounts.length ? [] : ["No active bank account rows were available for this company context."])
    ]
  };
}
