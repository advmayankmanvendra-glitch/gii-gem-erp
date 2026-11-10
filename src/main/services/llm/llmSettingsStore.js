import fs from "node:fs";
import path from "node:path";

// BRAIN-5A settings: <runtime>/config/llm.json. Off by default (LLM-012).
// The API key is stored only through the encrypt/decrypt functions main.js
// supplies (Windows DPAPI via Electron safeStorage), and is never returned to
// the renderer (LLM-010): the screen sees only `hasApiKey`.

const SETTINGS_FILE = "llm.json";
export const LLM_DEFAULTS = Object.freeze({
  enabled: false,
  provider: "",
  models: { low: "", medium: "", high: "" },
  dailyTokenBudget: 200000,
  perRequestMaxOutputTokens: 1200,
  requestTimeoutMs: 30000,
  allowLiveRecords: false
});

const PROVIDERS = new Set(["", "openai", "offline-test"]);

export function createLlmSettingsStore({ root, encryptSecret, decryptSecret, auditLog = null, db = null }) {
  const file = () => path.join(root, "config", SETTINGS_FILE);

  function readStored() {
    try {
      return JSON.parse(fs.readFileSync(file(), "utf8"));
    } catch {
      return {};
    }
  }

  function read() {
    const stored = readStored();
    return { ...LLM_DEFAULTS, ...stored, models: { ...LLM_DEFAULTS.models, ...(stored.models || {}) } };
  }

  function publicSettings() {
    const { apiKeySecret, ...rest } = read();
    return { ...rest, hasApiKey: Boolean(apiKeySecret) };
  }

  function apiKey() {
    const { apiKeySecret } = read();
    if (!apiKeySecret) return "";
    try {
      return decryptSecret(apiKeySecret);
    } catch {
      return "";
    }
  }

  function save(payload = {}) {
    const current = read();
    const provider = String(payload.provider ?? current.provider).trim();
    if (!PROVIDERS.has(provider)) throw new Error(`Unknown AI provider "${provider}".`);
    const positive = (value, fallback, max) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number > 0 ? Math.min(number, max) : fallback;
    };
    const next = {
      ...current,
      enabled: Boolean(payload.enabled ?? current.enabled),
      provider,
      models: {
        low: String(payload.models?.low ?? current.models.low).trim(),
        medium: String(payload.models?.medium ?? current.models.medium).trim(),
        high: String(payload.models?.high ?? current.models.high).trim()
      },
      dailyTokenBudget: positive(payload.dailyTokenBudget, current.dailyTokenBudget, 50_000_000),
      perRequestMaxOutputTokens: positive(payload.perRequestMaxOutputTokens, current.perRequestMaxOutputTokens, 8000),
      requestTimeoutMs: positive(payload.requestTimeoutMs, current.requestTimeoutMs, 120000),
      allowLiveRecords: Boolean(payload.allowLiveRecords ?? current.allowLiveRecords)
    };
    if (payload.clearApiKey) delete next.apiKeySecret;
    if (typeof payload.apiKey === "string" && payload.apiKey.trim()) next.apiKeySecret = encryptSecret(payload.apiKey.trim());
    if (next.enabled && !next.provider) throw new Error("Choose an AI provider before turning Ask ERP AI on.");
    if (next.enabled && next.provider !== "offline-test" && !next.apiKeySecret) throw new Error("Enter the AI provider's API key before turning Ask ERP AI on.");
    if (next.enabled && !next.models.medium) throw new Error("Enter at least the standard (medium) model name before turning Ask ERP AI on.");
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(next, null, 2));
    if (auditLog && db) {
      auditLog(db, {
        action: "LLM_SETTINGS_SAVED",
        module: "ask_erp_ai",
        table_name: "system",
        new_value: JSON.stringify({ enabled: next.enabled, provider: next.provider, models: next.models, dailyTokenBudget: next.dailyTokenBudget, allowLiveRecords: next.allowLiveRecords, apiKeyChanged: Boolean(payload.apiKey) || Boolean(payload.clearApiKey) })
      });
    }
    return publicSettings();
  }

  return { read, publicSettings, apiKey, save };
}
