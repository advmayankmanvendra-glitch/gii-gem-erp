import crypto from "node:crypto";
import { redactText } from "./llmRedactor.js";

// LLM-009: every material Ask ERP AI event goes to the hash-chained audit_log
// (AG-1). The question is stored only as a hash, its length and a short
// redacted preview; model output is stored as a hash and the evidence ids.
export const LLM_AUDIT_ACTIONS = Object.freeze([
  "LLM_REQUEST",
  "LLM_RESPONSE",
  "LLM_CONTEXT_RETRIEVAL",
  "LLM_FUNCTION_REQUEST",
  "LLM_FUNCTION_EXECUTION",
  "LLM_ACTION_PROPOSED",
  "LLM_ACTION_APPROVED",
  "LLM_ACTION_REJECTED",
  "LLM_POLICY_BLOCK",
  "LLM_ERROR"
]);

const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value ?? null)).digest("hex");

export function questionFingerprint(question) {
  const text = String(question || "");
  return { questionHash: sha256(text), questionLength: text.length, questionPreview: redactText(text).slice(0, 120) };
}

export function createLlmAuditService({ db, auditLog }) {
  function record(action, { session = null, requestId, companyId = null, details = {} }) {
    if (!LLM_AUDIT_ACTIONS.includes(action)) throw new Error(`Unknown LLM audit action ${action}`);
    if (!auditLog || !db) return null;
    try {
      return auditLog(db, {
        action,
        module: "ask_erp_ai",
        table_name: "llm_interaction",
        record_id: null,
        user_id: session?.user_id || null,
        user_role: session?.role || null,
        company_id: companyId,
        new_value: JSON.stringify({ requestId, ...details })
      });
    } catch {
      // LLM-012: an audit hiccup must not break the ERP. The gateway refuses to
      // answer when the opening LLM_REQUEST row cannot be written (see gateway).
      return null;
    }
  }
  return { record, hash: sha256 };
}
