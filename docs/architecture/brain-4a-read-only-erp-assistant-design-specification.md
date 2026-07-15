# BRAIN-4A Read-Only ERP Assistant Design Specification

## 1. Executive Summary

BRAIN-4A refines the BRAIN-4 planning blueprint into an actionable design specification for the Read-Only ERP Assistant. It defines module architecture, file structure, component hierarchy, data flow, query classification engine, answer contract builder, role-aware rendering, UI extension points, and verification design — all without implementing runtime code.

The design consumes only the locked Enterprise Intelligence Layer v1.0.0 baseline: KG-1, WG-1, DG-1, KG-4, BRAIN-2, BRAIN-3, RG-1, and manuals. No chatbot, LLM, live-record, or action-taking capability is designed.

## 2. Dependency Baseline

| Dependency | Locked version | Design use |
|---|---|---|
| KG-1 Knowledge Graph | v1.0.0 | Module/feature metadata, navigation, risk flags, help topics |
| WG-1 / KG-2 Workflow Graph | v1.0.0 | Workflow stage, dependency, skip rule, operational boundary |
| DG-1 Database Graph | v1.0.0 | Static table/relationship/report-source explanation |
| KG-4 Voucher & Accounting Graph | v1.0.0 | Voucher pattern, posting rules, reversal rules, accounting explanation |
| RG-1 Renderer Graph | v1.0.0 | Screen route, component, renderer metadata |
| BRAIN-2 Source-Backed Intelligence | v1.0.0 (51 checks) | Source search, answer contract, confidence, re-ranking, known gaps |
| BRAIN-3 Contextual Help Assistant | v1.0.0 (23 checks) | Existing help panel, screen-context resolver, accounting safety boundaries |
| Manuals | User documents | Operation, training, troubleshooting, month-end, import, migration |
| Graph registry | `repository/graph-registry.json` | Source discovery and routing |

The assistant loads the graph registry first (`getGraphRegistry()`) and then loads only the required source set for a query.

## 3. Module Architecture

### 3.1 Module Tree

```
src/renderer/modules/erpAssistant/          # BRAIN-4 container (new module)
  index.js                                  # Public API: query(), classify(), buildResponse()
  classifier/
    queryClassifier.js                      # Maps user query to category + preferred source
    categoryDefinitions.js                  # 12 query categories with rules
  response/
    answerContractBuilder.js                # Assembles response contract from BRAIN-2 + enriched metadata
    safetyEnforcer.js                       # Applies safety boundaries per category/domain
    roleRenderer.js                         # Adjusts explanation depth by role (presentation only)
  sources/
    knowledgeBridge.js                      # Proxy to BRAIN-2 sourceBackedSearch + BRAIN-3 context
  ui/
    AssistantPanel.jsx                      # Main read-only assistant panel component
    AssistantAnswerCard.jsx                 # Answer card with source/safety/confidence display
    AssistantSourceRefs.jsx                 # Source reference list with navigation links
    AssistantSafetyNotice.jsx               # Safety boundary banner component
    AssistantRoleProvider.jsx               # Role context provider (reads from ERP role store, does not mutate)
```

### 3.2 Existing Files Extended

| Existing file | Extension |
|---|---|
| `src/renderer/modules/helpAssistant/HelpAssistant.jsx` | Add "Ask ERP Brain" tab or toggle integration point |
| `src/renderer/modules/helpAssistant/helpAssistantUtils.js` | Add BRAIN-4 query dispatch if BRAIN-2/3 fallback fails |
| `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js` | Add `searchByCategory()` export for category-filtered search |
| `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js` | Expose `buildAnswerContract()` matching BRAIN-4 response contract |
| `src/renderer/modules/helpAssistant/contextualBrainHelp.js` | Add `resolveScreenAssistantContext()` for screen-scoped assistant queries |

### 3.3 Data Flow

```
User types query
    |
    v
[AssistantPanel.jsx]            (UI input)
    |
    v
[queryClassifier.js]            (classify -> category + preferred source + safety flag)
    |
    v
[knowledgeBridge.js]            (BRAIN-2 sourceBackedSearch with category filter)
    |
    v
[answerContractBuilder.js]      (assemble response contract from search results)
    |
    +-- [safetyEnforcer.js]    (apply boundary rules per category/domain)
    |
    v
[roleRenderer.js]               (adjust depth/fields for current user role)
    |
    v
[AssistantAnswerCard.jsx]       (render answer + sources + safety + confidence)
```

### 3.4 Prohibited Import Rules

The module at `src/renderer/modules/erpAssistant/` must never import:

- `electron` (IPC write channels)
- `better-sqlite3` or any database driver
- `axios`, `fetch`, or any HTTP client
- `openai`, `@anthropic-ai/sdk`, `langchain`, or any LLM SDK
- `child_process` or `shell` APIs
- `fs` write methods
- Any `src/main/` service that performs writes

Allowed imports: knowledge graphs, BRAIN-2 answer builder, BRAIN-3 utils, manual loaders, graph loaders, repository loader, route/navigation utilities, React, and pure UI components.

## 4. Query Classification Design

### 4.1 Classifier Interface

```js
// Input: raw user query string + optional current screen viewKey
// Output: classification result object
function classifyQuery(query, currentViewKey) {
  return {
    category,           // one of 12 query categories (string)
    preferredSource,    // primary source graph id
    fallbackSource,     // secondary source id
    isAccountingSensitive,  // boolean
    isInventorySensitive,   // boolean
    isGSTSensitive,         // boolean
    isWorkflowSensitive,    // boolean
    isImportExportSensitive,// boolean
    requiresSafetyNotice,   // boolean
    requiresManualFallback, // boolean
    requiresNeedsReview     // boolean
  };
}
```

### 4.2 Category Definitions

| Category ID | Match keywords | Preferred source | Fallback | Safety | Confidence model |
|---|---|---|---|---|---|
| `workflow` | workflow, stage, order, crac, grn, closure, lifecycle | WG-1 | manuals | financial stages only | High if WG-1 match, else medium |
| `screen_help` | where is, how do I open, which menu, screen, route | RG-1 | KG-1, BRAIN-3 | no | High if route match, else low |
| `manual_training` | how to, guide, steps, procedure, checklist, training | manuals | KG-1 | no (contextual) | High if manual section match |
| `database_table` | table, column, field, database, schema, report source | DG-1 | KG-1 | always | High if DG-1 match |
| `voucher_accounting` | voucher, debit, credit, journal, posting, ledger entry | KG-4 | DG-1, manuals | always | High if KG-4 match, else low |
| `report` | report, trial balance, p&l, balance sheet, gst register | DG-1 + KG-4 | RG-1 | financial reports always | Medium (report source data) |
| `gst_tax` | gst, tax, hsn, sac, invoice, e-way bill | KG-4 | manuals | always, filing excluded | Medium (no compliance cert) |
| `inventory` | stock, inward, outward, adjustment, valuation, grn | WG-1 + DG-1 | KG-1, manuals | always | Medium (static flow only) |
| `troubleshooting` | error, fail, blank, not working, issue, problem | BRAIN errors | manuals | contextual | Low (no live inspection) |
| `known_gap` | known gap, limitation, not implemented, planned | graph `knownGaps` | architecture reports | always | High if gap documented |
| `unsafe_action` | post, reverse, approve, delete, import, export, fix, run command | none | none | always | N/A (refused) |
| `unknown` | (no match) | manuals | KG-1 | contextual | Always low, requires review |

### 4.3 Classification Algorithm (Pseudocode)

```
1. Normalize query: lowercase, trim, remove extra spaces.
2. Check for unsafe action keywords first. If matched -> return "unsafe_action" category immediately.
3. Check for known_gap keywords (limitation, not implemented, known gap).
4. Check for troubleshooting keywords (error, fail, blank, issue).
5. For remaining, match against category keyword groups with scoring:
   - Each category has a weighted keyword map
   - The winning category is the one with highest cumulative score
   - Tiebreaker: more specific category wins (voucher_accounting > database_table)
6. If no category score exceeds minimum threshold -> return "unknown" category.
7. For categories with impact-sensitive rules, cross-check against SCREEN_IMPACT_MAP from contextualBrainHelp.js.
8. Return classification result with derived safety flags.
```

## 5. Answer Contract Builder Design

### 5.1 Standard Response Object

```js
{
  query: "string",                    // Original user query
  answer: "string | null",            // Generated answer text
  confidence: "high | medium | low",  // Answer confidence
  needsReview: false,                 // True if confidence is low or gap matches
  sourceReferences: [
    {
      title: "string",
      sourceKind: "workflow-graph | database-graph | voucher-accounting-graph | renderer-graph | repository | manual",
      sourcePath: "string",
      graphId: "string | null",
      summary: "string"
    }
  ],
  relatedWorkflowStages: ["string"],
  relatedScreens: ["string"],
  relatedTables: ["string"],
  relatedVoucherTypes: ["string"],
  relatedReports: ["string"],
  safetyBoundary: "read-only guidance | accounting-sensitive | inventory-sensitive | gst-sensitive | workflow-sensitive | import-sensitive",
  knownGaps: [
    {
      title: "string",
      summary: "string",
      sourceKind: "workflow-graph | database-graph | voucher-accounting-graph | renderer-graph | repository"
    }
  ],
  suggestedNextHelpTopic: "string | null",
  prohibitedActions: ["post", "reverse", "approve", "delete", "restore", "import", "export", "run command"],
  rolePresentation: {
    depth: "basic | standard | detailed | diagnostic",
    showSources: true,
    showSafety: true,
    showGaps: false
  }
}
```

### 5.2 Builder Pipeline

```
[knowledgeBridge.js]
  1. Call BRAIN-2 sourceBackedSearch(query, { limit: 10 })
  2. Call queryClassifier(query) for category + safety flags
  3. If category == "unsafe_action": return refusal early
  4. If category == "screen_help" and currentViewKey known:
     Call BRAIN-3 resolveContext(viewKey) for enriched context
  5. Merge search results with category metadata
  6. Apply safetyEnforcer to mark boundaries and filter prohibited content
  7. Apply roleRenderer to adjust depth
  8. Compute confidence from:
     - Number and quality of source matches
     - Whether preferred source contributed the primary answer
     - Whether known gaps overlap the query
     - Whether manual fallback was required
  9. Assemble response object per contract
```

### 5.3 Refusal Answer for Unsafe Actions

```js
// When category == "unsafe_action":
{
  query: "post this voucher",
  answer: "I cannot post vouchers. I am a read-only guidance assistant. You can post this voucher through: Operations → Business Vouchers or Accounting Vouchers in the sidebar.",
  confidence: "high",
  needsReview: false,
  sourceReferences: [{ title: "Prohibited Actions — Read-Only Policy", sourceKind: "repository", sourcePath: "brain-4-safety-policy", graphId: null, summary: "The assistant must not post, reverse, approve, delete, or alter ERP records." }],
  safetyBoundary: "read-only guidance — action refused",
  prohibitedActions: ["post", "reverse", "approve", "delete"],
  rolePresentation: { depth: "standard", showSources: true, showSafety: true, showGaps: false }
}
```

## 6. Safety Enforcer Design

### 6.1 Boundary Rules Matrix

| Safety domain | Trigger | Enforcement |
|---|---|---|
| Accounting-sensitive | category == "voucher_accounting" OR SCREEN_IMPACT_MAP shows accounting:true | Add `safetyBoundary: "accounting-sensitive"` + include prohibited actions + include `getAccountingSafetyBoundary()` notice |
| Database-sensitive | category == "database_table" | Add `safetyBoundary: "database-sensitive"` + confirm no live record values in answer |
| Inventory-sensitive | category == "inventory" OR SCREEN_IMPACT_MAP shows inventory:true | Add `safetyBoundary: "inventory-sensitive"` + confirm no stock values in answer |
| GST-sensitive | category == "gst_tax" | Add `safetyBoundary: "gst-sensitive"` + include disclaimer that assistant cannot certify tax compliance |
| Workflow-sensitive | category == "workflow" AND stage is financial (e.g., SALES_INVOICE, RECEIPT) | Add `safetyBoundary: "workflow-sensitive"` + confirm no workflow status mutation suggested |
| Import/export-sensitive | category == "unsafe_action" AND contains import/export keywords | Add `safetyBoundary: "import-sensitive"` + direct to controlled import screen only |

### 6.2 Safety Notice Template

For any accounting/inventory/GST-sensitive answer, prepend to answer text:

> **Guidance only.** I explain the ERP process but cannot post, reverse, approve, or alter records. Verify the actual result in the relevant ERP screen or report before taking action.

## 7. Role-Aware Presentation Renderer

### 7.1 Role Detection

The assistant reads the current ERP user role from an existing store (e.g., `useUserStore` or `useAuthStore`). It does not call any permission API, mutate role state, or attempt to authenticate.

### 7.2 Depth Mapping

| ERP role | `depth` value | Presentation behavior |
|---|---|---|
| `admin` | `diagnostic` | Show full source references, graph IDs, known gaps, source paths, safety boundaries, and diagnostic summary. |
| `accountant` | `detailed` | Show voucher patterns, debit/credit explanation, ledger impact, accounting safety with full warning, related reports. Hide graph IDs and known gaps unless query explicitly asks. |
| `operator` | `basic` | Show workflow steps, screen navigation, next action, required fields, and manual reference. Hide accounting detail, graph source metadata, and gaps. |
| `approver` | `standard` | Show approval policy explanation, workflow dependency, source evidence, and screen links. No posting or reversal reference in guidance. |
| `auditor` | `detailed` | Show source trail, audit evidence path, table relationships, protection rules, and report dependency chain. No workflow action suggestion. |
| `readonly` | `basic` | Show plain navigation, screen labels, and manual reference only. No accounting detail, no gaps, no source paths. |

### 7.3 Role Renderer Interface

```js
function renderForRole(response, role) {
  // Apply depth mapping
  // Filter/trim answer text for role-appropriate detail
  // Strip or add source references per depth
  // Strip or add known gaps per depth
  // Return modified response with rolePresentation metadata
  // NEVER: call permission API, mutate store, change authentication, or bypass access control
}
```

## 8. UI Design Specification

### 8.1 Recommended UI: Help Assistant Panel Extension

The first UI is an extension of the existing Help Assistant panel with a read-only **Ask ERP Brain** tab.

#### Layout

```
+--------------------------------------------------+
| Help Assistant  [Ask ERP Brain *] [Manuals] [FAQ] |  <- tabs
+--------------------------------------------------+
| [What would you like to know?               ] [Go] |  <- read-only input
+--------------------------------------------------+
|                                                    |
| [Answer Card]                                      |
|   I am confident that Work Order / Supply Order    |
|   is the operational root stage. It is followed    |
|   by Procurement Planning then Supplier Purchase   |
|   Order. Work Order has no direct accounting,      |
|   inventory, or GST impact.                        |
|                                                    |
|   Source: WG-1 Workflow Intelligence Graph         |
|   (workflow-graph.json)                            |
|                                                    |
|   [Safety: read-only guidance]                     |
|                                                    |
|   Related: Procurement Planning, Supplier PO       |
|   Screens: Supply Order / Work Order               |
|   Next: What is CRAC?                              |
|                                                    |
|   [I cannot: post, reverse, approve, delete]       |
+--------------------------------------------------+
```

### 8.2 Component Specifications

#### `AssistantPanel.jsx`
- Container with tab integration into Help Assistant
- Read-only input field (no command execution, no SQL, no file path interpretation)
- Submit button triggers query dispatch
- Loading state during classification
- Empty state for first visit
- Error state for unavailable BRAIN-2 sources

#### `AssistantAnswerCard.jsx`
- Receives response contract object
- Renders answer text with markdown-like formatting
- Shows confidence badge (high=green, medium=yellow, low=red)
- Shows needs-review banner if true
- Safety boundary badge at bottom
- Prohibited actions footer

#### `AssistantSourceRefs.jsx`
- Receives `sourceReferences` array
- Renders clickable source references
- Source badges (WG-1, DG-1, KG-4, RG-1, Manual, Repository)
- Clicking a source reference navigates to the related screen/context if possible
- No live-link to database records

#### `AssistantSafetyNotice.jsx`
- Receives safetyBoundary string
- Shows appropriate banner per domain:
  - Accounting-sensitive: yellow banner with "read-only guidance" notice
  - GST-sensitive: orange banner with "not tax/filing advice" notice
  - Inventory-sensitive: blue banner with "no stock mutation" notice
  - Workflow-sensitive: gray banner with "no workflow bypass" notice

#### `AssistantRoleProvider.jsx`
- Reads current role from existing store
- Provides role context to child components
- Does not store, write, or transmit role data outside the component tree
- Does not call permission APIs

### 8.3 Prohibited UI Elements

The following must never appear in the assistant UI:

| Element | Reason |
|---|---|
| "Post this voucher" button | Accounting mutation |
| "Reverse this voucher" button | Accounting mutation |
| "Approve this record" button | Governance mutation |
| "Import this file" button | Data mutation |
| "Fix database" button | Data mutation |
| "Run command" button | Host security risk |
| "Delete record" button | Data mutation |
| "Export to CSV/Excel" button | Data export mutation |
| SQL query input | Live database access |
| JavaScript console input | Security risk |
| File upload input | Import mutation |

### 8.4 Future UI Concepts (Not Implemented)

- Screen-specific assistant card: shows contextual assistant for the current screen
- Workflow trace assistant: visual workflow map with assistant overlay
- Report explanation assistant: opens when user views a report
- Training mode assistant: step-by-step walkthrough with progress tracking

## 9. Integration Points with Existing Architecture

### 9.1 BRAIN-2 Integration (`knowledgeBridge.js`)

```
erpAssistant/knowledgeBridge.js
    |
    +-- calls --> erpBrain/services/sourceBackedSearchService.sourceBackedSearch(query, filters)
    |               (extend sourceBackedSearchService to accept { category, preferredSource } filters)
    |
    +-- calls --> erpBrain/services/sourceBackedAnswerBuilder.buildAnswer(query)
    |               (extend to return full response contract, not just summary)
    |
    +-- reads --> erpBrain/loaders/graphLoader.getGraphByKind(kind)
    +-- reads --> erpBrain/loaders/manualLoader.getManualSections(manualId)
```

### 9.2 BRAIN-3 Integration

```
erpAssistant/sources/knowledgeBridge.js
    |
    +-- calls --> helpAssistant/contextualBrainHelp.resolveContext(viewKey)
    |               (provides screen name, workflow stage, impact map for current screen)
    |
    +-- calls --> helpAssistant/helpAssistantUtils (screen guidance enrichment)
```

The assistant uses BRAIN-3's SCREEN_IMPACT_MAP to determine whether the current screen is accounting-sensitive, inventory-sensitive, or GST-sensitive, and applies safety boundaries accordingly.

### 9.3 Graph Registry Integration

```
erpAssistant/sources/knowledgeBridge.js
    |
    +-- reads --> erpBrain/loaders/graphLoader.getGraphRegistry()
    |               (discovers available graphs and their metadata)
    |
    +-- uses --> queryClassifier preferred source -> loadGraph(kind)
    |               (loads only the required graph, not all)
```

## 10. Answer Template Design

### 10.1 Workflow Answer Template

```
I am [confident/moderately confident/not very confident] that [stage name] is the [position] stage in the Government Supply lifecycle.

Predecessor: [before stage]
Successor: [after stage]

[Work-order boundary note if applicable]

Source: WG-1 Workflow Intelligence Graph ([path])

Related screens: [screen names]
Related tables: [table names]

[Safety boundary note if financial stage]
```

### 10.2 Voucher/Accounting Answer Template

```
[Voucher type] is a [accounting voucher / business voucher] type.

Debit: [debit pattern]
Credit: [credit pattern]

Accounting impact: [impact description]
Posting rules: [rules]
Reversal: [reversal policy]

Related workflow stages: [stages]
Related reports: [reports]

[Accounting safety notice — always shown]

Source: KG-4 Voucher and Accounting Graph ([path])
```

### 10.3 Screen Guidance Template

```
You can find [screen name] under [menu path] in the sidebar.

Purpose: [screen purpose]
Related workflow stage: [stage]
Related vouchers: [voucher types]

Source: RG-1 Renderer Graph ([path])

[Safety boundary if accounting/inventory screen]
```

### 10.4 Refusal Template (Unsafe Action)

```
I cannot [action]. I am a read-only guidance assistant.

To [action], use the controlled ERP module:
- [controlled screen or process description]

Source: BRAIN-4 Safety Policy
```

## 11. Verification Design

### 11.1 Test File: `scripts/verify-read-only-erp-assistant-plan.js`

Future implementation must include this verification script. It should contain:

| Test ID | Check | Expected | Category |
|---|---|---|---|
| R4-001 | Planning report exists | File present | Plan |
| R4-002 | Lock note exists | File present | Plan |
| R4-003 | No LLM/API import in erpAssistant module | No `import` from OpenAI/Anthropic/etc | Safety |
| R4-004 | No write IPC import | No `ipcRenderer` invoke/on for write channels | Safety |
| R4-005 | No database driver import | No `better-sqlite3` or `sql.js` import | Safety |
| R4-006 | No fetch/axios import | No HTTP client import | Safety |
| R4-007 | No shell/child_process import | No `child_process` or `shell` | Safety |
| R4-008 | Query categories defined | `categoryDefinitions.js` exports 12 categories | Structure |
| R4-009 | Preferred source rules defined per category | Each category has preferred and fallback source | Structure |
| R4-010 | Safety boundaries defined per domain | `safetyEnforcer.js` covers 6 domains | Safety |
| R4-011 | Response contract includes sourceReferences | Builder returns sourceReferences array | Contract |
| R4-012 | Response contract includes confidence | Builder returns confidence field | Contract |
| R4-013 | Response contract includes safetyBoundary | Builder returns safetyBoundary field | Contract |
| R4-014 | Unsafe action request returns refusal | `classifyQuery("post voucher")` returns "unsafe_action" | Behavior |
| R4-015 | Accounting-sensitive query applies safety notice | Builder includes safetyBoundary for voucher queries | Behavior |
| R4-016 | Manual fallback defined | `classifyQuery` returns fallbackSource for each category | Safety |
| R4-017 | No UI mutation buttons exist | No "post this voucher" etc buttons in AssistantPanel.jsx | UI |
| R4-018 | AssistantPanel reads role, does not write it | `roleRenderer.js` only reads, never writes role store | Safety |
| R4-019 | BRAIN-2 backward compatible | `verify:erp-brain` still passes 51 checks | Regression |
| R4-020 | BRAIN-3 backward compatible | `verify:help-assistant-brain` still passes 23 checks | Regression |

### 11.2 Verification Execution Plan

```bash
# Pre-implementation baseline verification
npm run verify:erp-brain          # Must PASS (51 checks)
npm run verify:help-assistant-brain # Must PASS (23 checks)
npm run lint:syntax                # Must PASS
npm run build                      # Must PASS

# Post-implementation verification (when BRAIN-4B onwards are implemented)
npm run verify:read-only-assistant  # All R4-* checks
npm run verify:erp-brain            # Regression — must still PASS
npm run verify:help-assistant-brain # Regression — must still PASS
npm run verify:audit                # Regression — must still PASS
```

## 12. Files to Create (Future BRAIN-4B to BRAIN-4D)

| Phase | File | Type |
|---|---|---|
| BRAIN-4B | `src/renderer/modules/erpAssistant/classifier/queryClassifier.js` | Implementation |
| BRAIN-4B | `src/renderer/modules/erpAssistant/classifier/categoryDefinitions.js` | Implementation |
| BRAIN-4C | `src/renderer/modules/erpAssistant/response/answerContractBuilder.js` | Implementation |
| BRAIN-4C | `src/renderer/modules/erpAssistant/response/safetyEnforcer.js` | Implementation |
| BRAIN-4C | `src/renderer/modules/erpAssistant/sources/knowledgeBridge.js` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/ui/AssistantPanel.jsx` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/ui/AssistantAnswerCard.jsx` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/ui/AssistantSourceRefs.jsx` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/ui/AssistantSafetyNotice.jsx` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/ui/AssistantRoleProvider.jsx` | Implementation |
| BRAIN-4D | `src/renderer/modules/erpAssistant/response/roleRenderer.js` | Implementation |
| BRAIN-4E | `scripts/verify-read-only-erp-assistant-plan.js` | Implementation |
| BRAIN-4A | `docs/architecture/brain-4a-read-only-erp-assistant-design-specification.md` | Documentation (this file) |

No file outside this list may be created for BRAIN-4 without separate approval.

## 13. Files to Modify (Future BRAIN-4 Implementation)

| Phase | File | Modification |
|---|---|---|
| BRAIN-4D | `src/renderer/modules/helpAssistant/HelpAssistant.jsx` | Add "Ask ERP Brain" tab integration point |
| BRAIN-4D | `src/renderer/modules/helpAssistant/helpAssistantUtils.js` | Add BRAIN-4 dispatch fallback |
| BRAIN-4C | `src/renderer/modules/erpBrain/services/sourceBackedSearchService.js` | Add `searchByCategory()` export |
| BRAIN-4C | `src/renderer/modules/erpBrain/services/sourceBackedAnswerBuilder.js` | Add `buildAnswerContract()` export |
| BRAIN-4D | `src/renderer/modules/helpAssistant/contextualBrainHelp.js` | Add `resolveScreenAssistantContext()` |

Only these modifications are permitted during BRAIN-4 implementation. No other existing file may be changed without separate approval.

## 14. Implementation Sequencing

### BRAIN-4B (Query Classifier Prototype)

1. Create `categoryDefinitions.js` with 12 categories, each defining match keywords, preferred source, fallback source, safety flags.
2. Create `queryClassifier.js` with scoring algorithm and `classifyQuery(query, currentViewKey)` export.
3. Verify: all 12 categories return correct classification for representative queries.
4. No UI, no answer builder, no source loading.

### BRAIN-4C (Answer Contract Implementation)

1. Extend `sourceBackedSearchService.js` with `searchByCategory(category, query)`.
2. Create `knowledgeBridge.js` that calls BRAIN-2 search + BRAIN-3 context.
3. Create `safetyEnforcer.js` with 6-domain boundary rules.
4. Create `answerContractBuilder.js` that assembles full response contract.
5. Verify: response contract contains all required fields.

### BRAIN-4D (Help Assistant UI Extension)

1. Create `AssistantPanel.jsx`, `AssistantAnswerCard.jsx`, `AssistantSourceRefs.jsx`, `AssistantSafetyNotice.jsx`, `AssistantRoleProvider.jsx`.
2. Create `roleRenderer.js` with depth mapping for 6 roles.
3. Add "Ask ERP Brain" tab to HelpAssistant.jsx.
4. Verify: no mutation buttons present; role-based presentation correct.

### BRAIN-4E (Verification)

1. Create `scripts/verify-read-only-erp-assistant-plan.js`.
2. Verify: all R4-001 through R4-020 checks pass.
3. Verify: BRAIN-2 and BRAIN-3 regression suites still pass.

### BRAIN-4F (User Testing)

1. Manual testing with representative query set.
2. Safety boundary behavioral testing.
3. Unsafe action refusal testing.
4. Role presentation testing.
5. Backward compatibility verification.

## 15. Risk Mitigation in Design

| Risk | Design mitigation |
|---|---|
| Hallucinated ERP process | Source-required contract: every substantive answer must cite at least one source reference. If no source matches, confidence is low and needsReview is true. |
| Wrong voucher/accounting answer | Preferred source enforcement: voucher/accounting queries require KG-4 as primary source. The answer must include accounting safety notice. |
| Outdated manual reference | Manual index validation: `manualIndex.js` freshness check. sourcePath must exist. |
| Guidance treated as posting authority | Prohibited actions footer in every answer. Role renderer strips actionable language for non-admin roles. |
| Work Order/Supply Order confusion | Enforced canonical terminology via BRAIN-2 synonym map. Answer must use both names where applicable. |
| Draft vs posted confusion | Safety enforcer adds state distinction warning for voucher/report queries. |
| Live-record assistant accidentally introduced | Module-level prohibited import scan. No database driver or live-data API in scope. |
| LLM added without governance | Module-level prohibited SDK import scan. No fetch/HTTP client in scope. |
| Role/permission bypass | Role renderer is read-only: it reads from existing store, never writes. No permission API in scope. |
| Tax/compliance overstatement | GST-sensitive answers always include disclaimer: assistant cannot certify tax compliance. |
| Action-taking feature creep | UI specification explicitly prohibits mutation buttons. Verification R4-017 scans for prohibited UI elements. |

## 16. Design Scope Boundaries

### In scope for BRAIN-4A design:
- Module architecture and file tree
- Component hierarchy and interfaces
- Data flow and integration points
- Classification algorithm design
- Answer contract shape and builder pipeline
- Safety enforcer rules
- Role presentation mapping
- UI layout and component specs
- Verification test design
- Implementation sequencing for BRAIN-4B through BRAIN-4F

### Out of scope (never in BRAIN-4):
- Chatbot UI with freeform conversation memory
- External LLM, API, or model integration
- Live database record reading
- Live financial data analysis
- Voucher posting, reversal, or approval
- Ledger, stock, or GST record mutation
- Import, export, email, or command execution
- Permission or role mutation
- Any action button that creates, modifies, or deletes ERP data
- Database schema changes
- Accounting logic changes

## 17. Safe-to-Proceed Recommendation

**Safe to proceed to BRAIN-4B (Query Classifier Prototype)** when separately approved. The design specification is complete, all integration points are defined, prohibited imports are documented, safety boundaries are enforced by design, and no runtime ERP code change is required until BRAIN-4C.

BRAIN-4B must begin by reading this specification and the BRAIN-4 planning report, then creating only the classifier module. No UI, no answer builder, no source-loading bridge, and no modifications to existing files are permitted in BRAIN-4B.

---

*End of BRAIN-4A Design Specification. Documentation only. No implementation authorized by this document.*
