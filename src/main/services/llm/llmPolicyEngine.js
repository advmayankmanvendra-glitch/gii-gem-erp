// BRAIN-5 policy rules (owner's list, 10 Nov 2026). The engine is consulted
// before any provider call; a block never reaches the network.
export const LLM_POLICY_RULES = Object.freeze([
  { id: "LLM-001", rule: "The LLM cannot access the database directly." },
  { id: "LLM-002", rule: "The LLM receives source-backed context only." },
  { id: "LLM-003", rule: "Every factual ERP answer must identify its evidence source." },
  { id: "LLM-004", rule: "Missing evidence must produce INSUFFICIENT_EVIDENCE." },
  { id: "LLM-005", rule: "The LLM cannot mutate financial data." },
  { id: "LLM-006", rule: "All function calls pass existing RBAC." },
  { id: "LLM-007", rule: "Financial mutations require human approval." },
  { id: "LLM-008", rule: "LLM actions use existing service functions only." },
  { id: "LLM-009", rule: "All material LLM activity is auditable through AG-1." },
  { id: "LLM-010", rule: "API credentials never enter renderer context." },
  { id: "LLM-011", rule: "Sensitive values are redacted before transmission." },
  { id: "LLM-012", rule: "Provider failure must not affect normal ERP operation." }
]);

const MAX_QUESTION_CHARS = 1000;
// Requests to change books or stock are refused before any model sees them
// (the BRAIN-4 unsafe-action boundary, kept authoritative per the feasibility study §7.4).
const WRITE_REQUEST = /\b(post|create|make|delete|remove|approve|reject|reverse|cancel|modify|change|update|edit|release|pay|transfer|import|restore|reset|book|enter|record|generate)\b[^?]*\b(voucher|invoice|bill|payment|receipt|journal|ledger|stock|entry|entries|order|challan|transaction|account|record|user|password|backup)\b/i;
const PROMPT_ATTACK = /\b(ignore|disregard|forget)\b[^.]{0,40}\b(previous|above|prior|system|instructions?|rules?)\b|\b(system prompt|developer message|jailbreak|act as (an? )?(admin|root|developer))\b/i;
const RAW_ACCESS = /\bselect\s+\*|\bselect\s+\w+(\s*,\s*\w+)+\s+from\b|\bsqlite_master\b|\bpragma\s+\w|\bdrop\s+table\b|\binsert\s+into\b|\bdelete\s+from\s+\w+\s*(;|where\b)|\bupdate\s+\w+\s+set\s+\w+\s*=|\.(db|sqlite3?)\b/i;
const SECRET_PROBE = /\b(show|reveal|tell|give|list|print|what(?:'s| is| are))\b[^?]{0,40}\b(passwords?|api[_ ]?keys?|secrets?|tokens?|recovery (?:code|secret)s?)\b/i;

export function checkRequest({ question, settings, session, providerReady }) {
  const blocks = [];
  if (!settings?.enabled) blocks.push({ rule: "LLM-012", code: "DISABLED", message: "Ask ERP AI is turned off. An admin can turn it on in Settings." });
  if (!providerReady) blocks.push({ rule: "LLM-012", code: "NO_PROVIDER", message: "No AI provider is set up yet." });
  if (!session?.user_id) blocks.push({ rule: "LLM-006", code: "NO_SESSION", message: "Sign in to use Ask ERP." });
  const text = typeof question === "string" ? question.trim() : "";
  if (!text) blocks.push({ rule: "LLM-002", code: "EMPTY", message: "Type a question first." });
  if (text.length > MAX_QUESTION_CHARS) blocks.push({ rule: "LLM-002", code: "TOO_LONG", message: `Questions are limited to ${MAX_QUESTION_CHARS} characters.` });
  if (WRITE_REQUEST.test(text) && !isHowToQuestion(text)) blocks.push({ rule: "LLM-005", code: "WRITE_REQUEST", message: "Ask ERP AI is read-only. It can explain how to do this, but it cannot change vouchers, stock, ledgers or records. Use the ERP screen for that." });
  if (RAW_ACCESS.test(text) || SECRET_PROBE.test(text)) blocks.push({ rule: "LLM-001", code: "RAW_ACCESS", message: "Ask ERP AI cannot run database commands or reveal credentials." });
  if (PROMPT_ATTACK.test(text)) blocks.push({ rule: "LLM-002", code: "PROMPT_INJECTION", message: "That question tries to change the assistant's rules, so it was not sent." });
  return { allowed: blocks.length === 0, blocks, question: text };
}

// A "how do I post a voucher?" question is guidance, not a write request.
export function isHowToQuestion(text) {
  return /^\s*(how|what|where|why|when|which|can i|should i|explain|show me how)\b/i.test(text || "");
}
