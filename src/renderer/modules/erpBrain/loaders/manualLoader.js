import manualIndex from "../data/manualIndex.js";

let loadedManuals = null;

const MANUAL_SOURCES = [
  { id: "user-operations-manual", title: "Complete User Operations Manual", file: "GII-GeM-ERP-Complete-User-Operations-Manual.md" },
  { id: "quick-start-guide", title: "Quick Start Guide", file: "GII-GeM-ERP-Quick-Start-Guide.md" },
  { id: "training-workbook", title: "Training Workbook", file: "GII-GeM-ERP-Training-Workbook.md" },
  { id: "daily-operations-checklist", title: "Daily Operations Checklist", file: "GII-GeM-ERP-Daily-Operations-Checklist.md" },
  { id: "month-end-checklist", title: "Month-End Financial Checklist", file: "GII-GeM-ERP-Month-End-Financial-Checklist.md" },
  { id: "troubleshooting-guide", title: "Troubleshooting Guide", file: "GII-GeM-ERP-Troubleshooting-Guide.md" },
  { id: "command-execution-guide", title: "Command Execution Guide", file: "GII-GeM-ERP-Command-Execution-Guide.md" },
  { id: "feature-status-matrix", title: "Feature Status Matrix", file: "GII-GeM-ERP-Feature-Status-Matrix.md" },
  { id: "knowledge-gap-report", title: "Knowledge Gap Report", file: "GII-GeM-ERP-Knowledge-Gap-Report.md" },
  { id: "manual-generation-report", title: "Manual Generation Report", file: "GII-GeM-ERP-Manual-Generation-Report.md" }
];

function loadAllManuals() {
  if (loadedManuals) return loadedManuals;
  loadedManuals = [];
  for (const source of MANUAL_SOURCES) {
    const sections = manualIndex[source.id];
    if (sections && sections.length > 0) {
      loadedManuals.push({
        id: source.id,
        title: source.title,
        sourcePath: `docs/manuals/${source.file}`,
        sections: sections.map((s, i) => ({
          sectionId: `${source.id}-section-${i}`,
          heading: s.heading || s.title,
          excerpt: s.excerpt || s.summary,
          sourceId: source.id,
          sourceTitle: source.title,
          sourcePath: `docs/manuals/${source.file}`
        }))
      });
    }
  }
  return loadedManuals;
}

function getManualSections(sourceId) {
  const manuals = loadAllManuals();
  const manual = manuals.find((m) => m.id === sourceId);
  return manual ? manual.sections : [];
}

function searchManuals(query) {
  if (!query || typeof query !== "string") return [];
  const q = query.toLowerCase().trim();
  const manuals = loadAllManuals();
  const results = [];
  for (const manual of manuals) {
    for (const section of manual.sections) {
      const haystack = [section.heading, section.excerpt, manual.title].join(" ").toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          sourceKind: "manual",
          sourceId: section.sourceId,
          sourcePath: section.sourcePath,
          sectionId: section.sectionId,
          title: section.heading,
          summary: section.excerpt,
          manualTitle: manual.title,
          confidence: haystack.startsWith(q) ? "high" : haystack.includes(` ${q} `) ? "medium" : "low"
        });
      }
    }
  }
  return results;
}

function getAllManualIds() {
  return MANUAL_SOURCES.map((m) => m.id);
}

export { loadAllManuals, getManualSections, searchManuals, getAllManualIds, MANUAL_SOURCES };
