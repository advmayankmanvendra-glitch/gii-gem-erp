import fs from "node:fs";
import path from "node:path";
import { sendMail } from "./smtpClient.js";
import { sendWhatsApp } from "./whatsappClient.js";
import { localBusinessDate } from "../../domain/businessDate.js";

// Pending-dues and stock alerts by email and/or WhatsApp. Off until an admin turns
// it on; every send (scheduled, manual or test) is written to the audit log.
// Settings live in <runtime>/config/alerts.json; passwords and tokens are stored
// only through the encrypt/decrypt functions main.js supplies (OS secure storage).

const SETTINGS_FILE = "alerts.json";
const DEFAULTS = {
  enabled: false,
  sendTime: "09:00",
  companyIds: [],
  overdueDays: 0,
  email: { enabled: false, host: "", port: 587, secure: false, user: "", from: "", to: [] },
  whatsapp: { enabled: false, phoneNumberId: "", recipients: [], templateName: "", templateLanguage: "en" },
  lastSent: {}
};

const formatInr = (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const list = (value) => (Array.isArray(value) ? value : String(value || "").split(/[,;\s]+/)).map((item) => String(item).trim()).filter(Boolean);

export function createAlertService(deps) {
  const { auditLog, inventoryStockSummary, inventoryLowStockReport, supplierPayableReport, encryptSecret, decryptSecret } = deps;

  function settingsPath(root) {
    return path.join(root, "config", SETTINGS_FILE);
  }

  function readStored(root) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath(root), "utf8"));
    } catch {
      return {};
    }
  }

  function readSettings(root) {
    const stored = readStored(root);
    return {
      ...DEFAULTS,
      ...stored,
      email: { ...DEFAULTS.email, ...(stored.email || {}) },
      whatsapp: { ...DEFAULTS.whatsapp, ...(stored.whatsapp || {}) },
      lastSent: stored.lastSent || {}
    };
  }

  // What the settings screen sees: never the secrets themselves.
  function publicSettings(root) {
    const settings = readSettings(root);
    const { passwordSecret, ...email } = settings.email;
    const { tokenSecret, ...whatsapp } = settings.whatsapp;
    return { ...settings, email: { ...email, hasPassword: Boolean(passwordSecret) }, whatsapp: { ...whatsapp, hasToken: Boolean(tokenSecret) } };
  }

  function saveSettings(db, root, payload = {}) {
    const current = readSettings(root);
    const next = {
      ...current,
      enabled: Boolean(payload.enabled),
      sendTime: /^\d{2}:\d{2}$/.test(payload.sendTime || "") ? payload.sendTime : current.sendTime,
      companyIds: list(payload.companyIds ?? current.companyIds).map(Number).filter(Boolean),
      overdueDays: Math.max(0, Number(payload.overdueDays ?? current.overdueDays) || 0),
      email: {
        ...current.email,
        enabled: Boolean(payload.email?.enabled),
        host: String(payload.email?.host ?? current.email.host).trim(),
        port: Number(payload.email?.port || current.email.port || 587),
        secure: Boolean(payload.email?.secure),
        user: String(payload.email?.user ?? current.email.user).trim(),
        from: String(payload.email?.from ?? current.email.from).trim(),
        to: list(payload.email?.to ?? current.email.to)
      },
      whatsapp: {
        ...current.whatsapp,
        enabled: Boolean(payload.whatsapp?.enabled),
        phoneNumberId: String(payload.whatsapp?.phoneNumberId ?? current.whatsapp.phoneNumberId).trim(),
        recipients: list(payload.whatsapp?.recipients ?? current.whatsapp.recipients).map((item) => item.replace(/[^\d]/g, "")).filter(Boolean),
        templateName: String(payload.whatsapp?.templateName ?? current.whatsapp.templateName).trim(),
        templateLanguage: String(payload.whatsapp?.templateLanguage ?? current.whatsapp.templateLanguage ?? "en").trim() || "en"
      }
    };
    if (payload.email?.password) next.email.passwordSecret = encryptSecret(payload.email.password);
    if (payload.whatsapp?.token) next.whatsapp.tokenSecret = encryptSecret(payload.whatsapp.token);
    if (next.email.enabled && (!next.email.host || !next.email.to.length)) {
      throw new Error("Email alerts need the mail server (SMTP host) and at least one recipient address. Fill both in Settings > Alerts > Email, then save.");
    }
    if (next.whatsapp.enabled && (!next.whatsapp.phoneNumberId || !next.whatsapp.recipients.length || !next.whatsapp.tokenSecret)) {
      throw new Error("WhatsApp alerts need the Phone Number ID, an access token and at least one recipient number. Fill them in Settings > Alerts > WhatsApp, then save.");
    }
    fs.mkdirSync(path.dirname(settingsPath(root)), { recursive: true });
    fs.writeFileSync(settingsPath(root), JSON.stringify(next, null, 2));
    auditLog(db, { action: "alert_settings_saved", table_name: "system", new_value: JSON.stringify({ enabled: next.enabled, sendTime: next.sendTime, email: next.email.enabled, whatsapp: next.whatsapp.enabled, emailRecipients: next.email.to.length, whatsappRecipients: next.whatsapp.recipients.length }) });
    return publicSettings(root);
  }

  // The summary a business owner wants each morning, for one company.
  function buildDigest(db, companyId, { overdueDays = 0, today = localBusinessDate() } = {}) {
    const company = db.prepare("SELECT id, company_name FROM companies WHERE id = ?").get(companyId);
    if (!company) throw new Error(`Company ${companyId} was not found. Pick a company in Settings > Alerts.`);
    const dues = db.prepare(`
      SELECT r.invoice_number, r.invoice_date, r.due_date, r.balance_outstanding, COALESCE(gd.department_name, 'Department') party,
        CAST(julianday(?) - julianday(COALESCE(r.due_date, r.invoice_date)) AS INTEGER) overdue_days
      FROM receivables r LEFT JOIN government_departments gd ON gd.id = r.department_id
      WHERE r.company_id = ? AND COALESCE(r.is_deleted, 0) = 0 AND ABS(r.balance_outstanding) > 0.009 AND r.status != 'Reversed'
      ORDER BY overdue_days DESC
    `).all(today, companyId);
    // Credit notes are negative lines; they reduce the total but are never "overdue".
    const overdue = dues.filter((row) => row.balance_outstanding > 0 && row.overdue_days > overdueDays);
    const payables = (supplierPayableReport(db, companyId) || []).filter((row) => Number(row.balance_due || 0) > 0.009);
    const stock = inventoryStockSummary(db, companyId) || [];
    const stockValue = stock.reduce((sum, row) => sum + Number(row.stock_value || 0), 0);
    const low = (inventoryLowStockReport(db, companyId) || []).filter((row) => Number(row.reorder_level || 0) > 0);
    const totals = {
      receivable: dues.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0),
      overdue: overdue.reduce((sum, row) => sum + Number(row.balance_outstanding || 0), 0),
      payable: payables.reduce((sum, row) => sum + Number(row.balance_due || 0), 0),
      stockValue,
      lowStockItems: low.length
    };
    const lines = [
      `${company.company_name}: ERP summary for ${today}`,
      "",
      `Pending dues: ${formatInr(totals.receivable)} on ${dues.filter((row) => row.balance_outstanding > 0).length} invoice(s)`,
      `Overdue: ${formatInr(totals.overdue)} on ${overdue.length} invoice(s)`,
      ...overdue.slice(0, 5).map((row) => `  ${row.invoice_number} ${row.party}: ${formatInr(row.balance_outstanding)}, ${row.overdue_days} day(s) overdue`),
      `Payable to suppliers: ${formatInr(totals.payable)} on ${payables.length} bill(s)`,
      `Stock in hand: ${formatInr(totals.stockValue)} across ${stock.filter((row) => Number(row.closing_quantity || 0) > 0).length} item/warehouse line(s)`,
      `Low stock: ${low.length} item(s) at or below reorder level`,
      ...low.slice(0, 5).map((row) => `  ${row.item_name || `Item ${row.item_id}`}: ${Number(row.closing_quantity || 0)} left (reorder at ${Number(row.reorder_level || 0)})`),
      "",
      "Sent by GII GeM ERP. Figures are from posted records at the time of sending."
    ];
    return {
      company,
      totals,
      overdue: overdue.slice(0, 20),
      lowStock: low.slice(0, 20).map((row) => ({ item_name: row.item_name, closing_quantity: row.closing_quantity, reorder_level: row.reorder_level })),
      subject: `${company.company_name}: dues ${formatInr(totals.receivable)}, overdue ${formatInr(totals.overdue)}, low stock ${low.length}`,
      text: lines.join("\n"),
      // For an approved WhatsApp template with four body variables.
      templateParams: [company.company_name, formatInr(totals.receivable), formatInr(totals.overdue), String(low.length)]
    };
  }

  function companiesFor(db, settings, companyId) {
    if (companyId) return [Number(companyId)];
    if (settings.companyIds?.length) return settings.companyIds;
    return db.prepare("SELECT id FROM companies WHERE COALESCE(status, 'active') = 'active' ORDER BY id").all().map((row) => row.id);
  }

  async function deliver(db, root, { companyId = null, channels = ["email", "whatsapp"], reason = "manual", test = false, userId = null } = {}) {
    const settings = readSettings(root);
    const results = [];
    for (const id of companiesFor(db, settings, companyId)) {
      const digest = buildDigest(db, id, { overdueDays: settings.overdueDays });
      const subject = test ? `[Test] ${digest.subject}` : digest.subject;
      if (channels.includes("email") && settings.email.enabled) {
        try {
          await sendMail({ ...settings.email, password: settings.email.passwordSecret ? decryptSecret(settings.email.passwordSecret) : "" }, { to: settings.email.to, subject, text: digest.text });
          results.push({ company_id: id, channel: "email", to: settings.email.to, ok: true });
        } catch (error) {
          results.push({ company_id: id, channel: "email", to: settings.email.to, ok: false, error: error.message });
        }
      }
      if (channels.includes("whatsapp") && settings.whatsapp.enabled) {
        const token = settings.whatsapp.tokenSecret ? decryptSecret(settings.whatsapp.tokenSecret) : "";
        for (const to of settings.whatsapp.recipients) {
          try {
            await sendWhatsApp({ ...settings.whatsapp, token }, { to, text: `${test ? "[Test] " : ""}${digest.text}`, templateParams: digest.templateParams });
            results.push({ company_id: id, channel: "whatsapp", to, ok: true });
          } catch (error) {
            results.push({ company_id: id, channel: "whatsapp", to, ok: false, error: error.message });
          }
        }
      }
      auditLog(db, { company_id: id, user_id: userId, action: test ? "alert_test_sent" : "alert_sent", table_name: "system", new_value: JSON.stringify({ reason, totals: digest.totals, results: results.filter((row) => row.company_id === id).map(({ channel, to, ok, error }) => ({ channel, to, ok, error })) }) });
    }
    if (!results.length) {
      throw new Error("No alert channel is turned on. Enable Email or WhatsApp in Settings > Alerts and save before sending.");
    }
    return { sentAt: new Date().toISOString(), results };
  }

  // Called by a timer in main.js. Sends once per day, at or after the set time.
  async function runScheduled(db, root, now = new Date()) {
    const settings = readSettings(root);
    if (!settings.enabled || (!settings.email.enabled && !settings.whatsapp.enabled)) return null;
    const day = localBusinessDate(now);
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (hhmm < settings.sendTime || settings.lastSent?.scheduled === day) return null;
    // Mark the day first, so a crash mid-send never causes a second batch.
    fs.mkdirSync(path.dirname(settingsPath(root)), { recursive: true });
    fs.writeFileSync(settingsPath(root), JSON.stringify({ ...readStored(root), lastSent: { ...settings.lastSent, scheduled: day } }, null, 2));
    return deliver(db, root, { reason: "scheduled" });
  }

  return { publicSettings, saveSettings, buildDigest, deliver, runScheduled };
}
