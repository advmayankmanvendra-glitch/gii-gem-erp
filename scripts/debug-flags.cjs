async function main() {
  const classifyMod = await import('../src/renderer/modules/erpAssistant/classifier/queryClassifier.js');
  const ff1Mod = await import('../src/renderer/modules/erpAssistant/sources/featureFunctionBridge.js');
  const { classifyQuery } = classifyMod;
  const { findFeatureByQuery } = ff1Mod;

  const query = 'How is GST calculated on a sales invoice?';
  const classification = classifyQuery(query, 'dashboard');
  const ff1 = findFeatureByQuery(query, classification, 'dashboard');
  
  console.log('classification:', JSON.stringify(classification, null, 2));
  console.log('safetyFlags:', JSON.stringify(classification.safetyFlags));
  console.log('isAccountingSensitive:', classification.safetyFlags.isAccountingSensitive);
  
  if (ff1) {
    console.log('FF1 safetyBoundary:', ff1.safetyBoundary);
    console.log('FF1 category:', ff1.category);
  }
}
main().catch(e => console.error(e));
