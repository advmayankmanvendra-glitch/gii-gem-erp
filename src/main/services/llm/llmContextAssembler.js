// BRAIN-5B: Context & Evidence Assembler. The ERP decides what the model may
// see. It routes the question through the existing BRAIN-4 classifier and
// knowledge bridge (BRAIN-2 search, FF-1 routing), then pulls only the graph
// records those results point at: WG-1 stages and ordering rules, KG-4 voucher
// patterns, DG-1 tables, KG-5 manual sections, and the RG-1/FF-1 screen. Each
// item carries a stable id the model must cite (LLM-002 / LLM-003).
//
// knowledge (injected, see llmKnowledgeLoader.js):
//   classifyQuery(q), resolveQuery(q), sourceBackedSearch(q)
//   graphs: { wg1, kg4, dg1, kg5, ff1 }

const MAX_ITEMS = 12;
const MAX_SUMMARY = 600;
const clip = (text, max = MAX_SUMMARY) => {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};
const words = (text) => String(text || "").toLowerCase().match(/[a-z]{4,}/g) || [];
// Light stemming: "invoiced"/"invoice" match, "supplier"/"supply" do not.
const stem = (word) => word.replace(/(ing|ed|es|s)$/, "").slice(0, 6);
const overlap = (text, asked) => words(text).filter((word) => asked.has(stem(word))).length;

export function createContextAssembler({ knowledge }) {
  const { classifyQuery, resolveQuery, sourceBackedSearch, graphs = {} } = knowledge;
  const wgNodes = new Map((graphs.wg1?.nodes || []).map((node) => [node.id, node]));
  const kg4Types = graphs.kg4?.voucherTypes || [];
  const dgTables = new Map((graphs.dg1?.tables || []).map((table) => [table.tableName, table]));
  const protectedTables = new Map((graphs.dg1?.accountingProtectionMappings || []).map((row) => [row.table, row]));

  function stageEvidence(stageId) {
    const node = wgNodes.get(stageId);
    if (!node) return null;
    const label = (id) => wgNodes.get(id)?.label || id;
    const rules = (graphs.wg1?.requiredStages || []).filter((rule) => rule.before === stageId || rule.after === stageId).map((rule) => rule.condition);
    const impacts = [node.createsAccountingImpact && "creates accounting entries", node.createsInventoryImpact && "changes stock", node.createsGSTImpact && "has GST impact"].filter(Boolean);
    return {
      id: `WG-1:${node.id}`,
      source: "WG-1",
      module: "workflow",
      title: `Workflow stage: ${node.label}`,
      summary: clip([
        `Comes after: ${(node.upstreamDeps || []).map(label).join(", ") || "nothing (entry stage)"}.`,
        `Leads to: ${(node.downstreamDeps || []).map(label).join(", ") || "nothing (final stage)"}.`,
        rules.length ? `Ordering rules: ${rules.join("; ")}.` : "",
        impacts.length ? `This stage ${impacts.join(", ")}.` : "This stage has no accounting, stock or GST impact.",
        node.requiredDocuments?.length ? `Required documents: ${node.requiredDocuments.join(", ")}.` : "",
        node.knownGaps?.length ? `Known gaps: ${[].concat(node.knownGaps).map((gap) => gap.gap || gap).join("; ")}.` : ""
      ].join(" "))
    };
  }

  // Stages the question names (at least half the label's words), plus each
  // one's direct prerequisites, since "why hasn't X happened" is answered by
  // what must come before X.
  function stagesMentioned(question) {
    const asked = new Set(words(question).map(stem));
    const named = [...wgNodes.values()].filter((node) => {
      const labelWords = [...new Set(words(node.label))];
      return labelWords.length && labelWords.filter((word) => asked.has(stem(word))).length / labelWords.length >= 0.5;
    });
    return named.flatMap((node) => [node.id, ...(node.upstreamDeps || [])]);
  }

  function voucherEvidence(name) {
    const key = String(name || "").toLowerCase();
    const type = kg4Types.find((row) => [row.voucherTypeId, row.displayName, row.voucherTypeDb].some((value) => String(value || "").toLowerCase() === key));
    if (!type) return null;
    return {
      id: `KG-4:${type.voucherTypeId}`,
      source: "KG-4",
      module: type.sourceModule || "accounting",
      title: `Voucher type: ${type.displayName}`,
      summary: clip(`Debit: ${(type.debitPattern || []).join(", ")}. Credit: ${(type.creditPattern || []).join(", ")}. Posted by ${type.postingFunction || "the accounting service"} from ${type.sourceTable || "its source table"}${type.allowedWorkflowStage ? ` at workflow stage ${type.allowedWorkflowStage}` : ""}.`)
    };
  }

  function tableEvidence(tableName) {
    const table = dgTables.get(tableName);
    if (!table) return null;
    const guard = protectedTables.get(tableName);
    return {
      id: `DG-1:${table.tableName}`,
      source: "DG-1",
      module: table.owningModule || table.category || "database",
      title: `Data table: ${table.title || table.tableName}`,
      summary: clip(`${table.category ? `${table.category} table` : "Table"}${table.relatedWorkflowStage ? ` for stage ${table.relatedWorkflowStage}` : ""}${table.relatedScreen ? `, shown on ${table.relatedScreen}` : ""}.${guard ? ` Protected: ${guard.reason}; only ${guard.controllingService} may write it.` : ""}`)
    };
  }

  function manualEvidence(stageIds, screens, question) {
    const asked = new Set(words(question).map(stem));
    const out = [];
    for (const manual of graphs.kg5?.manuals || []) {
      const linked = (manual.workflowStageRefs || []).some((ref) => stageIds.includes(ref)) || (manual.screenRefs || []).some((ref) => screens.includes(ref));
      for (const section of manual.sections || []) {
        const hits = overlap(`${section.heading} ${section.excerpt}`, asked);
        if (hits >= 2 || (linked && hits >= 1)) out.push({ hits, manual, section });
      }
    }
    return out.sort((a, b) => b.hits - a.hits).slice(0, 3).map(({ manual, section }) => ({
      id: `KG-5:${section.sectionId}`,
      source: "KG-5",
      module: manual.category || "manual",
      title: `${manual.title}: ${section.heading}`,
      summary: clip(section.excerpt)
    }));
  }

  return async function assembleContext({ question }) {
    const classification = classifyQuery(question);
    if (classification?.category === "unsafe_action") return { intent: "unsafe_action", evidence: [] };
    const brain4 = resolveQuery(question) || {};
    const evidence = [];
    const add = (item) => {
      if (item && !evidence.some((existing) => existing.id === item.id)) evidence.push(item);
    };

    if (brain4.answer && brain4.confidence !== "low") {
      add({
        id: "BRAIN-4:answer",
        source: (brain4.sourceReferences || []).map((ref) => ref.graphId || ref.sourceKind).filter(Boolean)[0] || "BRAIN-4",
        module: classification?.category || "general",
        title: "ERP knowledge answer (BRAIN-4, source-backed)",
        summary: clip(brain4.answer, 900)
      });
    }
    const stageIds = [...new Set([...(brain4.relatedWorkflowStages || []), ...stagesMentioned(question)])].slice(0, 5);
    stageIds.forEach((id) => add(stageEvidence(id)));
    (brain4.relatedVoucherTypes || []).slice(0, 2).forEach((name) => add(voucherEvidence(name)));
    manualEvidence(stageIds, brain4.relatedScreens || [], question).forEach(add);
    (brain4.relatedTables || []).slice(0, 2).forEach((name) => add(tableEvidence(name)));
    const search = sourceBackedSearch ? sourceBackedSearch(question) : null;
    for (const result of (search?.results || []).slice(0, 3)) {
      // BRAIN-2 synonym expansion can surface unrelated hits; keep only results
      // that share a word with the question.
      if (result.score < 10 || !overlap(`${result.title} ${result.summary}`, new Set(words(question).map(stem)))) continue;
      add({ id: `BRAIN-2:${result.sourceId}`, source: result.graphId || result.repoName || result.sourceKind, module: result.repoName || result.sourceKind, title: result.title, summary: clip(result.summary) });
    }

    return {
      intent: classification?.category || "general",
      safetyBoundary: brain4.safetyBoundary || null,
      relatedScreens: brain4.relatedScreens || [],
      evidence: evidence.slice(0, MAX_ITEMS)
    };
  };
}
