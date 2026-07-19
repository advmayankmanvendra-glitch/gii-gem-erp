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

console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed > 0 ? 1 : 0);
