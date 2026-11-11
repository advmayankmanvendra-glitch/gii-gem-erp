async function main() {
  const mod = await import('../src/renderer/modules/erpAssistant/response/safetyEnforcer.js');
  const safetyInfo = mod.enforceSafety(
    {category: 'gst_tax', safetyFlags: {isAccountingSensitive: false}},
    {results: [{sourceKind: 'accounting-sensitive'}]}
  );
  console.log('enforceSafety result:', JSON.stringify(safetyInfo));
}
main().catch(e => console.error(e));
