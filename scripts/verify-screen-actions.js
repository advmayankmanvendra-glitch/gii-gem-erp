import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SCREEN_ACTION_REGISTRY } from "../src/renderer/config/screenActionRegistry.js";

const projectRoot = process.cwd();
const rendererRoot = join(projectRoot, "src", "renderer");
let passed = 0;
let failed = 0;

function rendererSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const location = join(directory, entry.name);
    if (entry.isDirectory()) return rendererSources(location);
    if (!/\.(?:js|jsx)$/.test(entry.name)) return [];
    return [{ location, source: readFileSync(location, "utf8") }];
  });
}

const sources = rendererSources(rendererRoot);
const appSource = sources.find(({ location }) => location.endsWith(join("renderer", "App.jsx")))?.source || "";
const accountingSources = sources.filter(({ location }) => location.includes(join("features", "accounting")));
const accountingSource = accountingSources.map(({ source }) => source).join("\n");
const accountingDialogSource = accountingSources.find(({ location }) => location.endsWith(join("components", "AccountingInputDialogs.jsx")))?.source || "";

function pass(message) {
  passed += 1;
  console.log(`PASS: ${message}`);
}

function fail(message) {
  failed += 1;
  console.log(`FAIL: ${message}`);
}

for (const action of SCREEN_ACTION_REGISTRY) {
  const owners = sources.filter(({ source }) => source.includes(`data-action-key="${action.actionKey}"`));
  const implementation = owners.find(({ source }) => source.includes(action.handlerName));

  if (owners.length > 0) pass(`${action.actionKey} render marker found`);
  else fail(`${action.actionKey} render marker missing`);

  if (implementation) pass(`${action.actionKey} handler ${action.handlerName} found in its renderer owner`);
  else fail(`${action.actionKey} handler ${action.handlerName} missing`);

  if (owners.length === 1) pass(`${action.actionKey} data-action-key is wired exactly once`);
  else if (owners.length > 1) fail(`${action.actionKey} data-action-key is wired ${owners.length} times`);
  else fail(`${action.actionKey} data-action-key is not wired`);
}

const exitNavigationChecks = [
  ["application exit requests are guarded against duplicate close events", "const exitRequestPendingRef = useRef(false);"],
  ["window close requests use the governed application exit flow", "api.onConfirmClose(requestApplicationExit)"],
  ["Dashboard Escape requests application exit", "void requestApplicationExit();"],
  ["login renders the application exit confirmation", "confirmDialog && <ConfirmDialog dialog={confirmDialog} onResolve={resolveConfirmation} />"]
];

for (const [message, sourceMarker] of exitNavigationChecks) {
  if (appSource.includes(sourceMarker)) pass(message);
  else fail(message);
}

if (!/\bwindow\.prompt\s*\(/.test(accountingSource)) pass("accounting actions do not use uncontrolled browser prompts");
else fail("accounting actions do not use uncontrolled browser prompts");

const accountingDialogChecks = [
  ["financial year entry uses a controlled dialog", "export function FinancialYearInputDialog"],
  ["opening balance entry uses a controlled dialog", "export function OpeningBalanceInputDialog"],
  ["manual bank matching uses a controlled dialog", "export function BankMatchInputDialog"],
  ["controlled accounting dialogs support Escape close", "dataEscClose"],
  ["opening balance dialog preserves separate confirmation guidance", "requires a separate posting confirmation"],
  ["manual bank match dialog preserves separate confirmation guidance", "final match still requires a separate confirmation"]
];

for (const [message, sourceMarker] of accountingDialogChecks) {
  if (accountingDialogSource.includes(sourceMarker)) pass(message);
  else fail(message);
}

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
