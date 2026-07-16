const fs = require('fs');
const path = require('path');
const graphPath = path.join(__dirname, '..', 'src', 'renderer', 'knowledge', 'feature-function-graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

// Fix safetyBoundary for workflow stage features
const fixes = {
  'FEA-16': 'workflow-sensitive',  // Delivery Challan (was inventory-sensitive)
  'FEA-18': 'workflow-sensitive',  // CRAC (was read-only guidance)
  'FEA-17': 'workflow-sensitive',  // Installation (was read-only guidance)
};

for (const [id, newSafety] of Object.entries(fixes)) {
  const f = graph.featureNodes.find(x => x.id === id);
  if (f) {
    console.log(f.id + ' ' + f.canonicalName + ': ' + f.safetyBoundary + ' -> ' + newSafety);
    f.safetyBoundary = newSafety;
  } else {
    console.log(id + ' NOT FOUND');
  }
}

// Update safetyBoundaryMap if it exists
if (graph.safetyBoundaryMap) {
  for (const [id, newSafety] of Object.entries(fixes)) {
    if (graph.safetyBoundaryMap[id]) {
      console.log('safetyBoundaryMap[' + id + ']: ' + graph.safetyBoundaryMap[id] + ' -> ' + newSafety);
      graph.safetyBoundaryMap[id] = newSafety;
    }
  }
}

fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n');
console.log('Graph updated.');
