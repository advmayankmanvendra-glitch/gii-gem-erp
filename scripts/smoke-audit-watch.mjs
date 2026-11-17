// Audit Watch desktop smoke test: opens the built app in Electron on a fresh data
// folder, signs in, opens Audit Watch, runs the checks and saves screenshots at a
// desktop and a phone-sized window.
//
// Needs: `npm run build`, the Electron build of better-sqlite3, and a display
// (on Linux: xvfb-run node scripts/smoke-audit-watch.mjs <screenshot folder>).

import { _electron as electron } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "audit-watch-smoke");
fs.mkdirSync(OUT, { recursive: true });
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gii-audit-watch-smoke-"));
const results = [];
const pass = (name, detail = "") => { results.push({ name, ok: true, detail }); console.log(`  PASS ${name}${detail ? ` — ${detail}` : ""}`); };
const fail = (name, detail = "") => { results.push({ name, ok: false, detail }); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); };

const app = await electron.launch({ args: ["--no-sandbox", "src/main/main.js"], env: { ...process.env, GII_GEM_ERP_DATA_ROOT: dataRoot }, timeout: 30000 });
const page = await app.firstWindow({ timeout: 30000 });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

async function size(width, height) {
  await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(320, 480); win.setSize(w, h); }, [width, height]);
  await page.waitForTimeout(600);
}

try {
  await page.waitForLoadState("domcontentloaded");
  await page.locator("label:has-text('Password') input").fill("admin123");
  await page.locator("button:has-text('Login')").click();
  await page.waitForTimeout(1500);
  if (await page.locator("button:has-text('Change Password & Continue')").count()) {
    await page.getByRole("textbox", { name: "Current Password", exact: true }).fill("admin123");
    await page.getByRole("textbox", { name: "New Password", exact: true }).fill("Admin@14000x");
    await page.getByRole("textbox", { name: "Confirm New Password", exact: true }).fill("Admin@14000x");
    await page.locator("button:has-text('Change Password & Continue')").click();
    await page.waitForTimeout(1500);
  }
  pass("Signed in");

  await size(1440, 900);
  const welcome = page.locator("button:has-text('Start Working')");
  if (await welcome.count()) await welcome.click();
  await page.locator("aside >> text=Reports").first().click();
  await page.waitForTimeout(400);
  await page.locator("aside >> text=Internal Audit").first().click();
  await page.waitForTimeout(400);
  await page.locator("aside >> text=Audit Watch").first().click();
  await page.locator(".audit-watch-intro").waitFor({ timeout: 10000 });
  pass("Audit Watch opens from the Reports menu");

  await page.locator("input[type=date]").first().fill("2025-04-01");
  await page.locator("button:has-text('Run checks')").click();
  await page.locator(".audit-watch-summary").waitFor({ timeout: 20000 });
  const cards = await page.locator(".audit-watch-card").count();
  cards === 5 ? pass("Summary shows all five areas for an admin", `${cards} cards`) : fail("Summary areas", `${cards} cards`);
  const couldNotRun = await page.locator(".audit-watch-check.status-error").count();
  couldNotRun === 0 ? pass("Every check ran") : fail("Checks that could not run", String(couldNotRun));
  const withFindings = page.locator(".audit-watch-check.status-findings");
  (await withFindings.count()) > 0 ? pass("Seed data shows findings", `${await withFindings.count()} checks`) : fail("No findings on seed data");
  // The run went to a worker thread, so the window stayed responsive while it ran.
  const engine = await page.evaluate(async () => {
    const select = document.querySelector("select");
    const report = await window.giiGemErp.runAuditWatch({ company_id: 1, from: "2025-04-01" });
    return { engine: report.engine, today: report.today, select: Boolean(select) };
  });
  engine.engine === "worker" ? pass("Checks ran in a worker thread", `as of ${engine.today}`) : fail("Checks did not run in a worker thread", JSON.stringify(engine));
  await withFindings.first().locator(".audit-watch-check-head").click();
  await page.locator(".audit-watch-detail button:has-text('Show rows')").first().click();
  await page.locator(".audit-watch-evidence").first().waitFor({ timeout: 5000 });
  pass("A finding opens its supporting rows");
  await page.screenshot({ path: path.join(OUT, "audit-watch-desktop.png"), fullPage: true });

  await size(390, 844);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // Nothing inside Audit Watch may stick out past the window's right edge or its own box.
  const panelOverflow = await page.evaluate(() => {
    const panel = document.querySelector(".audit-watch");
    if (!panel) return -1;
    const limit = Math.min(window.innerWidth, panel.getBoundingClientRect().right);
    const wide = [...panel.querySelectorAll("p, label, button, input, select, .audit-watch-card")]
      .filter((el) => !el.closest(".table-wrap"))
      .map((el) => el.getBoundingClientRect().right - limit);
    return Math.max(0, Math.round(Math.max(...wide, panel.scrollWidth - panel.clientWidth)));
  });
  panelOverflow <= 1 ? pass("No sideways scroll inside Audit Watch at phone width", `panel overflow ${panelOverflow}px, page ${overflow}px`) : fail("Sideways scroll at phone width", `${panelOverflow}px`);
  await page.screenshot({ path: path.join(OUT, "audit-watch-phone.png"), fullPage: true });

  const relevant = errors.filter((text) => !/DevTools|Autofill|favicon/i.test(text));
  relevant.length ? fail("Console errors", relevant.slice(0, 5).join(" | ")) : pass("No console errors");
} catch (error) {
  fail("Smoke run", error.message);
  await page.screenshot({ path: path.join(OUT, "audit-watch-failure.png"), fullPage: true }).catch(() => {});
} finally {
  // Electron can hang on close under a virtual display; give it five seconds, then stop it.
  await Promise.race([app.close().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 5000))]);
  try { app.process()?.kill("SIGKILL"); } catch { /* already gone */ }
  fs.rmSync(dataRoot, { recursive: true, force: true });
}

fs.writeFileSync(path.join(OUT, "audit-watch-smoke.json"), JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
const failed = results.filter((row) => !row.ok).length;
console.log(`\nAudit Watch smoke: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
