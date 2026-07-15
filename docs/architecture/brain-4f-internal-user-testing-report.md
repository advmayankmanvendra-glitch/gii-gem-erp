# BRAIN-4F Internal User Testing Report — Read-Only ERP Assistant

**Date:** 2026-07-15
**Phase:** BRAIN-4F
**Program:** BRAIN (Enterprise Intelligence Layer)

## Feature Classification

- **Primary Category:** Intelligence
- **Secondary Categories:** AI Guidance, Architecture
- **Rationale:** End-to-end behavioral validation of the Read-Only ERP Assistant query resolution pipeline.

## Dependency Assessment

- Knowledge graphs (WG-1, DG-1, VG-1, AG-1, KG-1, RG-1) and their schema contracts
- `queryClassifier.js` (BRAIN-4B), `answerContractBuilder.js` / `safetyEnforcer.js` (BRAIN-4C), UI components (BRAIN-4D)
- `contextualBrainHelp.js`, `helpAssistantUtils.js`, `sourceBackedSearchService.js`, `sourceBackedAnswerBuilder.js`

**Dependencies Satisfied:** Yes

## Test Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 74 |
| **Passed** | 74 |
| **Failed** | 0 |
| **Test Categories** | 17 (workflow, database/table, voucher/accounting, screen/help, report, GST/tax, manual/training, troubleshooting, known gap, unsafe action, safety boundary, response contract, role presentation, screen context, edge cases, read-only guarantee, boundary precision) |

## Test Results by Category

### 1. Workflow (WF-1 through WF-3) — 4/4 PASS
- Queries about workflow stages resolve with `workflow-sensitive` safety boundary and source references.
- "Where is Work Order in the workflow?" → boundary=`workflow-sensitive`, confidence=`high`, sourceReferences present.
- "What happens after CRAC?" and follow-up queries return guidance answers.

### 2. Database/Table (DB-1, DB-2) — 3/3 PASS
- Table queries return `database-sensitive` safety boundary and `relatedTables` array.
- "Which table supports billing?" → boundary=`database-sensitive`, relatedTables present.

### 3. Voucher/Accounting (VA-1, VA-2) — 3/3 PASS
- Accounting queries return `accounting-sensitive` safety boundary and `relatedVoucherTypes` array.
- "Which voucher is created by a receipt?" → boundary=`accounting-sensitive`.

### 4. Screen/Help (SH-1, SH-2) — 3/3 PASS
- Screen location queries with screen context return rich guidance answers.
- "Where is Bill History?" with context `supply_orders` → finds relevant screen match.
- Low-confidence queries still produce valid response contract with safety boundary.

### 5. Report (RP-1) — 1/1 PASS
- Report dependency queries return `relatedReports` array.
- "Which reports depend on ledger_entries?" → relatedReports present.

### 6. GST/Tax (GT-1) — 2/2 PASS
- Tax queries return `gst-sensitive` safety boundary and `prohibitedActions`.
- "How is GST calculated on a sales invoice?" → boundary=`gst-sensitive`.

### 7. Manual/Training (MT-1) — 1/1 PASS
- How-to queries return guidance answers.
- "How do I complete month-end closing?" → answer present.

### 8. Troubleshooting (TS-1) — 1/1 PASS
- Error queries return `needsReview` flag.
- "Why is my voucher not posting?" → needsReview present.

### 9. Known Gap (KG-1) — 1/1 PASS
- Known-gap queries return `knownGaps` array.
- "What are the known gaps in billing?" → knownGaps present.

### 10. Unsafe Action (UA) — 21/21 PASS
**Critical behavioral test.** All 7 unsafe queries are correctly refused:
- "post this voucher" → refusal + prohibitedActions
- "reverse this voucher" → refusal + prohibitedActions
- "approve this record" → refusal + prohibitedActions
- "delete this record" → refusal + prohibitedActions
- "restore this record" → refusal + prohibitedActions
- "import this file" → refusal + prohibitedActions
- "run command" → refusal + prohibitedActions

Each query produces:
- `safetyBoundary = "action-refused"`
- `prohibitedActions = [post,reverse,approve,delete,restore,import,export,run command]`
- `answer` containing "cannot" (explicit read-only refusal)

**Key fix applied during testing:** `hasUnsafeActionKeywords` upgraded from substring matching to word-level matching to catch queries with intervening words (e.g., "post this voucher" now correctly matches keyword "post voucher").

### 11. Safety Boundary (SB-1, SB-2) — 2/2 PASS
- Accounting queries override default boundary: `accounting-sensitive`.
- Inventory queries return correct boundary: `inventory-sensitive`.

### 12. Response Contract (RC) — 15/15 PASS
All 15 required response contract fields present in every response:
`query`, `answer`, `confidence`, `needsReview`, `sourceReferences`, `relatedWorkflowStages`, `relatedScreens`, `relatedTables`, `relatedVoucherTypes`, `relatedReports`, `safetyBoundary`, `knownGaps`, `suggestedNextHelpTopic`, `prohibitedActions`, `rolePresentation`.

### 13. Role Presentation (RP-1 through RP-4) — 4/4 PASS
- `admin` → `depth: "diagnostic"` (full technical detail)
- `operator` → `depth: "basic"` (minimal guidance)
- `readonly` → `depth: "basic"` (minimal guidance)
- `accountant` → `depth: "detailed"` (accounting depth)

### 14. Screen Context (SC-1 through SC-4) — 4/4 PASS
- `sales_invoices` → resolves to "Billing / GST Invoice" screen with accounting impact.
- `supply_orders` → resolves to WORK_ORDER stage with workflow info.
- `sales_invoices` assistant context includes `["accounting-sensitive","gst-sensitive"]` boundaries.

### 15. Edge Cases (EC-1 through EC-5) — 5/5 PASS
- Empty string → null answer, needsReview=true
- Whitespace-only → null answer, needsReview=true
- null → null answer

### 16. Read-Only Guarantee (RO-1, RO-2) — 2/2 PASS
- Unsafe action refusal answer explicitly contains "cannot"/"not"/"only".
- No unsafe action leaks through as a regular query.

### 17. Boundary Precision (BP-1, BP-2) — 2/2 PASS
- Workflow queries populate `relatedWorkflowStages`.
- Accounting-impact queries return correct `safetyBoundary`.

## Production Readiness Assessment

| Gate | Status |
|------|--------|
| Internal user testing completed | ✅ |
| Representative query categories covered (12/12) | ✅ |
| Unsafe action detection test (7 cases) | ✅ |
| Safety boundary behavioral tests | ✅ |
| Role presentation tests | ✅ |
| Screen context integration tests | ✅ |
| Edge case coverage (5 cases) | ✅ |
| Response contract structure verified | ✅ |
| Backward compatibility (BRAIN-2: 51, BRAIN-3: 23, audit) | ✅ |
| Read-only guarantee verified | ✅ |

**Production Readiness Classification:** Internal Testing

**Production Readiness Gate Result:** PASS

## Known Limitations

1. **BRAIN-2 Graph Coverage Gaps:** Some queries (e.g., "How do I open purchase bills?") return null answer because the underlying knowledge graphs lack entries for that specific screen navigation. The response contract is still valid (safety boundary, sources, etc.) but the answer field is null.
2. **No Live Data Access:** The assistant correctly refuses to show actual record data (pending bills, balances, customer lists). Users must navigate to the relevant screen.
3. **Cross-Company Limitation:** The assistant does not have access to per-company context — navigation guidance is company-agnostic.

## Safe to Lock

| Criterion | Decision |
|-----------|----------|
| All BRAIN-4E verification checks pass (26/26) | ✅ |
| All BRAIN-4F user tests pass (74/74) | ✅ |
| All BRAIN-2 checks pass (51/51) | ✅ |
| All BRAIN-3 checks pass (23/23) | ✅ |
| Audit checks pass (183 PASS / 2 INFO) | ✅ |
| No backwards compatibility regression | ✅ |
| No LLM/API/database/runtime dependency introduced | ✅ |
| No unsafe action leak | ✅ |

**Recommendation: Safe to Lock — BRAIN-4A through BRAIN-4F are complete, verified, and backward compatible.**

## Next Steps

1. BRAIN-5: LLM Gateway Feasibility Study (study only, no implementation)
2. Production stabilization / certification per Programme Stabilization Law (Rule 27)

---

*End of BRAIN-4F Internal User Testing Report*
