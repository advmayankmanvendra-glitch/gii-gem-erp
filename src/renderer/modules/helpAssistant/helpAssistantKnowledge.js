import {
  detailedWorkflowGuide,
  erpManualSections,
  faqItems,
  keyboardGuideSections,
  knowledgeBaseItems,
  troubleshootingItems
} from "../../config/helpContent.js";
import { flatNavItems, viewTitles } from "../../config/navigation.js";

const HELP_ASSISTANT_SUGGESTIONS = [
  "I made the company, now where do I start?",
  "What should I do today?",
  "Show receivable outstanding summary",
  "Do I have low stock items?",
  "Where do I enter a supply order?",
  "Why is a voucher not posting?",
  "How do I allocate a receipt?",
  "Where can I check stock value?",
  "How do I review GST reports?",
  "What should I do on this screen?",
  "How do I create a backup?",
  "Why is a payment still outstanding?"
];

function buildHelpAssistantKnowledge(currentHelp = null) {
  const screenTopics = flatNavItems.map((item) => {
    const titleMeta = viewTitles[item.key] || [];
    return {
      id: `screen-${item.key}`,
      type: "Screen",
      title: titleMeta[0] || item.label,
      summary: titleMeta[1] || `${item.label} is available under ${item.group}.`,
      menuPath: `Dashboard > ${item.group} > ${item.label}`,
      viewKey: item.key,
      steps: [`Open ${item.group} from the left sidebar.`, `Select ${item.label}.`, "Use the screen filters, entry form, or report actions shown there."],
      commonMistakes: ["Check Current Company before entering or reviewing company-specific data.", "Use posted reports for accounting conclusions."],
      relatedTopics: [item.group, item.label, item.aliases].filter(Boolean),
      keywords: [item.key, item.label, item.group, item.aliases, titleMeta[0], titleMeta[1]].filter(Boolean)
    };
  });

  const manualTopics = erpManualSections.map(([title, summary], index) => ({
    id: `manual-${index}`,
    type: "Manual",
    title,
    summary,
    steps: ["Read the section purpose.", "Open the related module from the sidebar.", "Follow the normal maker-checker and posting controls where applicable."],
    commonMistakes: ["Do not bypass source workflows with manual entries unless an accountant approves the correction."],
    relatedTopics: [title],
    keywords: [title, summary]
  }));

  const faqTopics = faqItems.map(([title, summary], index) => ({
    id: `faq-${index}`,
    type: "FAQ",
    title,
    summary,
    steps: [summary],
    commonMistakes: ["Do not retry the same action repeatedly without reading the blocking reason."],
    relatedTopics: ["FAQ", title],
    keywords: [title, summary]
  }));

  const troubleshootingTopics = troubleshootingItems.map(([title, summary], index) => ({
    id: `troubleshooting-${index}`,
    type: "Troubleshooting",
    title,
    summary,
    steps: splitGuidance(summary),
    commonMistakes: ["Fix the source issue first; avoid direct database or ledger changes."],
    relatedTopics: ["Troubleshooting", title],
    keywords: [title, summary]
  }));

  const dictionaryTopics = knowledgeBaseItems.map(([title, summary], index) => ({
    id: `knowledge-${index}`,
    type: "Dictionary",
    title,
    summary,
    steps: [summary],
    commonMistakes: [],
    relatedTopics: ["Knowledge Base", title],
    keywords: [title, summary]
  }));

  const workflowTopics = detailedWorkflowGuide.map(([title, menuPath, summary], index) => ({
    id: `workflow-${index}`,
    type: "Workflow",
    title,
    summary,
    menuPath,
    steps: [`Go to ${menuPath}.`, summary, "Review linked records and posting status before moving to the next workflow step."],
    commonMistakes: ["Skipping this step can make later reports look incomplete."],
    relatedTopics: ["Government Supply Workflow", title],
    keywords: [title, menuPath, summary]
  }));

  const shortcutTopics = keyboardGuideSections.map(([title, rows], index) => ({
    id: `shortcut-${index}`,
    type: "Shortcut",
    title: `${title} Shortcuts`,
    summary: rows.map(([keys, label]) => `${keys}: ${label}`).join("; "),
    steps: rows.map(([keys, label]) => `${keys} - ${label}`),
    commonMistakes: ["Shortcuts never bypass confirmation for sensitive actions."],
    relatedTopics: ["Keyboard Shortcuts", title],
    keywords: [title, ...rows.flat()]
  }));

  const currentScreenTopic = currentHelp ? [{
    id: "current-screen",
    type: "Current Screen",
    title: currentHelp.title || "Current Screen",
    summary: currentHelp.description || "Guidance for the current ERP screen.",
    menuPath: currentHelp.menuPath || "",
    viewKey: currentHelp.viewKey || currentHelp.key,
    steps: safeArray(currentHelp.howToUse, ["Review the screen purpose.", "Check required fields, filters and available reports.", "Use Help, Training or Productivity shortcuts if unsure."]),
    commonMistakes: safeArray(currentHelp.commonMistakes),
    relatedTopics: [
      ...safeArray(currentHelp.relatedReports),
      ...safeArray(currentHelp.relatedShortcuts)
    ],
    keywords: [
      currentHelp.title,
      currentHelp.description,
      currentHelp.moduleName,
      ...(currentHelp.howToUse || []),
      ...(currentHelp.keyFields || []),
      ...(currentHelp.requiredFields || []),
      ...(currentHelp.accountingImpact || []),
      ...(currentHelp.inventoryImpact || []),
      ...(currentHelp.gstImpact || []),
      ...(currentHelp.commonMistakes || []),
      ...(currentHelp.relatedReports || []),
      ...(currentHelp.relatedShortcuts || [])
    ].filter(Boolean)
  }] : [];

  return [
    ...currentScreenTopic,
    ...screenTopics,
    ...manualTopics,
    ...workflowTopics,
    ...faqTopics,
    ...troubleshootingTopics,
    ...dictionaryTopics,
    ...shortcutTopics
  ];
}

function splitGuidance(text) {
  return String(text || "")
    .split(/\.\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.endsWith(".") ? part : `${part}.`);
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function brainSearchAsTopics(brainSearchFn, query) {
  try {
    const result = brainSearchFn(query);
    if (!result || !result.results) return [];
    return result.results.slice(0, 5).map((r, i) => ({
      id: `brain-${r.sourceKind}-${i}`,
      type: "Brain Source",
      title: r.title || "Knowledge result",
      summary: r.summary || "",
      sourceKind: r.sourceKind,
      sourcePath: r.sourcePath,
      graphId: r.graphId,
      menuPath: r.graphId ? `${r.graphId} graph` : "",
      viewKey: "",
      steps: [],
      commonMistakes: [],
      relatedTopics: [r.title, r.sourceKind].filter(Boolean),
      keywords: [r.title, r.summary, r.sourceKind].filter(Boolean),
      confidence: result.confidence === "high" ? 0.85 : result.confidence === "medium" ? 0.55 : 0.3,
      needsReview: result.confidence === "low",
      relatedTables: r.relatedTables || [],
      relatedReports: r.relatedReports || [],
      relatedWorkflowStages: r.relatedWorkflowStages || [],
      manualReference: r.sourceKind === "manual" ? r.sourcePath : ""
    }));
  } catch {
    return [];
  }
}

export { HELP_ASSISTANT_SUGGESTIONS, buildHelpAssistantKnowledge, brainSearchAsTopics };
