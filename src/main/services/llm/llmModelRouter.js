// BRAIN-5F: pick the cheapest model tier that fits the question, instead of
// one expensive model everywhere (owner's routing policy, 10 Nov 2026).
//   low    simple navigation / screen help / glossary
//   medium manuals, workflow, reports, inventory, troubleshooting
//   high   accounting and GST reasoning, or a cross-module question
// A tier with no model configured falls back to medium.
const LOW = new Set(["screen_help", "navigation", "glossary"]);
const HIGH = new Set(["voucher_accounting", "gst_tax"]);

export function chooseTier({ question = "", context = {} } = {}) {
  const intent = context.intent || "general";
  const sources = new Set((context.evidence || []).map((item) => item.source).filter(Boolean));
  if (HIGH.has(intent)) return "high";
  if (sources.size >= 4 || question.length > 300) return "high";
  if (LOW.has(intent) && sources.size <= 2) return "low";
  return "medium";
}

export function chooseModel(settings, request) {
  const tier = chooseTier(request);
  const model = settings.models?.[tier] || settings.models?.medium || "";
  return { tier: settings.models?.[tier] ? tier : "medium", model };
}
