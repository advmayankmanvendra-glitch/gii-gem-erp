// The ERP answer contract (owner's spec, 10 Nov 2026). The model must return
// exactly this shape; the ERP validates it before anything is shown.
export const CONFIDENCE = ["HIGH", "MEDIUM", "LOW"];

export const ANSWER_SCHEMA_NAME = "erp_answer";

export const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "confidence", "evidence", "relatedModules", "workflowStage", "suggestedActions", "requiresApproval", "insufficientEvidence"],
  properties: {
    answer: { type: "string" },
    confidence: { type: "string", enum: CONFIDENCE },
    evidence: { type: "array", items: { type: "string" } },
    relatedModules: { type: "array", items: { type: "string" } },
    workflowStage: { type: ["string", "null"] },
    suggestedActions: { type: "array", items: { type: "string" } },
    requiresApproval: { type: "boolean" },
    insufficientEvidence: { type: "boolean" }
  }
};

export const INSUFFICIENT_EVIDENCE_ANSWER = "I don't have enough evidence in the ERP's knowledge and records to answer this reliably.";
