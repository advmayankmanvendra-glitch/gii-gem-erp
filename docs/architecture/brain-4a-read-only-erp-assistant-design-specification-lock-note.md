# BRAIN-4A Read-Only ERP Assistant Design Specification Lock Note

## Lock Summary

BRAIN-4A is locked as a documentation-only design specification for a future Read-Only ERP Assistant.

## Confirmations

- No chatbot UI was implemented.
- No LLM, API, model, OpenAI, Claude, Gemini, Anthropic, or external SDK integration was added.
- No live-record assistant, database query, or data mutation capability was designed.
- No action-taking behavior was designed.
- No runtime ERP code was changed for BRAIN-4A.
- No database, accounting, voucher, ledger, GST, inventory, report SQL, IPC, preload, or route logic changed.
- No existing files were modified during BRAIN-4A.
- The design consumes only the locked Enterprise Intelligence Layer baseline and the BRAIN-4 planning report.

## Design Deliverable

`docs/architecture/brain-4a-read-only-erp-assistant-design-specification.md` defines:

- Module architecture and file tree for `src/renderer/modules/erpAssistant/`
- Component hierarchy and interfaces for all UI elements
- Data flow from user query through classifier/answer builder/safety enforcer/role renderer
- Query classification algorithm with 12 categories and preferred source rules
- Answer contract shape with all required fields and builder pipeline
- Safety enforcer design with 6-domain boundary matrix
- Role-aware presentation mapping for 6 ERP roles
- UI layout design with prohibited element specification
- Integration points with BRAIN-2, BRAIN-3, and knowledge graphs
- Verification design with 20 checks (R4-001 through R4-020)
- Implementation sequencing for BRAIN-4B through BRAIN-4F
- Risk mitigation in design for all 11 identified risks
- Files to create (11 new files across phases) and files to modify (5 existing files)

## Next Phase Boundary

The next phase, if separately approved, may be **BRAIN-4B Query Classifier Prototype**. It must:

1. Read this specification and the BRAIN-4 planning report before implementation.
2. Create only `src/renderer/modules/erpAssistant/classifier/queryClassifier.js` and `categoryDefinitions.js`.
3. Not modify any existing file.
4. Not create any UI, answer builder, source-loading bridge, or verification script.
5. Remain local, read-only, and data-free (no runtime data access).

Chatbot, LLM gateway, live-record assistant, and action-taking assistant implementation remain prohibited.

## Decision

**SAFE TO LOCK: YES.** BRAIN-4A design specification is complete. No implementation authorization is implied.
