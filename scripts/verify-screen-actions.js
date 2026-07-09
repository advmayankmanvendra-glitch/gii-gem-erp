import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCREEN_ACTION_REGISTRY } from "../src/renderer/config/screenActionRegistry.js";

const projectRoot = process.cwd();
const appSource = readFileSync(join(projectRoot, "src", "renderer", "App.jsx"), "utf8");
let passed = 0;
let failed = 0;

function pass(message) {
  passed += 1;
  console.log(`PASS: ${message}`);
}

function fail(message) {
  failed += 1;
  console.log(`FAIL: ${message}`);
}

for (const action of SCREEN_ACTION_REGISTRY) {
  if (appSource.includes(action.actionKey)) pass(`${action.actionKey} render marker found`);
  else fail(`${action.actionKey} render marker missing`);

  if (appSource.includes(action.handlerName)) pass(`${action.actionKey} handler ${action.handlerName} found`);
  else fail(`${action.actionKey} handler ${action.handlerName} missing`);

  if (appSource.includes(`data-action-key="${action.actionKey}"`)) pass(`${action.actionKey} data-action-key is wired`);
  else fail(`${action.actionKey} data-action-key is not wired`);
}

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
