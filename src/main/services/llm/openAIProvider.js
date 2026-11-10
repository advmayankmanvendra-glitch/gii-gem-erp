import { LlmProviderError } from "./llmProvider.js";

// OpenAI adapter over the Responses API, using Electron/Node's built-in fetch
// (no SDK dependency). Runs only in the main process (LLM-010). Every request
// sets store:false so OpenAI does not keep application state for it.
const BASE_URL = "https://api.openai.com/v1";

export function createOpenAIProvider({ apiKey, fetchImpl = globalThis.fetch, baseUrl = BASE_URL }) {
  if (!apiKey) throw new LlmProviderError("OpenAI API key is not set.", { code: "NO_KEY" });
  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

  async function call(path, init) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new LlmProviderError("Could not reach OpenAI. Check the internet connection.", { code: "NETWORK", retryable: true });
    }
    if (!response.ok) {
      // The body may echo request details; keep only OpenAI's error type/code.
      let code = `HTTP_${response.status}`;
      try {
        const body = await response.json();
        code = body?.error?.code || body?.error?.type || code;
      } catch {
        // ignore
      }
      const message = response.status === 401 ? "OpenAI rejected the API key." : response.status === 429 ? "OpenAI rate limit or quota reached." : `OpenAI returned an error (${response.status}).`;
      throw new LlmProviderError(message, { code, status: response.status, retryable: response.status === 429 || response.status >= 500 });
    }
    return response.json();
  }

  return {
    id: "openai",
    async generateStructuredAnswer({ model, system, input, schema, schemaName, maxOutputTokens, signal }) {
      const body = await call("/responses", {
        method: "POST",
        signal,
        body: JSON.stringify({
          model,
          instructions: system,
          input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }],
          text: { format: { type: "json_schema", name: schemaName, schema, strict: true } },
          max_output_tokens: maxOutputTokens,
          store: false
        })
      });
      if (body?.status && body.status !== "completed") {
        throw new LlmProviderError(`OpenAI response was ${body.status}.`, { code: body.incomplete_details?.reason || body.status });
      }
      const parts = (body?.output || []).filter((item) => item?.type === "message").flatMap((item) => item.content || []);
      const refusal = parts.find((part) => part?.type === "refusal");
      if (refusal) throw new LlmProviderError("The model refused to answer.", { code: "REFUSAL" });
      const text = parts.filter((part) => part?.type === "output_text").map((part) => part.text).join("");
      let output;
      try {
        output = JSON.parse(text);
      } catch {
        throw new LlmProviderError("The model did not return valid JSON.", { code: "BAD_JSON" });
      }
      return { output, usage: { inputTokens: body?.usage?.input_tokens || 0, outputTokens: body?.usage?.output_tokens || 0 }, model: body?.model || model };
    },
    async healthCheck({ signal } = {}) {
      await call("/models?limit=1", { method: "GET", signal });
      return { ok: true };
    }
  };
}
