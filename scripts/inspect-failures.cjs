#!/usr/bin/env node

async function main() {
  const classifyMod = await import('../src/renderer/modules/erpAssistant/classifier/queryClassifier.js');
  const ff1Mod = await import('../src/renderer/modules/erpAssistant/sources/featureFunctionBridge.js');
  const knowledgeMod = await import('../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js');
  const { classifyQuery } = classifyMod;
  const { findFeatureByQuery } = ff1Mod;
  const { resolveQuery } = knowledgeMod;

  const queries = [
    ['PROC-009', 'What happens before Goods Receipt?'],
    ['PROC-010', 'What is supplier purchase order for?'],
    ['DC-007', 'What comes before installation?'],
    ['DC-008', 'What is DC in order flow?'],
    ['CRAC-006', 'What comes after installation?'],
    ['CRAC-007', 'When is invoice readiness achieved?'],
    ['CRAC-008', 'How does CRAC affect sales invoice?'],
    ['WO-005', 'Which stage is the operational root?'],
    ['WO-007', 'How does the government supply lifecycle start?'],
    ['DC-005', 'Explain delivery stage'],
    ['CRAC-005', 'Explain customer acceptance stage'],
    ['BV-007', 'What voucher types are available?'],
    ['BS-003', 'How are assets and liabilities shown?'],
    ['RPT-001', 'How many type of reports are there?'],
    ['RPT-002', 'What reports are available?'],
    ['RPT-003', 'Which financial reports exist?'],
    ['RPT-005', 'Which inventory reports are there?'],
    ['RPT-015', 'What reports can be exported?'],
  ];

  for (const [id, query] of queries) {
    const classification = classifyQuery(query, 'dashboard');
    const response = resolveQuery(query, 'dashboard');
    const ff1Match = findFeatureByQuery(query, classification, 'dashboard');
    
    console.log(id + ': ' + query);
    console.log('  category=' + classification.category + ', confidence=' + classification.confidence);
    if (ff1Match) {
      console.log('  FF-1: ' + ff1Match.featureName + ' (level=' + ff1Match.matchLevel + ', score=' + ff1Match.matchScore + ')');
      console.log('  reason: ' + (ff1Match.matchReason || 'none'));
      console.log('  answer: ' + (response.answer || '(null)').substring(0, 120));
      console.log('  sourceKinds: ' + JSON.stringify((response.sourceReferences || []).map(s => s.sourceKind)));
    } else {
      console.log('  FF-1: none');
      console.log('  answer: ' + (response.answer || '(null)').substring(0, 120));
      console.log('  sourceKinds: ' + JSON.stringify((response.sourceReferences || []).map(s => s.sourceKind)));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
