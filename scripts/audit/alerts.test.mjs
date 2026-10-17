// Alerts: digest content, SMTP delivery against a local fake mail server, the
// WhatsApp request shape, and the once-a-day schedule.
// Run from the repo root:  node --test scripts/audit/alerts.test.mjs
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
const m = await load("src/main/database/init.js");
const { sendMail } = await load("src/main/services/alerts/smtpClient.js");
const { sendWhatsApp } = await load("src/main/services/alerts/whatsappClient.js");

const cleanup = [];
afterEach(() => { while (cleanup.length) cleanup.pop()(); });
function fresh() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-alerts-"));
  const db = m.initializeDatabase(root);
  cleanup.push(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { db, root, alerts: m.alertServiceWith({ encryptSecret: (s) => `enc:${s}`, decryptSecret: (s) => s.slice(4) }) };
}

function fakeSmtp() {
  const received = { commands: [], data: "" };
  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") { inData = false; socket.write("250 queued\r\n"); } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line);
        if (/^EHLO/i.test(line)) socket.write("250-fake\r\n250 OK\r\n");
        else if (/^DATA/i.test(line)) { inData = true; socket.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.write("221 bye\r\n"); socket.end(); }
        else socket.write("250 OK\r\n");
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    cleanup.push(() => server.close());
    resolve({ port: server.address().port, received });
  }));
}

test("the digest shows pending dues, overdue invoices, payables, stock value and low stock", () => {
  const { db, alerts } = fresh();
  const digest = alerts.buildDigest(db, 1, { today: "2026-10-17" });
  assert.match(digest.text, /Pending dues: Rs\. /);
  assert.match(digest.text, /Overdue: /);
  assert.match(digest.text, /Stock in hand: /);
  assert.match(digest.text, /Low stock: \d+ item/);
  assert.equal(digest.templateParams.length, 4);
});

test("nothing is sent while no channel is turned on", async () => {
  const { db, root, alerts } = fresh();
  await assert.rejects(() => alerts.deliver(db, root, {}), /No alert channel is turned on/);
});

test("an email alert reaches the mail server with subject and body, and the send is audited", async () => {
  const { db, root, alerts } = fresh();
  const smtp = await fakeSmtp();
  alerts.saveSettings(db, root, { enabled: true, email: { enabled: true, host: "127.0.0.1", port: smtp.port, to: "owner@example.com", from: "erp@example.com" } });
  const result = await alerts.deliver(db, root, { companyId: 1, channels: ["email"], test: true });
  assert.deepEqual(result.results.map((row) => [row.channel, row.ok]), [["email", true]]);
  assert.ok(smtp.received.commands.includes("RCPT TO:<owner@example.com>"));
  assert.match(smtp.received.data, /Subject: \[Test\] /);
  assert.match(smtp.received.data, /Pending dues/);
  const audit = db.prepare("SELECT new_value FROM audit_log WHERE action = 'alert_test_sent' ORDER BY id DESC").get();
  assert.ok(audit, "the send is in the audit log");
});

test("the WhatsApp request uses the approved template and the recipient number", async () => {
  let request;
  const fetchImpl = async (url, options) => { request = { url, body: JSON.parse(options.body), auth: options.headers.Authorization }; return { ok: true, json: async () => ({ messages: [{ id: "wamid.1" }] }) }; };
  const result = await sendWhatsApp({ phoneNumberId: "123", token: "t0k", templateName: "erp_daily_summary" }, { to: "919800000000", text: "x", templateParams: ["Co", "Rs. 1", "Rs. 0", "2"] }, { fetchImpl });
  assert.equal(result.id, "wamid.1");
  assert.match(request.url, /graph\.facebook\.com\/v\d+\.\d+\/123\/messages$/);
  assert.equal(request.auth, "Bearer t0k");
  assert.equal(request.body.template.name, "erp_daily_summary");
  assert.equal(request.body.template.components[0].parameters.length, 4);
});

test("a mail server without encryption is refused before the password is sent", async () => {
  const smtp = await fakeSmtp();
  await assert.rejects(() => sendMail({ host: "127.0.0.1", port: smtp.port, user: "u", password: "p", allowPlainLocal: false }, { to: ["a@b.c"], subject: "s", text: "t" }), /does not offer STARTTLS/);
  assert.ok(!smtp.received.commands.some((line) => /^AUTH/i.test(line)), "no AUTH command was sent");
});

test("the scheduled send runs once a day, at or after the set time", async () => {
  const { db, root, alerts } = fresh();
  const smtp = await fakeSmtp();
  alerts.saveSettings(db, root, { enabled: true, sendTime: "09:00", email: { enabled: true, host: "127.0.0.1", port: smtp.port, to: "owner@example.com" } });
  const early = new Date(2026, 9, 17, 8, 30);
  const later = new Date(2026, 9, 17, 9, 5);
  assert.equal(await alerts.runScheduled(db, root, early), null);
  assert.ok(await alerts.runScheduled(db, root, later));
  assert.equal(await alerts.runScheduled(db, root, new Date(2026, 9, 17, 18, 0)), null, "no second send the same day");
});
