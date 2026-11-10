// BRAIN-5A provider contract. Every LLM vendor sits behind this shape so Ask ERP
// never depends on one company's API (owner's architecture, 10 Nov 2026).
//
// A provider is a plain object:
//   id                       short stable name, e.g. "openai", "offline-test"
//   generateStructuredAnswer({ model, system, input, schema, schemaName, maxOutputTokens, signal })
//                            -> { output: object, usage: { inputTokens, outputTokens }, model }
//   healthCheck({ signal })  -> { ok: boolean, detail?: string }
//
// Providers never see the database, the session, or the API key store. The
// gateway hands them only the redacted, minimum-necessary request.

export const PROVIDER_METHODS = ["generateStructuredAnswer", "healthCheck"];

export function assertProvider(provider) {
  if (!provider || typeof provider !== "object") throw new Error("LLM provider is missing.");
  if (typeof provider.id !== "string" || !provider.id) throw new Error("LLM provider has no id.");
  for (const method of PROVIDER_METHODS) {
    if (typeof provider[method] !== "function") throw new Error(`LLM provider "${provider.id}" does not implement ${method}().`);
  }
  return provider;
}

export class LlmProviderError extends Error {
  constructor(message, { code = "PROVIDER_ERROR", status = null, retryable = false } = {}) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}
