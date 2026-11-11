async function main() {
  const classifyMod = await import('../src/renderer/modules/erpAssistant/classifier/queryClassifier.js');
  const ff1Mod = await import('../src/renderer/modules/erpAssistant/sources/featureFunctionBridge.js');
  const knowledgeMod = await import('../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js');
  const { classifyQuery } = classifyMod;
  const { findFeatureByQuery } = ff1Mod;
  const { resolveQuery } = knowledgeMod;

  const cases = [
    'GST-001', 'How is GST calculated on a sales invoice?',
    'GST-010', 'What is GST summary report?',
    'RPT-009', 'What is receivables aging report?',
    'RPT-004', 'What GST reports are available?',
    'RPT-003', 'Which financial reports exist?',
    'BILL-002', 'How does GST invoice affect accounts?',
    'PL-003', 'How is profit loss generated?',
    'WO-005', 'Which stage is the operational root?',
    'BV-007', 'What voucher types are available?',
  ];

  for (let i = 0; i < cases.length; i += 2) {
    const id = cases[i];
    const query = cases[i + 1];
    const classification = classifyQuery(query, 'dashboard');
    const response = resolveQuery(query, 'dashboard');
    const ff1 = findFeatureByQuery(query, classification, 'dashboard');
    console.log(id + ': ' + query);
    console.log('  cat=' + classification.category + ' conf=' + classification.confidence);
    if (ff1) {
      console.log('  FF1=' + ff1.featureName + ' level=' + ff1.matchLevel + ' score=' + ff1.matchScore + ' cat=' + (ff1.category || 'none'));
    } else {
      console.log('  FF1=none');
    }
    console.log('  boundary=' + response.safetyBoundary + ' answer=' + (response.answer || '(null)').substring(0, 80));
    console.log('');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
