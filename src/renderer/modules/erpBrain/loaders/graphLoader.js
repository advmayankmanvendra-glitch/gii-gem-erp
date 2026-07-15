import workflowGraph from "../../../knowledge/workflow-graph.json" with { type: "json" };
import databaseGraph from "../../../knowledge/database-graph.json" with { type: "json" };
import voucherAccountingGraph from "../../../knowledge/voucher-accounting-graph.json" with { type: "json" };
import rendererGraph from "../../../knowledge/renderer-graph.json" with { type: "json" };

const graphRegistry = {
  "WG-1": { graphId: "WG-1", title: "Workflow Intelligence Graph", data: workflowGraph, kind: "workflow" },
  "DG-1": { graphId: "DG-1", title: "Database Intelligence Graph", data: databaseGraph, kind: "database" },
  "KG-4": { graphId: "KG-4", title: "Voucher and Accounting Graph", data: voucherAccountingGraph, kind: "accounting" },
  "RG-1": { graphId: "RG-1", title: "Renderer Intelligence Graph", data: rendererGraph, kind: "renderer" }
};

const loadedGraphs = {};

function loadGraph(graphId) {
  if (loadedGraphs[graphId]) return loadedGraphs[graphId];
  const entry = graphRegistry[graphId];
  if (!entry) return null;
  loadedGraphs[graphId] = entry.data;
  return entry.data;
}

function loadAllGraphs() {
  for (const graphId of Object.keys(graphRegistry)) {
    loadGraph(graphId);
  }
  return loadedGraphs;
}

function getGraphRegistry() {
  return graphRegistry;
}

function getActiveGraphs() {
  return Object.keys(graphRegistry).map((id) => ({
    graphId: id,
    title: graphRegistry[id].title,
    kind: graphRegistry[id].kind,
    loaded: !!loadedGraphs[id]
  }));
}

function getGraphByKind(kind) {
  const id = Object.keys(graphRegistry).find((gid) => graphRegistry[gid].kind === kind);
  return id ? loadGraph(id) : null;
}

export { loadGraph, loadAllGraphs, getGraphRegistry, getActiveGraphs, getGraphByKind };
