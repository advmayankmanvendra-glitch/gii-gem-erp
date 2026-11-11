import fs from "node:fs";
import path from "node:path";
import { _electron as electron, chromium } from "playwright";

const executablePath = process.env.ERP_PACKAGED_EXE;
const userDataDir = process.env.ERP_SMOKE_USER_DATA_DIR;
const username = process.env.ERP_SMOKE_USERNAME || "admin";
const password = process.env.ERP_SMOKE_PASSWORD;
const remoteDebuggingUrl = process.env.ERP_REMOTE_DEBUGGING_URL;
const timeout = 20000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error("Set ERP_PACKAGED_EXE to the packaged GII GeM ERP executable before running this smoke test");
}
if (!userDataDir || !path.isAbsolute(userDataDir)) {
  throw new Error("Set ERP_SMOKE_USER_DATA_DIR to an absolute isolated profile folder");
}
if (!password) {
  throw new Error("Set ERP_SMOKE_PASSWORD for the isolated packaged-runtime login");
}

const consoleErrors = [];
const results = [];
let app;
let browser;

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`PASS: ${name}${detail ? ` - ${detail}` : ""}`);
}

try {
  let page;
  if (remoteDebuggingUrl) {
    browser = await chromium.connectOverCDP(remoteDebuggingUrl, { timeout });
    const context = browser.contexts()[0];
    page = context?.pages()[0];
    assert(page, "Packaged Electron remote-debugging page was not available");
  } else {
    app = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${userDataDir}`],
      timeout
    });
    page = await app.firstWindow({ timeout });
  }
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.waitForLoadState("domcontentloaded", { timeout });
  assert((await page.locator("body").innerText()).trim().length > 100, "Packaged renderer opened blank");
  pass("Packaged renderer opens", await page.title());

  const apiWiring = await page.evaluate(async () => {
    const api = window.giiGemErp;
    const counts = await api.getDashboardCounts({ date_from: "1900-01-01", date_to: "2999-12-31" });
    return {
      dashboardMethod: typeof api.getDashboardCounts,
      accountingMethod: typeof api.getAccountingData,
      keyCount: Object.keys(counts || {}).length,
      hasPendingBilling: Object.hasOwn(counts || {}, "pendingBilling"),
      hasTrialBalanceStatus: Object.hasOwn(counts || {}, "trialBalanceStatus")
    };
  });
  assert(apiWiring.dashboardMethod === "function" && apiWiring.accountingMethod === "function", "Packaged preload is missing Dashboard read APIs");
  assert(apiWiring.hasPendingBilling && apiWiring.hasTrialBalanceStatus, "Packaged Dashboard payload is incomplete");
  pass("Packaged preload and IPC wiring", `${apiWiring.keyCount} Dashboard fields`);

  if (await page.getByLabel("Username").isVisible().catch(() => false)) {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.waitForTimeout(1500);
    if (await page.getByRole("button", { name: "Change Password & Continue", exact: true }).count()) {
      throw new Error("Packaged smoke account requires a password change; complete that controlled action separately before certification");
    }
    assert(!(await page.getByText("Invalid username or password", { exact: false }).isVisible().catch(() => false)), "Packaged login failed");
  }
  await page.locator(".dashboard-page").waitFor({ state: "visible", timeout });
  pass("Packaged login and Dashboard load");

  const firstRunTour = page.locator(".modal-backdrop").filter({ hasText: "Welcome to GII GeM ERP" });
  if (await firstRunTour.isVisible().catch(() => false)) {
    await firstRunTour.getByRole("button", { name: "Start Working", exact: true }).click();
    await firstRunTour.waitFor({ state: "hidden", timeout });
    pass("Packaged first-run tour dismissal");
  }

  const modes = ["Executive", "Operations", "Accounts", "Business Development", "Inventory & Procurement", "Management Intelligence"];
  for (const mode of modes) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.waitForTimeout(300);
    assert(await page.locator(".widget-card").count() > 0, `${mode} Dashboard has no widgets`);
    assert(!(await page.locator(".error-state").isVisible().catch(() => false)), `${mode} Dashboard shows an error state`);
    pass(`${mode} Dashboard mode`, `${await page.locator(".widget-card").count()} visible widget(s)`);
  }

  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  const balanceSheetRow = page.locator(".dashboard-customizer-row").filter({ hasText: "Balance Sheet" });
  const balanceSheetToggle = balanceSheetRow.locator('input[type="checkbox"]');
  if (!(await balanceSheetToggle.isChecked())) await balanceSheetToggle.click();
  assert(await balanceSheetToggle.isChecked(), "Fresh-profile Balance Sheet widget could not be enabled");
  await page.getByRole("button", { name: "Close Customize", exact: true }).click();
  const balanceSheetCard = page.locator(".widget-card").filter({ hasText: "Balance Sheet" });
  await balanceSheetCard.waitFor({ state: "visible", timeout });
  const balanceSheetValue = await balanceSheetCard.locator(".widget-value").innerText();
  assert(["Balanced", "Mismatch"].includes(balanceSheetValue), `Balance Sheet card has an ungoverned status: ${balanceSheetValue}`);
  await balanceSheetCard.locator(".widget-body").click();
  await page.getByText("Balance Sheet", { exact: true }).first().waitFor({ state: "visible", timeout });
  pass("Fresh-profile accounting widget and drill-down", balanceSheetValue);
  await page.getByRole("button", { name: /Back/ }).first().click();
  await page.locator(".dashboard-page").waitFor({ state: "visible", timeout });

  await page.locator(".context-bar-period-buttons").getByRole("button", { name: "Last Month", exact: true }).click();
  await page.waitForTimeout(500);
  assert((await page.locator(".widget-meta").filter({ hasText: "Period:" }).first().innerText()).includes("Last Month"), "Period selection did not reach widget metadata");
  pass("Dashboard period control");

  const comparisonSelect = page.locator(".context-bar-select").last();
  await comparisonSelect.selectOption("previous_period");
  await page.waitForTimeout(500);
  assert(await page.locator(".widget-comparison").count() > 0, "Comparison selection did not render comparison values");
  pass("Dashboard comparison control");

  const autoRefresh = page.getByRole("button", { name: /Auto:/ }).first();
  await autoRefresh.click();
  assert((await autoRefresh.innerText()).includes("On"), "Auto Refresh did not switch on");
  await autoRefresh.click();
  pass("Dashboard Auto Refresh control");

  assert(consoleErrors.length === 0, `Packaged runtime logged ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join("; ")}`);
  pass("Packaged console/runtime errors", "none");
} finally {
  if (app) await app.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
}

console.log(`\nPackaged Dashboard smoke test: ${results.length} passed, 0 failed`);
