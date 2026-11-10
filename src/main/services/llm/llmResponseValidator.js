import { ANSWER_SCHEMA, CONFIDENCE, INSUFFICIENT_EVIDENCE_ANSWER } from "./llmResponseContract.js";

// LLM-003 / LLM-004 / LLM-005: nothing the model returns reaches the user until
// it passes these checks. Evidence ids must be ones the ERP itself supplied;
// a factual answer with no evidence becomes INSUFFICIENT_EVIDENCE; and in
// BRAIN-5 (read-only) the model may not ask for approval or propose writes.

const WRITE_VERBS = /\b(post|create|delete|remove|approve|reject|reverse|cancel|modify|change|update|edit|release|pay|transfer|import|restore|reset|write|insert|book)\b/i;
const MAX_ANSWER_CHARS = 6000;

export function validateAnswer(raw, { allowedEvidenceIds = [], allowedModules = null } = {}) {
  const problems = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, problems: ["Model output is not a JSON object."], answer: insufficient() };
  }
  for (const key of ANSWER_SCHEMA.required) {
    if (!(key in raw)) problems.push(`Missing field: ${key}`);
  }
  const extra = Object.keys(raw).filter((key) => !(key in ANSWER_SCHEMA.properties));
  if (extra.length) problems.push(`Unexpected fields: ${extra.join(", ")}`);
  if (typeof raw.answer !== "string") problems.push("answer must be text.");
  if (!CONFIDENCE.includes(raw.confidence)) problems.push("confidence must be HIGH, MEDIUM or LOW.");
  for (const key of ["evidence", "relatedModules", "suggestedActions"]) {
    if (!Array.isArray(raw[key]) || raw[key].some((item) => typeof item !== "string")) problems.push(`${key} must be a list of text.`);
  }
  if (raw.workflowStage !== null && typeof raw.workflowStage !== "string") problems.push("workflowStage must be text or null.");
  if (typeof raw.requiresApproval !== "boolean") problems.push("requiresApproval must be true or false.");
  if (typeof raw.insufficientEvidence !== "boolean") problems.push("insufficientEvidence must be true or false.");
  if (problems.length) return { ok: false, problems, answer: insufficient() };

  const allowed = new Set(allowedEvidenceIds.map(String));
  const unknownEvidence = raw.evidence.filter((id) => !allowed.has(id));
  if (unknownEvidence.length) problems.push(`Cited evidence the ERP did not supply: ${unknownEvidence.join(", ")}`);
  if (raw.requiresApproval) problems.push("BRAIN-5 is read-only: the model may not request an approval.");
  const writeActions = raw.suggestedActions.filter((action) => WRITE_VERBS.test(action));
  if (writeActions.length) problems.push(`BRAIN-5 is read-only: write actions proposed: ${writeActions.join("; ")}`);
  if (allowedModules) {
    const modules = new Set(allowedModules);
    const unknownModules = raw.relatedModules.filter((name) => !modules.has(name));
    if (unknownModules.length) problems.push(`Unknown modules: ${unknownModules.join(", ")}`);
  }
  if (raw.answer.length > MAX_ANSWER_CHARS) problems.push("answer is too long.");
  if (problems.length) return { ok: false, problems, answer: insufficient() };

  if (raw.insufficientEvidence || (!raw.evidence.length && raw.answer.trim())) {
    return { ok: true, problems: raw.insufficientEvidence ? [] : ["Answer had no evidence; shown as insufficient evidence."], answer: insufficient() };
  }
  if (!raw.answer.trim()) return { ok: true, problems: ["Empty answer."], answer: insufficient() };
  return { ok: true, problems: [], answer: { ...raw, answer: raw.answer.trim() } };
}

export function insufficient() {
  return {
    answer: INSUFFICIENT_EVIDENCE_ANSWER,
    confidence: "LOW",
    evidence: [],
    relatedModules: [],
    workflowStage: null,
    suggestedActions: [],
    requiresApproval: false,
    insufficientEvidence: true
  };
}
