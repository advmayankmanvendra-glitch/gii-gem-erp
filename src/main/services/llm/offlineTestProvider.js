import { LlmProviderError } from "./llmProvider.js";

// Deterministic provider for tests and for "no provider chosen yet". It never
// opens a network connection. `respond` lets a test script the model's output,
// including bad output, so the validator and policy paths can be proven.
export function createOfflineTestProvider({ respond, fail = null } = {}) {
  const calls = [];
  return {
    id: "offline-test",
    calls,
    async generateStructuredAnswer(request) {
      calls.push(request);
      if (fail) throw new LlmProviderError(fail.message || "offline provider failure", fail);
      const output = respond ? await respond(request) : defaultAnswer(request);
      return { output, usage: { inputTokens: approxTokens(request.input), outputTokens: approxTokens(output) }, model: request.model || "offline-test" };
    },
    async healthCheck() {
      return fail ? { ok: false, detail: fail.message } : { ok: true };
    }
  };
}

function defaultAnswer(request) {
  const evidence = Array.isArray(request?.input?.evidence) ? request.input.evidence : [];
  if (!evidence.length) {
    return { answer: "", confidence: "LOW", evidence: [], relatedModules: [], workflowStage: null, suggestedActions: [], requiresApproval: false, insufficientEvidence: true };
  }
  return {
    answer: `Based on ${evidence[0].title || evidence[0].id}: ${evidence[0].summary || ""}`.trim(),
    confidence: "MEDIUM",
    evidence: [evidence[0].id],
    relatedModules: evidence[0].module ? [evidence[0].module] : [],
    workflowStage: null,
    suggestedActions: [],
    requiresApproval: false,
    insufficientEvidence: false
  };
}

export function approxTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / 4);
}
