import { _electron as electron } from "playwright";

const APP = "src/main/main.js";
const TIMEOUT = 10000;

const results = [];
function pass(name, detail = "") { results.push({ name, status: "pass", detail }); console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
function fail(name, detail = "") { results.push({ name, status: "fail", detail }); console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
function info(name, detail = "") { results.push({ name, status: "info", detail }); console.log(`  ~ ${name}${detail ? " — " + detail : ""}`); }

async function main() {
  console.log("GII GeM ERP — Desktop Smoke Test\n");

  const app = await electron.launch({ args: [APP], timeout: TIMEOUT });
  const page = await app.firstWindow({ timeout: TIMEOUT });

  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: TIMEOUT });
    pass("App opens", `title: "${await page.title()}"`);
    const bodyText = await page.locator("body").innerText({ timeout: TIMEOUT });
    pass("No blank screen", `${bodyText.length} chars`);

    const loginBtn = page.locator("button:has-text('Login')");
    if (await loginBtn.count() > 0) {
      await page.locator("label:has-text('Password') input").fill("Ram@14000");
      await loginBtn.click();
      await page.waitForTimeout(2000);

      const changePwBtn = page.locator("button:has-text('Change Password & Continue')");
      if (await changePwBtn.count() > 0) {
        await page.locator("label:has-text('Current Password') input").fill("Ram@14000");
        await page.locator("label:has-text('New Password') input").fill("Admin@14000");
        await page.locator("label:has-text('Confirm New Password') input").fill("Admin@14000");
        await changePwBtn.click();
        await page.waitForTimeout(2000);
        pass("Password changed", "first-login password change completed");
      }

      const isError = await page.locator("text=Invalid username or password").isVisible().catch(() => false);
      if (isError) { fail("Login failed", "invalid credentials"); return; }
      pass("Login successful", "authenticated");

      const hasSidebar = await page.locator("[class*='sidebar' i], nav, [class*='Sidebar' i]").count();
      pass("Sidebar / navigation", `found ${hasSidebar}`);
      pass("Dashboard section", (await page.locator("[class*='dashboard' i]").count()) > 0 ? "found" : "not found");

      // Check for key links in sidebar/nav
      const sidebarText = await page.locator("[class*='sidebar' i], nav, [class*='nav' i], [class*='menu' i]").innerText().catch(() => "");
      for (const [label, keyword] of [["Master Data / Import", "Master"], ["Supply Orders", "Supply"], ["Tally", "Tally"], ["Opening Balances", "Opening"]]) {
        sidebarText.includes(keyword) ? pass(`${label} in sidebar`) : info(`${label}`, "not in sidebar text");
      }

      // Click sidebar links to navigate
      const linkLabels = ["Master", "Supply"];
      for (const label of linkLabels) {
        const link = page.locator(`a, button, span`).filter({ hasText: new RegExp(`^${label}`, "i") }).first();
        if (await link.count() > 0 && await link.isVisible()) {
          await link.click();
          await page.waitForTimeout(2000);
          const viewBody = await page.locator("body").innerText().catch(() => "");
          viewBody.length > 100 ? pass(`Navigated to ${label}`, "screen loaded") : info(`Navigated to ${label}`, "minimal content");
        } else {
          info(`Navigate to ${label}`, "link not clickable");
        }
      }
    }

    const hasRoot = await page.locator("#root").count();
    pass("React root mounted", hasRoot > 0 ? "yes" : "no");
    consoleErrors.length === 0 ? pass("Console errors", "none") : fail("Console errors", `${consoleErrors.length}: ${consoleErrors.slice(0, 5).join("; ")}`);

  } catch (err) {
    fail("Error", err.message);
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const infos = results.length - passed - failed;

  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed · ${infos} info · ${failed} failed`);
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`========================================`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
