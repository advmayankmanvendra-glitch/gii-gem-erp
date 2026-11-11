const fs = require('fs');
const path = require('path');

const SELF_CLOSING_TAGS = [
  'GRPDEBITPARENT', 'GRPCREDITPARENT', 'PARENT',
  'ADDITIONALUNITS', 'LANGUAGENAME.LIST'
];

function parseTallyXml(filePath) {
  const result = {
    success: false,
    filePath: filePath,
    fileName: path.basename(filePath),
    envelope: null,
    entityType: null,
    entityCount: 0,
    entities: [],
    errors: [],
    warnings: []
  };

  let raw;
  try {
    raw = fs.readFileSync(filePath, { encoding: 'ucs2' });
  } catch (readErr) {
    try {
      raw = fs.readFileSync(filePath, { encoding: 'utf16le' });
    } catch (readErr2) {
      result.errors.push(`Cannot read file: ${readErr2.message}`);
      return result;
    }
  }

  raw = raw.replace(/^\uFEFF/, '');

  const envelope = extractEnvelope(raw);
  if (!envelope) {
    result.errors.push('No ENVELOPE structure detected');
    return result;
  }
  result.envelope = envelope;

  const tallyMessages = extractTallyMessages(raw);
  if (tallyMessages.length === 0) {
    result.warnings.push('No TALLYMESSAGE elements found');
  }

  for (const tm of tallyMessages) {
    const entity = parseTallyMessage(tm, raw);
    if (entity) {
      result.entities.push(entity);
    }
  }

  if (result.entities.length > 0) {
    const typeCounts = {};
    for (const ent of result.entities) {
      typeCounts[ent.entityType] = (typeCounts[ent.entityType] || 0) + 1;
    }
    const types = Object.keys(typeCounts);
    result.entityType = types.length === 1 ? types[0] : types;
    result.entityCount = result.entities.length;
  }

  result.success = result.errors.length === 0;
  return result;
}

function extractEnvelope(raw) {
  const envMatch = raw.match(/<ENVELOPE>([\s\S]*?)<\/ENVELOPE>/);
  if (!envMatch) return null;

  const envelopeContent = envMatch[1];

  const tallyReq = extractTag(envelopeContent, 'TALLYREQUEST');
  const reportName = extractTag(envelopeContent, 'REPORTNAME');
  const companyName = extractTag(envelopeContent, 'SVCURRENTCOMPANY');

  let bodyType = null;
  if (envelopeContent.includes('<IMPORTDATA>')) bodyType = 'IMPORTDATA';
  else if (envelopeContent.includes('<EXPORTDATA>')) bodyType = 'EXPORTDATA';
  else if (envelopeContent.includes('<DESC>')) bodyType = 'DESC';

  return {
    tallyRequest: tallyReq,
    reportName: reportName,
    companyName: companyName,
    bodyType: bodyType
  };
}

function extractTallyMessages(raw) {
  const messages = [];
  const pattern = /<TALLYMESSAGE[\s\S]*?<\/TALLYMESSAGE>/g;
  let match;

  while ((match = pattern.exec(raw)) !== null) {
    messages.push(match[0]);
  }

  return messages;
}

function parseTallyMessage(tallyMessageXml, fullXml) {
  let objTagMatch = tallyMessageXml.match(/<(?:(\w+)\s+NAME="[^"]*"|(\w+)\s+NAME='[^']*')/);
  let entityType = objTagMatch ? (objTagMatch[1] || objTagMatch[2]) : null;
  let name = null;

  if (objTagMatch) {
    const nameMatch = tallyMessageXml.match(/NAME="([^"]*)"/);
    name = nameMatch ? nameMatch[1] : null;
  } else {
    const allTags = tallyMessageXml.match(/<(\w+)\s/g);
    if (!allTags) return null;
    const wrapperTags = ['TALLYMESSAGE'];
    const entityTag = allTags.map(m => m.match(/<(\w+)\s/)[1]).find(t => !wrapperTags.includes(t));
    if (!entityTag) return null;
    entityType = entityTag;

    const nameAttrMatch = tallyMessageXml.match(new RegExp(entityType + '.*?NAME="([^"]*)"'));
    if (nameAttrMatch) {
      name = nameAttrMatch[1];
    } else {
      const vchTypeMatch = tallyMessageXml.match(/VCHTYPE="([^"]*)"/);
      if (vchTypeMatch) {
        name = vchTypeMatch[1];
      } else {
        const anyNameAttr = tallyMessageXml.match(/\w+NAME="([^"]*)"/);
        name = anyNameAttr ? anyNameAttr[1] : entityType;
      }
    }
  }

  const reservedNameMatch = tallyMessageXml.match(/RESERVEDNAME="([^"]*)"/);
  const reservedName = reservedNameMatch ? reservedNameMatch[1] : null;

  const fields = extractFields(tallyMessageXml, entityType);

  const listElements = extractListElements(tallyMessageXml);

  return {
    entityType: entityType,
    name: name,
    reservedName: reservedName || null,
    fields: fields,
    listElements: listElements
  };
}

function extractFields(xml, entityType) {
  const fields = {};

  const simpleFieldPattern = /<(\w+(?:\.\w+)*)>([^<]*)<\/\1>/g;
  let match;

  while ((match = simpleFieldPattern.exec(xml)) !== null) {
    const fieldName = match[1];
    const rawValue = match[2].trim();

    if (fieldName.toUpperCase() === fieldName && !fieldName.includes('.LIST')) {
      fields[fieldName] = convertTallyValue(rawValue);
    }
  }

  const attrPattern = /<(\w+)\s+NAME="([^"]*)"[^>]*\/>/g;
  while ((match = attrPattern.exec(xml)) !== null) {
    const tagName = match[1];
    if (SELF_CLOSING_TAGS.includes(tagName) && !fields[tagName]) {
      fields[tagName] = null;
    }
  }

  return fields;
}

function extractListElements(xml) {
  const lists = {};

  const listTagPattern = /<(\w+\.LIST)>[\s\S]*?<\/\1>/g;
  let listMatch;

  while ((listMatch = listTagPattern.exec(xml)) !== null) {
    const listName = listMatch[1];
    const listContent = listMatch[0];

    const items = [];
    const itemPattern = /<(\w+(?:\.\w+)*)>(?:<(\w+)>([^<]*)<\/\2>)?([\s\S]*?)<\/\1>/g;
    let itemMatch;

    const directItems = [];
    const singleItemPattern = /<(\w+)>([^<]*)<\/(?:\1)>/g;
    let sim;

    while ((sim = singleItemPattern.exec(listContent)) !== null) {
      if (!sim[0].includes('.LIST')) {
        directItems.push({ field: sim[1], value: convertTallyValue(sim[2]) });
      }
    }

    if (directItems.length > 0) {
      lists[listName] = directItems;
    } else {
      const nestedPattern = /<(\w+(?:\.\w+)*)\b[^>]*>([\s\S]*?)<\/\1>/g;
      let nm;
      const nestedItems = [];
      while ((nm = nestedPattern.exec(listContent)) !== null) {
        if (!nm[1].includes('.LIST') && !nm[1].includes('TALLYMESSAGE')) {
          const itemFields = {};
          const fp = /<(\w+)>([^<]*)<\/\1>/g;
          let fpm;
          while ((fpm = fp.exec(nm[2])) !== null) {
            itemFields[fpm[1]] = convertTallyValue(fpm[2]);
          }
          if (Object.keys(itemFields).length > 0) {
            nestedItems.push(itemFields);
          }
        }
      }
      if (nestedItems.length > 0) {
        lists[listName] = nestedItems;
      }
    }
  }

  return Object.keys(lists).length > 0 ? lists : null;
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}>([^<]*)</${tagName}>`));
  return match ? match[1].trim() : null;
}

function convertTallyValue(value) {
  if (value === 'Yes') return true;
  if (value === 'No') return false;

  const num = parseFloat(value);
  if (!isNaN(num) && value.trim() !== '' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return num;
  }

  return value;
}

module.exports = { parseTallyXml, extractEnvelope, extractTallyMessages, parseTallyMessage, extractFields, extractListElements, convertTallyValue };

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node parse-tally-xml.js <filepath>');
    process.exit(1);
  }
  const result = parseTallyXml(filePath);
  console.log(JSON.stringify(result, null, 2));
}
