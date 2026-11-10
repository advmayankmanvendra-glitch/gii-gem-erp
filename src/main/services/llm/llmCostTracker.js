import fs from "node:fs";
import path from "node:path";

// Daily token budget (BRAIN-5F foundation). Usage is kept per IST business day
// in <runtime>/config/llm-usage.json so a restart does not reset the budget.
const USAGE_FILE = "llm-usage.json";

export function istDay(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function createLlmCostTracker({ root, now = () => new Date() }) {
  const file = () => path.join(root, "config", USAGE_FILE);
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(file(), "utf8"));
    } catch {
      return {};
    }
  };

  function today() {
    const day = istDay(now());
    const stored = read();
    return stored.day === day ? stored : { day, inputTokens: 0, outputTokens: 0, requests: 0, byModel: {} };
  }

  function remaining(budget) {
    const usage = today();
    return Math.max(0, budget - usage.inputTokens - usage.outputTokens);
  }

  function record({ model, inputTokens = 0, outputTokens = 0 }) {
    const usage = today();
    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.requests += 1;
    const key = model || "unknown";
    usage.byModel[key] = usage.byModel[key] || { inputTokens: 0, outputTokens: 0, requests: 0 };
    usage.byModel[key].inputTokens += inputTokens;
    usage.byModel[key].outputTokens += outputTokens;
    usage.byModel[key].requests += 1;
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(usage, null, 2));
    return usage;
  }

  return { today, remaining, record };
}
