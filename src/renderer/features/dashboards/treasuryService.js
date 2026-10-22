/** Builds read-only cash and bank visibility from existing accounting rows. */
export function buildTreasuryOverview(counts, accountingData, bankLedgers = []) {
  const cashBankRows = Array.isArray(accountingData?.cashBank) ? accountingData.cashBank : [];
  const bankMasters = Array.isArray(accountingData?.banks)
    ? accountingData.banks
    : (Array.isArray(accountingData?.references?.banks) ? accountingData.references.banks : []);
  const bankRows = Array.isArray(bankLedgers) && bankLedgers.length ? bankLedgers : bankMasters;
  const isCashRow = (row) => String(row.payment_mode || "").trim().toLowerCase() === "cash";
  const balanceForRows = (rows) => rows.reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);

  // Cash is identified by its payment mode, never by a missing bank ID: bank
  // movements can be saved without a bank master. Only bank movements are
  // grouped by bank ID, and those without one stay in an explicit bucket.
  const cashRows = cashBankRows.filter(isCashRow);
  const rowsByBank = new Map();
  cashBankRows.filter((row) => !isCashRow(row)).forEach((row) => {
    const key = Number(row.bank_account_id || 0);
    if (!rowsByBank.has(key)) rowsByBank.set(key, []);
    rowsByBank.get(key).push(row);
  });

  const cashBalance = cashBankRows.length ? balanceForRows(cashRows) : Number(counts?.cashBankBalance || 0);
  // No reconciliation timestamp is available in this data, so the last
  // transaction date is not shown as a reconciliation date.
  const bankAccount = (id, name, bankName, accountNumber, rows) => {
    const bookBalance = balanceForRows(rows);
    return { id, name, bankName, accountNumber, bookBalance, availableBalance: bookBalance, difference: 0, lastReconciled: null };
  };
  const listedIds = new Set();
  const bankAccounts = bankRows.map((bank) => {
    const bankId = Number(bank.id || bank.bank_account_id || 0);
    listedIds.add(bankId);
    return bankAccount(
      bankId,
      bank.bank_account_name || bank.account_name || bank.bank_name || `Bank ${bankId || ""}`.trim(),
      bank.bank_name || "-",
      bank.account_number || "-",
      bankId ? (rowsByBank.get(bankId) || []) : []
    );
  });
  rowsByBank.forEach((rows, bankId) => {
    if (bankId === 0 || listedIds.has(bankId)) return;
    bankAccounts.push(bankAccount(bankId, `Bank ${bankId} (inactive or not in bank master)`, "-", "-", rows));
  });
  if (rowsByBank.has(0)) {
    bankAccounts.push(bankAccount(null, "Unassigned bank (no bank account selected)", "-", "-", rowsByBank.get(0)));
  }
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
