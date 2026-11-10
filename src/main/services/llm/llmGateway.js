import crypto from "node:crypto";
import { assertProvider } from "./llmProvider.js";
import { checkRequest } from "./llmPolicyEngine.js";
import { redact } from "./llmRedactor.js";
import { validateAnswer, insufficient } from "./llmResponseValidator.js";
import { ANSWER_SCHEMA, ANSWER_SCHEMA_NAME } from "./llmResponseContract.js";
import { SYSTEM_PROMPT } from "./llmPromptContract.js";
import { questionFingerprint } from "./llmAuditService.js";
import { approxTokens } from "./offlineTestProvider.js";

// BRAIN-5 gateway: ERP retrieves facts -> LLM reasons over them -> ERP validates.
// It never throws into the ERP (LLM-012): every failure becomes a status the
// Ask ERP panel can show, and the rest of the ERP is unaffected.
//
// deps:
//   settingsStore    { read(), apiKey() }
//   createProvider   (settings, apiKey) -> provider | null
//   assembleContext  async ({ question, session, companyId, screen }) -> { intent, evidence: [{ id, title, summary, source, module }] }
//   chooseModel      (settings, { question, context }) -> { tier, model }
//   costTracker      { remaining(budget), record({ model, inputTokens, outputTokens }) }
//   audit            { record(action, {...}) -> row | null }

const MAX_EVIDENCE_ITEMS = 20;

export function defaultChooseModel(settings) {
  return { tier: "medium", model: settings.models?.medium || "" };
}

export function createLlmGateway(deps) {
  const { settingsStore, createProvider, assembleContext, chooseModel = defaultChooseModel, costTracker, audit, newId = () => crypto.randomUUID() } = deps;

  async function ask({ question, session, companyId = null, screen = null } = {}) {
    const requestId = newId();
    const settings = settingsStore.read();
    let provider = null;
    try {
      provider = settings.enabled ? createProvider(settings, settingsStore.apiKey()) : null;
      if (provider) assertProvider(provider);
    } catch {
      provider = null;
    }

    const policy = checkRequest({ question, settings, session, providerReady: Boolean(provider) });
    if (!policy.allowed) {
      audit.record("LLM_POLICY_BLOCK", { session, requestId, companyId, details: { ...questionFingerprint(question), blocks: policy.blocks.map(({ rule, code }) => ({ rule, code })) } });
      return { status: "blocked", requestId, blocks: policy.blocks };
    }

    const opened = audit.record("LLM_REQUEST", { session, requestId, companyId, details: { ...questionFingerprint(policy.question), screen, provider: provider.id } });
    if (deps.requireAudit !== false && !opened) {
      return { status: "unavailable", requestId, message: "Ask ERP AI could not write its audit record, so the question was not sent." };
    }

    try {
      const context = (await assembleContext({ question: policy.question, session, companyId, screen })) || {};
      const evidence = (Array.isArray(context.evidence) ? context.evidence : []).filter((item) => item && item.id).slice(0, MAX_EVIDENCE_ITEMS);
      audit.record("LLM_CONTEXT_RETRIEVAL", { session, requestId, companyId, details: { intent: context.intent || null, sources: evidence.map((item) => ({ id: item.id, source: item.source || null })) } });

      // No-source-no-answer: without ERP evidence the model is not called at all.
      if (!evidence.length) {
        audit.record("LLM_RESPONSE", { session, requestId, companyId, details: { insufficientEvidence: true, providerCalled: false } });
        return { status: "answered", requestId, answer: insufficient(), sources: [], model: null };
      }

      const redacted = redact({ question: policy.question, role: session.role || null, screen, evidence });
      const { tier, model } = chooseModel(settings, { question: policy.question, context });
      if (!model) throw Object.assign(new Error("No model is configured for this kind of question."), { code: "NO_MODEL" });
      const estimate = approxTokens(SYSTEM_PROMPT) + approxTokens(redacted.value) + settings.perRequestMaxOutputTokens;
      if (costTracker.remaining(settings.dailyTokenBudget) < estimate) {
        audit.record("LLM_POLICY_BLOCK", { session, requestId, companyId, details: { blocks: [{ rule: "BRAIN-5F", code: "DAILY_BUDGET" }] } });
        return { status: "blocked", requestId, blocks: [{ rule: "BRAIN-5F", code: "DAILY_BUDGET", message: "Today's Ask ERP AI budget is used up. It resets at midnight IST, or an admin can raise it in Settings." }] };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.requestTimeoutMs);
      let result;
      try {
        result = await provider.generateStructuredAnswer({
          model,
          system: SYSTEM_PROMPT,
          input: redacted.value,
          schema: ANSWER_SCHEMA,
          schemaName: ANSWER_SCHEMA_NAME,
          maxOutputTokens: settings.perRequestMaxOutputTokens,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timer);
      }
      const usage = result?.usage || {};
      costTracker.record({ model: result?.model || model, inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0 });

      const checked = validateAnswer(result?.output, { allowedEvidenceIds: evidence.map((item) => String(item.id)) });
      const cited = new Set(checked.answer.evidence);
      audit.record("LLM_RESPONSE", {
        session,
        requestId,
        companyId,
        details: {
          provider: provider.id,
          model: result?.model || model,
          tier,
          inputTokens: usage.inputTokens || 0,
          outputTokens: usage.outputTokens || 0,
          redactions: redacted.stats,
          valid: checked.ok,
          problems: checked.problems,
          evidence: checked.answer.evidence,
          insufficientEvidence: checked.answer.insufficientEvidence,
          outputHash: crypto.createHash("sha256").update(JSON.stringify(result?.output ?? null)).digest("hex")
        }
      });
      return {
        status: "answered",
        requestId,
        answer: checked.answer,
        sources: evidence.filter((item) => cited.has(String(item.id))).map(({ id, title, source, module }) => ({ id, title: title || id, source: source || null, module: module || null })),
        model: result?.model || model,
        validationProblems: checked.ok ? [] : checked.problems
      };
    } catch (error) {
      const timedOut = error?.name === "AbortError";
      audit.record("LLM_ERROR", { session, requestId, companyId, details: { code: timedOut ? "TIMEOUT" : error?.code || "ERROR", status: error?.status || null, message: String(error?.message || error).slice(0, 300) } });
      return {
        status: "unavailable",
        requestId,
        message: timedOut ? "The AI provider took too long to answer. The ERP's own Ask ERP answer is still available below." : "The AI provider could not answer right now. The ERP's own Ask ERP answer is still available below."
      };
    }
  }

  async function health() {
    const settings = settingsStore.read();
    if (!settings.enabled) return { ok: false, detail: "disabled" };
    try {
      const provider = createProvider(settings, settingsStore.apiKey());
      if (!provider) return { ok: false, detail: "no provider" };
      return await assertProvider(provider).healthCheck({});
    } catch (error) {
      return { ok: false, detail: String(error?.message || error).slice(0, 200) };
    }
  }

  return { ask, health };
}
