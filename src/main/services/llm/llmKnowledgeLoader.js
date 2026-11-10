import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Loads the Enterprise Intelligence Layer for BRAIN-5B in the main process.
// Per AGENTS.md §25.2 only the graphs the assembler needs are read. The
// BRAIN-4 classifier/knowledge bridge is the same code the Ask ERP panel runs,
// so the AI layer and the panel never disagree about sources.
const GRAPH_FILES = {
  wg1: "workflow-graph.json",
  kg4: "voucher-accounting-graph.json",
  dg1: "database-graph.json",
  kg5: "manual-graph.json",
  ff1: "feature-function-graph.json"
};

let cached = null;

export async function loadKnowledge(appRoot) {
  if (cached) return cached;
  const knowledgeDir = path.join(appRoot, "src", "renderer", "knowledge");
  const graphs = {};
  for (const [key, file] of Object.entries(GRAPH_FILES)) {
    graphs[key] = JSON.parse(fs.readFileSync(path.join(knowledgeDir, file), "utf8"));
  }
  const moduleUrl = (relative) => pathToFileURL(path.join(appRoot, "src", "renderer", "modules", relative)).href;
  const { classifyQuery } = await import(moduleUrl("erpAssistant/classifier/queryClassifier.js"));
  const { resolveQuery } = await import(moduleUrl("erpAssistant/sources/knowledgeBridge.js"));
  const { sourceBackedSearch } = await import(moduleUrl("erpBrain/services/sourceBackedSearchService.js"));
  cached = { classifyQuery, resolveQuery, sourceBackedSearch, graphs };
  return cached;
}
