// BRAIN-5 governed LLM gateway (main process only). See
// docs/architecture/brain-5a-llm-gateway-foundation-report.md.
export { createLlmGateway, defaultChooseModel } from "./llmGateway.js";
export { createLlmSettingsStore, LLM_DEFAULTS } from "./llmSettingsStore.js";
export { createLlmCostTracker, istDay } from "./llmCostTracker.js";
export { createLlmAuditService, LLM_AUDIT_ACTIONS } from "./llmAuditService.js";
export { createOpenAIProvider } from "./openAIProvider.js";
export { createOfflineTestProvider } from "./offlineTestProvider.js";
export { LLM_POLICY_RULES, checkRequest } from "./llmPolicyEngine.js";
export { redact } from "./llmRedactor.js";
export { validateAnswer } from "./llmResponseValidator.js";

import { createOpenAIProvider } from "./openAIProvider.js";
import { createOfflineTestProvider } from "./offlineTestProvider.js";

export function providerFromSettings(settings, apiKey) {
  if (settings.provider === "openai") return createOpenAIProvider({ apiKey });
  if (settings.provider === "offline-test") return createOfflineTestProvider();
  return null;
}
