const fs = require('fs');
const path = require('path');

const KNOWLEDGE_REPO_PATH = path.join(__dirname, '..', '..', 'src', 'renderer', 'knowledge', 'tally', 'tallyKnowledgeRepository.json');

let _knowledgeRepo = null;

function loadKnowledgeRepository() {
  if (_knowledgeRepo) return _knowledgeRepo;
  try {
    const absPath = path.resolve(KNOWLEDGE_REPO_PATH);
    const raw = fs.readFileSync(absPath, 'utf-8');
    _knowledgeRepo = JSON.parse(raw);
    return _knowledgeRepo;
  } catch (err) {
    throw new Error(`Failed to load knowledge repository from ${KNOWLEDGE_REPO_PATH}: ${err.message}`);
  }
}

function mapTallyToGii(tallyEntity) {
  const repo = loadKnowledgeRepository();

  if (!tallyEntity || !tallyEntity.entityType) {
    return {
      success: false,
      error: 'Invalid tally entity: entityType is required',
      entityType: null,
      giiModule: null,
      risk: null,
      matchedFields: [],
      unmatchedFields: [],
      riskyFields: [],
      mapping: {}
    };
  }

  const entityType = tallyEntity.entityType;
  const entityConfig = repo.entityTypes[entityType];

  if (!entityConfig) {
    return {
      success: false,
      entityType: entityType,
      giiModule: null,
      risk: null,
      error: `Unknown entity type: ${entityType}. Not found in knowledge repository.`,
      matchedFields: [],
      unmatchedFields: Object.keys(tallyEntity.fields || {}).map(f => ({
        tallyField: f,
        value: tallyEntity.fields[f],
        reason: 'Entity type not mapped'
      })),
      riskyFields: [],
      mapping: {}
    };
  }

  const fieldMapping = entityConfig.fieldMapping || {};
  const tallyFields = tallyEntity.fields || {};
  const matchedFields = [];
  const unmatchedFields = [];
  const riskyFields = [];

  const mappedResult = {};

  for (const [tallyField, tallyValue] of Object.entries(tallyFields)) {
    const mappingDef = fieldMapping[tallyField];

    if (mappingDef) {
      matchedFields.push({
        tallyField: tallyField,
        giiField: mappingDef.giiField,
        target: mappingDef.target,
        type: mappingDef.type,
        value: tallyValue,
        required: mappingDef.required || false,
        risk: entityConfig.risk
      });

      mappedResult[tallyField] = {
        giiField: mappingDef.giiField,
        target: mappingDef.target,
        mappedValue: tallyValue,
        type: mappingDef.type
      };

      if (entityConfig.risk === 'P1' || entityConfig.risk === 'P0') {
        riskyFields.push({
          tallyField: tallyField,
          giiField: mappingDef.giiField,
          risk: entityConfig.risk,
          reason: `Entity type ${entityType} is priority ${entityConfig.risk}`
        });
      }
    } else {
      unmatchedFields.push({
        tallyField: tallyField,
        value: tallyValue,
        reason: `No mapping defined for field '${tallyField}' in entity type '${entityType}'`
      });
    }
  }

  const requiredFields = entityConfig.requiredFields || [];
  const missingRequired = requiredFields.filter(rf => !(rf in tallyFields));

  return {
    success: true,
    entityType: entityType,
    entityName: tallyEntity.name,
    giiModule: entityConfig.giiModule,
    risk: entityConfig.risk,
    matchedFields: matchedFields,
    unmatchedFields: unmatchedFields,
    riskyFields: riskyFields,
    missingRequiredFields: missingRequired,
    mapping: mappedResult,
    listElements: tallyEntity.listElements || null,
    reservedGroupType: entityConfig.reservedGroupMapping ? resolveReservedGroup(tallyEntity, entityConfig) : null,
    giiVoucherType: entityConfig.voucherTypeMapping ? resolveVoucherType(tallyEntity, entityConfig) : null
  };
}

function resolveReservedGroup(tallyEntity, config) {
  if (!config.reservedGroupMapping) return null;
  const name = tallyEntity.name || '';
  const reservedName = tallyEntity.reservedName || '';
  const key = reservedName || name;
  return config.reservedGroupMapping[key] || null;
}

function resolveVoucherType(tallyEntity, config) {
  if (!config.voucherTypeMapping) return null;
  const name = tallyEntity.name || '';
  const reservedName = tallyEntity.reservedName || '';
  const voucherTypeName = tallyEntity.fields ? (tallyEntity.fields.VOUCHERTYPENAME || name) : name;
  const key = reservedName || voucherTypeName || name;
  return config.voucherTypeMapping[key] || null;
}

function mapAllEntities(parsedEntities) {
  const results = [];
  for (const entity of parsedEntities) {
    results.push(mapTallyToGii(entity));
  }
  return results;
}

module.exports = { mapTallyToGii, mapAllEntities, loadKnowledgeRepository, resolveReservedGroup, resolveVoucherType };

if (require.main === module) {
  const tallyEntity = process.argv[2] ? JSON.parse(process.argv[2]) : {
    entityType: 'LEDGER',
    name: 'Axis Bank',
    fields: {
      NAME: 'Axis Bank',
      PARENT: 'Bank Accounts',
      OPENINGBALANCE: 146923.83,
      OBSTATUS: 'Cr',
      ISBILLWISEON: 'No'
    }
  };
  const result = mapTallyToGii(tallyEntity);
  console.log(JSON.stringify(result, null, 2));
}
