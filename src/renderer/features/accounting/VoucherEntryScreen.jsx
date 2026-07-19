import { useEffect, useState } from "react";
import { formatCurrency } from "../../utils/formatters.js";
import { sortRecordsBy } from "../../utils/optionSorting.js";

export function VoucherEntryScreen({ notify, companyContext, api }) {
  const today = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(null);
  const [form, setForm] = useState({
    company_id: "",
    voucher_date: today,
    voucher_type: "Journal",
    voucher_number: "",
    reference_number: "",
    bank_account_id: "",
    narration: "",
    lines: [
      { account_id: "", debit: "", credit: "", narration: "" },
      { account_id: "", debit: "", credit: "", narration: "" }
    ]
  });

  async function load(companyId = companyContext?.company_id || form.company_id) {
    try {
      const result = await api.getAccountingData(companyId ? { company_id: companyId } : {});
      setData(result);
      if (companyId && String(form.company_id || "") !== String(companyId)) setForm((current) => ({ ...current, company_id: companyId }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    load(companyContext?.company_id);
  }, [companyContext?.company_id, companyContext?.company_scope]);

  useEffect(() => {
    if (companyContext?.company_id && String(form.company_id || "") !== String(companyContext.company_id)) {
      setForm((current) => ({ ...current, company_id: companyContext.company_id }));
    }
  }, [companyContext?.company_id, form.company_id]);

  const accounts = data?.accounts || [];
  const banks = data?.banks || [];
  const totalDebit = form.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = form.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const difference = totalDebit - totalCredit;

  function updateLine(index, key, value) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line)
    }));
  }

  function addLine() {
    setForm((current) => ({ ...current, lines: [...current.lines, { account_id: "", debit: "", credit: "", narration: "" }] }));
  }

  function removeLine(index) {
    setForm((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }));
  }

  async function submit(event) {
    event.preventDefault();
    try {
      if (!companyContext?.company_id) throw new Error("Select Current Company before posting a voucher.");
      if (form.company_id && String(form.company_id) !== String(companyContext.company_id)) throw new Error("Selected company and voucher company do not match.");
      if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) throw new Error("Voucher debit and credit totals must match");
      const voucher = await api.createVoucher({
        ...form,
        company_id: Number(companyContext.company_id),
        bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
        lines: form.lines.map((line) => ({
          ...line,
          account_id: Number(line.account_id),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0)
        }))
      });
      notify(`Voucher posted: ${voucher.voucher_number}`);
      setForm((current) => ({
        ...current,
        voucher_number: "",
        reference_number: "",
        narration: "",
        lines: [
          { account_id: "", debit: "", credit: "", narration: "" },
          { account_id: "", debit: "", credit: "", narration: "" }
        ]
      }));
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="voucher-layout">
      <form className="panel entry-form voucher-form" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Advanced Journal Entry</h2>
            <p>Use for accountant-controlled adjustments, opening entries, year-end corrections and GST corrections.</p>
          </div>
        </div>
        <div className="voucher-meta">
          <label className="field">Company
            <select value={form.company_id} onChange={(event) => setForm({
              ...form,
              company_id: event.target.value,
              bank_account_id: "",
              lines: [
                { account_id: "", debit: "", credit: "", narration: "" },
                { account_id: "", debit: "", credit: "", narration: "" }
              ]
            })} required>
              {sortRecordsBy(data?.companies || [], (company) => company.company_name).map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            </select>
          </label>
          <label className="field">Date
            <input type="date" value={form.voucher_date} onChange={(event) => setForm({ ...form, voucher_date: event.target.value })} required />
          </label>
          <label className="field">Voucher Type
            <select value={form.voucher_type} onChange={(event) => setForm({ ...form, voucher_type: event.target.value })}>
              {["Receipt", "Payment", "Purchase", "Sales", "Journal", "Contra", "Debit Note", "Credit Note"].map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">Voucher Number
            <input placeholder="Auto if blank" value={form.voucher_number} onChange={(event) => setForm({ ...form, voucher_number: event.target.value })} />
          </label>
          <label className="field">Cash/Bank Account
            <select value={form.bank_account_id} onChange={(event) => setForm({ ...form, bank_account_id: event.target.value })}>
              <option value="">Not linked</option>
              {sortRecordsBy(banks, (bank) => bank.bank_account_name).map((bank) => <option key={bank.id} value={bank.id}>{bank.bank_account_name}</option>)}
            </select>
          </label>
          <label className="field">Reference / UTR
            <input value={form.reference_number} onChange={(event) => setForm({ ...form, reference_number: event.target.value })} />
          </label>
        </div>
        <label className="field">Narration
          <textarea value={form.narration} onChange={(event) => setForm({ ...form, narration: event.target.value })} />
        </label>

        <div className="voucher-lines">
          <div className="voucher-line voucher-line-head">
            <span>Account</span>
            <span>Debit</span>
            <span>Credit</span>
            <span>Narration</span>
            <span></span>
          </div>
          {form.lines.map((line, index) => (
            <div className="voucher-line" key={index}>
              <select value={line.account_id} onChange={(event) => updateLine(index, "account_id", event.target.value)} required>
                <option value="">Select account</option>
                {sortRecordsBy(accounts, (account) => `${account.account_code} ${account.account_name}`).map((account) => <option key={account.id} value={account.id}>{account.account_code} - {account.account_name}</option>)}
              </select>
              <input type="number" value={line.debit} onChange={(event) => updateLine(index, "debit", event.target.value)} min="0" step="0.01" />
              <input type="number" value={line.credit} onChange={(event) => updateLine(index, "credit", event.target.value)} min="0" step="0.01" />
              <input value={line.narration} onChange={(event) => updateLine(index, "narration", event.target.value)} />
              <button type="button" className="ghost-btn" onClick={() => removeLine(index)} disabled={form.lines.length <= 2}>Remove</button>
            </div>
          ))}
        </div>
        <div className="voucher-totals">
          <button type="button" className="ghost-btn" onClick={addLine}>Add Line</button>
          <span>Debit: <strong>{formatCurrency(totalDebit)}</strong></span>
          <span>Credit: <strong>{formatCurrency(totalCredit)}</strong></span>
          <span className={difference ? "loss" : "profit"}>Difference: <strong>{formatCurrency(difference)}</strong></span>
        </div>
        <button className="primary-btn">Post Voucher</button>
      </form>
    </section>
  );
}
