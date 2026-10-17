import React, { useEffect, useState } from "react";

const EMPTY = {
  enabled: false, sendTime: "09:00", overdueDays: 0,
  email: { enabled: false, host: "", port: 587, secure: false, user: "", from: "", to: [], password: "" },
  whatsapp: { enabled: false, phoneNumberId: "", recipients: [], templateName: "", templateLanguage: "en", token: "" }
};
const CHECK_ROW = { display: "flex", alignItems: "center", gap: 8 };
const CHECK_BOX = { width: "auto", margin: 0 };
const joinList = (value) => (Array.isArray(value) ? value.join(", ") : value || "");

// Settings > Alerts: daily pending-dues and stock summary by email and/or WhatsApp.
// Nothing is sent until an admin turns a channel on and saves.
export function AlertsSection({ apiClient, notify, confirmAction, isAdmin, companyContext }) {
  const [form, setForm] = useState(EMPTY);
  const [stored, setStored] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const available = typeof apiClient?.getAlertSettings === "function";

  async function load() {
    if (!isAdmin || !available) return;
    try {
      const settings = await apiClient.getAlertSettings();
      setStored(settings);
      setForm({ ...EMPTY, ...settings, email: { ...EMPTY.email, ...settings.email, password: "" }, whatsapp: { ...EMPTY.whatsapp, ...settings.whatsapp, token: "" } });
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => { load(); }, [isAdmin]);

  if (!isAdmin) return null;
  if (!available) {
    return (
      <section className="panel settings-panel">
        <div className="panel-head"><div><h2>Alerts</h2><p>Email and WhatsApp alerts are available in the Windows desktop app.</p></div></div>
      </section>
    );
  }

  const setEmail = (patch) => setForm({ ...form, email: { ...form.email, ...patch } });
  const setWhatsApp = (patch) => setForm({ ...form, whatsapp: { ...form.whatsapp, ...patch } });

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await apiClient.saveAlertSettings(form);
      setStored(saved);
      setForm({ ...form, email: { ...form.email, password: "" }, whatsapp: { ...form.whatsapp, token: "" } });
      notify(saved.enabled ? `Alerts saved. The summary goes out daily at ${saved.sendTime}.` : "Alert settings saved. Daily sending is off.");
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function showPreview() {
    if (!companyContext?.company_id) {
      notify("Select one company in the top bar to preview its alert summary.", "error");
      return;
    }
    try {
      setPreview(await apiClient.previewAlert({ company_id: companyContext.company_id }));
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function send(test) {
    const confirmed = await confirmAction({
      mode: "warning",
      title: test ? "Send Test Alert" : "Send Alert Now",
      message: `This sends the dues and stock summary${companyContext?.company_id ? ` for ${companyContext.company_name}` : " for the alert companies"} to the saved email and WhatsApp recipients. Do you want to send it?`,
      confirmLabel: "Yes, Send",
      cancelLabel: "No, Cancel",
      moduleName: "settings"
    });
    if (!confirmed.confirmed) return;
    setBusy(true);
    try {
      const result = await apiClient.sendAlertNow({ company_id: companyContext?.company_id || null, test });
      const failed = result.results.filter((row) => !row.ok);
      if (failed.length) notify(`Sent ${result.results.length - failed.length} of ${result.results.length}. ${failed[0].channel} to ${failed[0].to}: ${failed[0].error}`, "error");
      else notify(`Alert sent to ${result.results.length} recipient group(s). The send is in the audit log.`);
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel">
      <div className="panel-head">
        <div>
          <h2>Alerts</h2>
          <p>A daily summary of pending dues, overdue invoices, supplier payables, stock in hand and low stock, sent by email and/or WhatsApp. Every send is recorded in the audit log.</p>
        </div>
      </div>
      <form className="security-form" onSubmit={save}>
        <label style={CHECK_ROW}><input type="checkbox" style={CHECK_BOX} checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> Send the summary every day</label>
        <label>Send at (24-hour time)<input type="time" value={form.sendTime} onChange={(event) => setForm({ ...form, sendTime: event.target.value })} /></label>
        <label>Count an invoice as overdue after (days past due)<input type="number" min="0" value={form.overdueDays} onChange={(event) => setForm({ ...form, overdueDays: event.target.value })} /></label>

        <div className="section-title">Email</div>
        <label style={CHECK_ROW}><input type="checkbox" style={CHECK_BOX} checked={form.email.enabled} onChange={(event) => setEmail({ enabled: event.target.checked })} /> Send by email</label>
        <label>Mail server (SMTP host)<input value={form.email.host} placeholder="smtp.gmail.com" onChange={(event) => setEmail({ host: event.target.value })} /></label>
        <label>Port<input type="number" value={form.email.port} onChange={(event) => setEmail({ port: event.target.value, secure: Number(event.target.value) === 465 })} /></label>
        <label>Sign-in user<input value={form.email.user} onChange={(event) => setEmail({ user: event.target.value })} /></label>
        <label>Password or app password{stored?.email?.hasPassword ? " (saved; leave blank to keep)" : ""}<input type="password" value={form.email.password} onChange={(event) => setEmail({ password: event.target.value })} /></label>
        <label>From address<input value={form.email.from} onChange={(event) => setEmail({ from: event.target.value })} /></label>
        <label>Send to (comma separated)<input value={joinList(form.email.to)} onChange={(event) => setEmail({ to: event.target.value })} /></label>

        <div className="section-title">WhatsApp (Meta WhatsApp Business Cloud API)</div>
        <label style={CHECK_ROW}><input type="checkbox" style={CHECK_BOX} checked={form.whatsapp.enabled} onChange={(event) => setWhatsApp({ enabled: event.target.checked })} /> Send by WhatsApp</label>
        <label>Phone Number ID<input value={form.whatsapp.phoneNumberId} onChange={(event) => setWhatsApp({ phoneNumberId: event.target.value })} /></label>
        <label>Access token{stored?.whatsapp?.hasToken ? " (saved; leave blank to keep)" : ""}<input type="password" value={form.whatsapp.token} onChange={(event) => setWhatsApp({ token: event.target.value })} /></label>
        <label>Recipient numbers with country code (comma separated)<input value={joinList(form.whatsapp.recipients)} placeholder="919800000000" onChange={(event) => setWhatsApp({ recipients: event.target.value })} /></label>
        <label>Approved template name<input value={form.whatsapp.templateName} placeholder="erp_daily_summary" onChange={(event) => setWhatsApp({ templateName: event.target.value })} /></label>
        <small>WhatsApp only delivers business-started messages through a template Meta has approved. Create one with four body variables: company, pending dues, overdue amount, low-stock count. Without a template, messages reach only people who wrote to the business number in the last 24 hours.</small>

        <div className="backup-row">
          <button type="submit" className="primary-btn" disabled={busy}>Save Alerts</button>
          <button type="button" className="secondary-btn" onClick={showPreview} disabled={busy}>Preview Summary</button>
          <button type="button" className="secondary-btn" onClick={() => send(true)} disabled={busy}>Send Test</button>
          <button type="button" className="ghost-btn" onClick={() => send(false)} disabled={busy}>Send Now</button>
        </div>
      </form>
      {preview ? <pre className="alerts-preview" style={{ whiteSpace: "pre-wrap" }}>{preview.text}</pre> : null}
      {stored?.lastSent?.scheduled ? <small>Last scheduled send: {stored.lastSent.scheduled}</small> : null}
    </section>
  );
}
