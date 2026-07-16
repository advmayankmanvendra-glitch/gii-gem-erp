const { CATEGORIES } = require('../src/renderer/modules/erpAssistant/classifier/categoryDefinitions.js');
const sensitive = CATEGORIES.filter(c => c.isAccountingSensitive);
sensitive.forEach(c => {
  console.log(c.id + ': isAccountingSensitive=' + c.isAccountingSensitive + ', isGSTSensitive=' + c.isGSTSensitive + ', isInventorySensitive=' + c.isInventorySensitive);
});
