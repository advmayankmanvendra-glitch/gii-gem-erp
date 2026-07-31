import { useState } from "react";
import { FocusTrap } from "../../../components/FocusTrap.jsx";
import { ModalBackdrop, ModalPanel } from "../../../components/overlays/index.jsx";

function ControlledInputDialog({ title, note, onClose, children }) {
  return (
    <ModalBackdrop className="controlled-input-backdrop" dataEscClose>
      <FocusTrap active onEscape={onClose}>
        <ModalPanel className="confirm-dialog warning" labelledBy="controlled-input-dialog-title">
          <div className="panel-head">
            <div>
              <h2 id="controlled-input-dialog-title">{title}</h2>
              <p>{note}</p>
            </div>
            <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
          </div>
          {children}
        </ModalPanel>
      </FocusTrap>
    </ModalBackdrop>
  );
}

export function FinancialYearInputDialog({ onClose, onSubmit }) {
  const [form, setForm] = useState({ financial_year_name: "", start_date: "", end_date: "" });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ControlledInputDialog title="Create Financial Year" note="Enter the governed period name and exact start and end dates." onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Financial Year Name
          <input
            value={form.financial_year_name}
            onChange={(event) => setForm((current) => ({ ...current, financial_year_name: event.target.value }))}
            placeholder="FY 2027-28"
            required
          />
        </label>
        <label className="field">
          Start Date
          <input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} required />
        </label>
        <label className="field">
          End Date
          <input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} required />
        </label>
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={submitting}>{submitting ? "Creating..." : "Create Financial Year"}</button>
        </div>
      </form>
    </ControlledInputDialog>
  );
}

export function OpeningBalanceInputDialog({ account, financialYear, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(amount);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ControlledInputDialog title="Add Opening Balance" note="Review the account and financial year before entering the opening debit amount." onClose={onClose}>
      <div className="workflow-note">
        <strong>{account?.account_code} - {account?.account_name}</strong>
        <span>{financialYear?.financial_year_name}</span>
        <small>This action requires a separate posting confirmation before any accounting entry is created.</small>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Opening Debit Amount
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={submitting}>{submitting ? "Reviewing..." : "Continue to Confirmation"}</button>
        </div>
      </form>
    </ControlledInputDialog>
  );
}

const BANK_MATCH_MODULE_OPTIONS = [
  ["invoices", "Invoices"],
  ["payments", "Receipts / Payments"],
  ["procurements", "Procurements"],
  ["supplier_payments", "Supplier Payments"],
  ["supply_orders", "Supply Orders"],
  ["vouchers", "Vouchers"]
];

export function BankMatchInputDialog({ entry, onClose, onSubmit }) {
  const [form, setForm] = useState({
    matched_module: entry?.matched_module || "payments",
    matched_record_id: entry?.matched_record_id ? String(entry.matched_record_id) : ""
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ControlledInputDialog title="Manual Bank Match" note="Select the ERP module and enter the exact record ID to link this bank entry." onClose={onClose}>
      <div className="workflow-note">
        <strong>{entry?.transaction_date || "Bank entry"}</strong>
        <span>{entry?.narration || entry?.utr || "No narration recorded"}</span>
        <small>The final match still requires a separate confirmation.</small>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="field">
          Match Module
          <select value={form.matched_module} onChange={(event) => setForm((current) => ({ ...current, matched_module: event.target.value }))} required>
            {BANK_MATCH_MODULE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          Record ID
          <input
            type="number"
            min="1"
            step="1"
            value={form.matched_record_id}
            onChange={(event) => setForm((current) => ({ ...current, matched_record_id: event.target.value }))}
            required
          />
        </label>
        <div className="form-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-btn" disabled={submitting}>{submitting ? "Reviewing..." : "Continue to Confirmation"}</button>
        </div>
      </form>
    </ControlledInputDialog>
  );
}
