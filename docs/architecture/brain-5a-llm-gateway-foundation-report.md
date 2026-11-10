# BRAIN-5A — LLM Gateway Foundation (phase report)

**Date:** 10 Nov 2026 (IST)
**Programme:** BRAIN-5 Governed LLM Gateway (owner's sequence: BRAIN-5A → 5B → 5C → 5D → 5E → 5F → production evaluation; BRAIN-6 only on the owner's go)
**Status:** IMPLEMENTED, NOT WIRED — no IPC channel, no UI, off by default. Runtime behaviour of the ERP is unchanged.

## 1. Governance decision recorded

`docs/architecture/brain-5-llm-gateway-feasibility-study.md` (15 Jul 2026) recommended not implementing an LLM gateway and treated read-only live-record access as prohibited "unless a future governance layer explicitly approves". On 10 Nov 2026 (21:47 IST) the owner approved BRAIN-5 with this boundary:

- ERP retrieves facts → LLM reasons over those facts → ERP validates the answer. The LLM never reads the database itself.
- The gateway lives in the Electron main process only; API keys never enter the renderer or source.
- BRAIN-5 is read-only ("intelligence without authority"). Read functions (5D) are proposed by the model and executed by the ERP through existing RBAC. No write functions.
- Every material LLM event is audited through AG-1 (`audit_log`).
- Provider outage must not affect the ERP.
- BRAIN-6 (controlled actions with human confirmation) is a separate later programme and needs the owner's go.

This supersedes the feasibility study's "do not implement" recommendation for BRAIN-5 only. Its prohibition on action-taking stays in force until BRAIN-6 is approved.

## 2. Dependency assessment

| Dependency | State | Effect |
|---|---|---|
| BRAIN-1/2/3/4, KG-1, RG-1, DG-1, WG-1, KG-4, FF-1, AG-1, KG-5 graphs | ACTIVE (graph-registry v1.3.0) | 5B assembles evidence from them |
| GGR-1 | Owned by the PR #4 thread | No graph registry edits here |
| SEC-1 session-bound authorization | Pending on PR #4 | 5D read functions must run through it |
| BRAIN-3.5 / KG-5 runtime consumption | BLOCKED until stabilization (GGR-1 report) | 5C wiring waits for, or is explicitly approved ahead of, that gate |
| Provider and key storage | Owner decision pending | OpenAI adapter written; offline test provider for everything else |

**Dependencies Satisfied:** Yes for 5A (self-contained, unwired). Partly for 5C/5D (see table).

## 3. What was built (`src/main/services/llm/`)

| File | Purpose | Owner rule |
|---|---|---|
| `llmProvider.js` | Provider-neutral contract (`generateStructuredAnswer`, `healthCheck`) | provider-neutral |
| `openAIProvider.js` | Responses API over built-in `fetch`; `store: false`; strict JSON schema; key only in the `Authorization` header; error bodies not echoed | LLM-010 |
| `offlineTestProvider.js` | Deterministic, no network; used by tests and "no provider" | — |
| `llmPolicyEngine.js` | LLM-001…LLM-012 registry; pre-flight blocks: disabled, no session, write requests (how-to questions allowed), SQL/secret probes, prompt-injection phrases | LLM-001/005/006/012 |
| `llmRedactor.js` | Drops secret/bank/path fields by key word; masks API keys, bearer tokens, JWTs, private keys, Aadhaar/card-like numbers, DB file paths | LLM-011 |
| `llmResponseContract.js` | The ERP answer contract (answer, confidence, evidence, relatedModules, workflowStage, suggestedActions, requiresApproval, insufficientEvidence) | structured output |
| `llmResponseValidator.js` | Rejects invented evidence ids, approvals, write actions, extra fields; no evidence → INSUFFICIENT_EVIDENCE | LLM-003/004/005 |
| `llmPromptContract.js` | Fixed system rules; user text and evidence travel separately as data | LLM-002 |
| `llmSettingsStore.js` | `<runtime>/config/llm.json`; off by default; key encrypted via injected `encryptSecret` (Electron safeStorage); renderer sees `hasApiKey` only; settings changes audited | LLM-010/012 |
| `llmCostTracker.js` | Daily token budget per IST day, persisted | 5F foundation |
| `llmAuditService.js` | `LLM_REQUEST … LLM_ERROR` rows in the hash-chained audit log; question kept as hash + length + 120-char redacted preview | LLM-009 |
| `llmGateway.js` | Orchestrates policy → audit → context → redact → budget → provider (timeout) → validate → audit; never throws; refuses to send if the opening audit row cannot be written; no evidence → no provider call | all |

No npm dependency was added. No database table or migration was added.

## 4. Verification

`npm run test:llm-gateway` — 15/15 pass (no network, no Electron): policy rules registered; disabled by default; write/SQL/secret/injection refusals and how-to allowance; no-evidence short-circuit; redaction on the wire; validator rejections; bad model output replaced; provider failure and audit failure paths; daily budget; encrypted key never returned; OpenAI request shape (`store:false`, strict schema, key only in header); 401 handling; renderer never imports the gateway; no LLM SDK in package.json.

`npm run lint:syntax` covers the new files.

## 5. Next phases

- **5B** context and evidence assembler over the graph registry (load only required graphs, AGENTS.md §25.2) and BRAIN-2 search.
- **5C** one IPC channel (`ask-erp-ai:ask`, session-guarded) and the Ask ERP panel showing the AI answer beside the BRAIN-4 answer, with BRAIN-4 as fallback.
- **5D** read-only ERP functions through SEC-1 and existing RBAC.
- **5E** AG-1 graph registration of the LLM audit actions.
- **5F** model routing tiers and cost governance.
