import React, { useState } from "react";
import {
  CurrentScreenHelpSection,
  ErpUserManualSection,
  FaqTroubleshootingSection,
  HelpHero,
  HelpSearchPanel,
  KeyboardProductivityGuide,
  KnowledgeRoleSection,
  ModuleGuidanceSection,
  TrainingModeSection,
  WorkflowGuideSection
} from "../components/helpTraining/index.jsx";
import {
  detailedWorkflowGuide,
  erpManualSections,
  faqItems,
  guidedLessons,
  keyboardGuideSections,
  knowledgeBaseItems,
  roleHelpProfiles,
  trainingSample,
  troubleshootingItems
} from "../config/helpContent.js";
import { flatNavItems } from "../config/navigation.js";
import { requestPrintPreview } from "../utils/uiHelpers.js";

export function HelpTrainingScreen({ currentView, trainingMode, setTrainingMode, onNavigate, onShortcutHelp, helpForView, matchesHelpQuery }) {
  const [helpQuery, setHelpQuery] = useState("");
  const moduleHelp = flatNavItems
    .filter((item) => item.key !== "help_training")
    .map((item) => helpForView(item.key));
  const currentHelp = helpForView(currentView);
  const filteredManual = erpManualSections.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredFaq = faqItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredTroubleshooting = troubleshootingItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredKnowledge = knowledgeBaseItems.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredShortcuts = keyboardGuideSections
    .map(([title, rows]) => [title, rows.filter((row) => matchesHelpQuery([title, ...row], helpQuery))])
    .filter(([title, rows]) => !helpQuery.trim() || rows.length || title.toLowerCase().includes(helpQuery.trim().toLowerCase()));
  const filteredModules = moduleHelp.filter((item) => matchesHelpQuery([item.title, item.description, ...item.howToUse, ...item.commonMistakes, ...item.bestPractices, ...item.relatedReports], helpQuery));
  const displayShortcutSections = filteredShortcuts.map(([title, rows]) => [
    title,
    helpQuery.trim() ? rows : keyboardGuideSections.find(([name]) => name === title)?.[1] || rows
  ]);
  const filteredWorkflowGuide = detailedWorkflowGuide.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredLessons = guidedLessons.filter((row) => matchesHelpQuery(row, helpQuery));
  const filteredRoles = roleHelpProfiles.filter((row) => matchesHelpQuery(row, helpQuery));
  const visibleModules = filteredModules.slice(0, helpQuery.trim() ? 80 : 36);

  return (
    <section className="help-training-screen" data-print-title="ERP User Manual">
      <HelpHero trainingMode={trainingMode} onToggleTraining={() => setTrainingMode(!trainingMode)} onShortcutHelp={onShortcutHelp} onPrintManual={requestPrintPreview} />
      <HelpSearchPanel query={helpQuery} onQueryChange={setHelpQuery} />
      <CurrentScreenHelpSection currentHelp={currentHelp} />
      <KeyboardProductivityGuide shortcutSections={displayShortcutSections} />
      <ErpUserManualSection manualSections={filteredManual} allSections={erpManualSections} />
      <WorkflowGuideSection rows={filteredWorkflowGuide} />
      <TrainingModeSection trainingMode={trainingMode} sample={trainingSample} lessons={filteredLessons} />
      <FaqTroubleshootingSection faqRows={filteredFaq} troubleshootingRows={filteredTroubleshooting} />
      <KnowledgeRoleSection knowledgeRows={filteredKnowledge} roleRows={filteredRoles} />
      <ModuleGuidanceSection modules={visibleModules} onNavigate={onNavigate} />
    </section>
  );
}
