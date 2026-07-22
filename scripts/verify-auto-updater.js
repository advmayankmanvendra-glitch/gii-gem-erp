import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const packageJson = JSON.parse(read("package.json"));
const main = read("src/main/main.js");
const service = read("src/main/services/updateService.js");
const preload = read("src/preload/preload.cjs");
const client = read("src/renderer/api/client.js");
const settings = read("src/renderer/screens/SettingsScreen.jsx");
const component = read("src/renderer/components/settings/index.jsx");

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
}

const publishUrl = String(packageJson.build?.publish?.url || "");
check("electron-updater dependency is installed", Boolean(packageJson.dependencies?.["electron-updater"]));
check("update feed uses HTTPS", publishUrl.startsWith("https://"), publishUrl);
check("release packaging requires code signing", packageJson.build?.forceCodeSigning === true);
check("Windows update signature verification is enabled", packageJson.build?.win?.verifyUpdateCodeSignature === true);
check("updater is enabled only for installed packaged runtime", main.includes("enabled: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR"));
check("all updater IPC handlers are registered", ["update:check", "update:download", "update:install", "update:status"].every((channel) => main.includes(channel)));
check("preload exposes updater contract", ["checkForUpdates", "downloadUpdate", "quitAndInstall", "getAutoUpdateStatus", "onUpdateDownloadProgress"].every((name) => preload.includes(name)));
check("progress listener provides cleanup", preload.includes('removeListener("update:download-progress"'));
check("browser preview uses a no-op desktop subscription", client.includes('"onUpdateDownloadProgress"') && client.includes("previewDesktopSubscriptions"));
check("browser preview does not subscribe to desktop IPC", settings.includes('if (!isDesktopRuntime || typeof apiClient.onUpdateDownloadProgress !== "function")'));
check("update check returns a public status DTO", service.includes("return getUpdaterStatus();") && !service.includes("return autoUpdater.checkForUpdates();"));
check("download requires a discovered update", service.includes("Check for updates before starting a download."));
check("install requires a completed download", service.includes('updaterState.status !== "downloaded"'));
check("update feed is restricted to the trusted host", service.includes('TRUSTED_UPDATE_HOST = "releases.gestureindia.com"'));
check("update log path follows the runtime data root", service.includes("function updateLogPath()") && !service.includes("const UPDATE_LOG_PATH"));
check("UI hides Download until it is allowed", component.includes("autoUpdateStatus?.canDownload"));
check("UI hides Install until the update is downloaded", component.includes("autoUpdateStatus?.canInstall"));
check("internal updater library name is not user-facing", !component.includes("electron-updater"));

checks.forEach((item) => {
  console.log(`${item.passed ? "PASS" : "FAIL"}: ${item.name}${item.detail ? ` - ${item.detail}` : ""}`);
});

const failed = checks.filter((item) => !item.passed);
console.log(`\nAuto-updater contract: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
