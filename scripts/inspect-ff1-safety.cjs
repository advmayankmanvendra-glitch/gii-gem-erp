const graph = require('../src/renderer/knowledge/feature-function-graph.json');
const targets = ['Trial Balance', 'Profit and Loss', 'Balance Sheet', 'Delivery Challan', 'CRAC', 'Billing / GST Invoice', 'Installation', 'GST Reports', 'Inventory Reservation', 'Receivables'];
for (const t of targets) {
  const f = graph.featureNodes.find(x => x.canonicalName === t || x.featureName === t);
  if (f) {
    console.log(t + ': safetyBoundary=' + f.safetyBoundary + ', category=' + f.category + ', id=' + f.id);
  } else {
    console.log(t + ': NOT FOUND');
  }
}
