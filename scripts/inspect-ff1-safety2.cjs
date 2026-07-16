const graph = require('../src/renderer/knowledge/feature-function-graph.json');
const targets = ['Profit and Loss', 'P&L', 'Profit and Loss / P&L'];
for (const t of targets) {
  const f = graph.featureNodes.find(x => x.canonicalName === t || x.featureName === t);
  if (f) console.log(f.canonicalName + ': safetyBoundary=' + f.safetyBoundary);
}
// Search broadly
for (const f of graph.featureNodes) {
  if (f.canonicalName && (f.canonicalName.includes('Profit') || f.featureName.includes('Profit'))) {
    console.log('Found: ' + f.canonicalName + ' / ' + f.featureName + ' safety=' + f.safetyBoundary);
  }
}
// Also check Delivery Challan, CRAC, Installation
for (const id of ['FEA-16', 'FEA-18', 'FEA-17']) {
  const f = graph.featureNodes.find(x => x.id === id);
  console.log(f.id + ' ' + f.canonicalName + ' safety=' + f.safetyBoundary + ' category=' + (f.category || 'none'));
}
