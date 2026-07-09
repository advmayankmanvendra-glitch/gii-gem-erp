const fs = require('fs');
const path = require('path');
const { loadKnowledgeRepository } = require('./map-tally-to-gii.cjs');

const KNOWLEDGE_REPO_PATH = path.join(__dirname, '..', '..', 'src', 'renderer', 'knowledge', 'tally', 'tallyKnowledgeRepository.json');

function validateTallyMapping(parsedData) {
  let repo;
  try {
    repo = loadKnowledgeRepository();
  } catch (err) {
    return {
      success: false,
      error: err.message,
      warnings: [],
      errors: [],
      summary: { totalWarnings: 0, totalErrors: 0, isValid: false }
    };
  }

  const report = {
    success: true,
    generatedAt: new Date().toISOString(),
    source: {
      filePath: parsedData.filePath || null,
      fileName: parsedData.fileName || null,
      totalEntities: (parsedData.entities || []).length,
      entityTypes: parsedData.entityType || []
    },
    warnings: [],
    errors: [],
    summary: {
      totalWarnings: 0,
      totalErrors: 0,
      isValid: true,
      unmappedEntityTypes: [],
      missingRequiredFields: [],
      unmappedFields: [],
      highRiskEntities: [],
      missingParentRefs: []
    }
  };

  const entities = parsedData.entities || [];
  if (entities.length === 0) {
    report.warnings.push({
      type: 'NO_ENTITIES',
      message: 'No entities found in parsed data to validate'
    });
    report.summary.totalWarnings = 1;
    return report;
  }

  const entityTypeCounts = {};
  for (const entity of entities) {
    entityTypeCounts[entity.entityType] = (entityTypeCounts[entity.entityType] || 0) + 1;
  }

  for (const [entityType, count] of Object.entries(entityTypeCounts)) {
    if (!repo.entityTypes[entityType]) {
      const isKnownUnmapped = (repo.unmappedEntityTypes || []).includes(entityType);
      report.warnings.push({
        type: 'UNMAPPED_ENTITY_TYPE',
        entityType: entityType,
        count: count,
        message: `Entity type '${entityType}' (${count} instances) has no mapping in knowledge repository`,
        isKnownUnmapped: isKnownUnmapped
      });
      report.summary.unmappedEntityTypes.push(entityType);
      report.summary.totalWarnings++;
    }
  }

  for (const entity of entities) {
    validateEntity(entity, repo, report);
  }

  const companyName = parsedData.envelope ? parsedData.envelope.companyName : null;
  if (companyName) {
    report.source.companyName = companyName;
  }

  report.summary.totalWarnings = report.warnings.length;
  report.summary.totalErrors = report.errors.length;
  report.summary.isValid = report.summary.totalErrors === 0;

  return report;
}

function validateEntity(entity, repo, report) {
  const entityType = entity.entityType;
  const entityConfig = repo.entityTypes[entityType];
  const fields = entity.fields || {};

  if (!entityConfig) {
    return;
  }

  const requiredFields = entityConfig.requiredFields || [];
  for (const reqField of requiredFields) {
    if (!(reqField in fields) || fields[reqField] === null || fields[reqField] === undefined || fields[reqField] === '') {
      report.errors.push({
        type: 'MISSING_REQUIRED_FIELD',
        entityType: entityType,
        entityName: entity.name,
        field: reqField,
        message: `Required field '${reqField}' is missing or empty in ${entityType} '${entity.name}'`
      });
      report.summary.missingRequiredFields.push({
        entityType: entityType,
        entityName: entity.name,
        field: reqField
      });
    }
  }

  const validationRules = repo.validationRules || {};
  const reqGST = validationRules.requiredGSTFields || [];
  for (const gstField of reqGST) {
    if (!(gstField in fields)) {
      report.warnings.push({
        type: 'MISSING_GST_FIELD',
        entityType: entityType,
        entityName: entity.name,
        field: gstField,
        message: `GST-related field '${gstField}' not found in ${entityType} '${entity.name}'`
      });
    }
  }

  const reqBaseUnits = validationRules.requiredBaseUnits || [];
  for (const buField of reqBaseUnits) {
    if (!(buField in fields)) {
      report.warnings.push({
        type: 'MISSING_BASE_UNITS',
        entityType: entityType,
        entityName: entity.name,
        field: buField,
        message: `Base units field '${buField}' not found in ${entityType} '${entity.name}'`
      });
    }
  }

  const fieldMapping = entityConfig.fieldMapping || {};
  for (const [tallyField, value] of Object.entries(fields)) {
    if (!fieldMapping[tallyField]) {
      report.warnings.push({
        type: 'UNMAPPED_FIELD',
        entityType: entityType,
        entityName: entity.name,
        field: tallyField,
        value: value,
        message: `Field '${tallyField}' in ${entityType} '${entity.name}' has no mapped target in GII ERP`
      });
      report.summary.unmappedFields.push({
        entityType: entityType,
        entityName: entity.name,
        field: tallyField
      });
    }
  }

  if (entityConfig.risk === 'P0' || entityConfig.risk === 'P1') {
    report.summary.highRiskEntities.push({
      entityType: entityType,
      entityName: entity.name,
      risk: entityConfig.risk,
      reason: `Entity type ${entityType} is classified as ${entityConfig.risk} risk`
    });
  }

  const missingParentRefs = validationRules.missingParentGroupRefs || {};
  const parentRule = missingParentRefs[entityType];
  if (parentRule) {
    const parentValue = fields[parentRule.field];
    if (!parentValue || parentValue === '') {
      report.warnings.push({
        type: 'MISSING_PARENT_REF',
        entityType: entityType,
        entityName: entity.name,
        field: parentRule.field,
        expectedRefEntity: parentRule.refEntity,
        message: `Parent reference field '${parentRule.field}' is empty in ${entityType} '${entity.name}'. Expected reference to ${parentRule.refEntity}`
      });
      report.summary.missingParentRefs.push({
        entityType: entityType,
        entityName: entity.name,
        field: parentRule.field
      });
    }
  }

  const highRiskFieldDefs = validationRules.highRiskFields || {};
  const hrf = highRiskFieldDefs[entityType] || [];
  for (const riskyField of hrf) {
    if (riskyField.endsWith('.LIST')) {
      if (entity.listElements && entity.listElements[riskyField]) {
        report.warnings.push({
          type: 'HIGH_RISK_DATA',
          entityType: entityType,
          entityName: entity.name,
          field: riskyField,
          message: `High-risk collection '${riskyField}' present in ${entityType} '${entity.name}'`
        });
      }
    } else if (riskyField in fields) {
      report.warnings.push({
        type: 'HIGH_RISK_DATA',
        entityType: entityType,
        entityName: entity.name,
        field: riskyField,
        value: fields[riskyField],
        message: `High-risk field '${riskyField}' present in ${entityType} '${entity.name}' with value: ${fields[riskyField]}`
      });
    }
  }
}

module.exports = { validateTallyMapping };

if (require.main === module) {
  const testData = {
    filePath: 'C:\\Program Files\\TallyPrime\\LEDGERS.xml',
    fileName: 'LEDGERS.xml',
    entityType: 'LEDGER',
    entities: [
      {
        entityType: 'LEDGER',
        name: 'Axis Bank',
        fields: { NAME: 'Axis Bank', PARENT: 'Bank Accounts', OPENINGBALANCE: 146923.83, OBSTATUS: 'Cr' },
        listElements: null
      },
      {
        entityType: 'LEDGER',
        name: 'Test Ledger',
        fields: { NAME: 'Test Ledger', OPENINGBALANCE: 0 },
        listElements: null
      }
    ],
    envelope: { companyName: 'GESTURE INDIA INFRASTRUCTURE PRIVATE LIMITED' }
  };
  const result = validateTallyMapping(testData);
  console.log(JSON.stringify(result, null, 2));
}
