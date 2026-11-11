const fs = require('fs');
const path = require('path');

const TALLY_PRIME_PATH = 'C:\\Program Files\\TallyPrime';
const SCAN_BYTES = 2000;

const ENTITY_TYPE_PATTERNS = [
  /<(\w+) NAME="[^"]*"/g,
  /<(\w+)\s+NAME=/g
];

function scanTallyExports(tallyPath) {
  tallyPath = tallyPath || TALLY_PRIME_PATH;

  if (!fs.existsSync(tallyPath)) {
    return {
      success: false,
      error: `TallyPrime directory not found: ${tallyPath}`,
      files: [],
      summary: {
        totalFiles: 0,
        totalSizeBytes: 0,
        entityTypesFound: [],
        companiesFound: []
      }
    };
  }

  let xmlFiles;
  try {
    xmlFiles = fs.readdirSync(tallyPath)
      .filter(f => f.toLowerCase().endsWith('.xml'))
      .map(f => path.join(tallyPath, f));
  } catch (err) {
    return {
      success: false,
      error: `Cannot read TallyPrime directory: ${err.message}`,
      files: [],
      summary: { totalFiles: 0, totalSizeBytes: 0, entityTypesFound: [], companiesFound: [] }
    };
  }

  if (xmlFiles.length === 0) {
    return {
      success: true,
      files: [],
      summary: { totalFiles: 0, totalSizeBytes: 0, entityTypesFound: [], companiesFound: [] }
    };
  }

  const fileResults = [];
  const allEntityTypes = new Set();
  const companiesFound = new Set();
  let totalSizeBytes = 0;

  for (const filePath of xmlFiles) {
    const result = scanSingleFile(filePath);
    fileResults.push(result);
    totalSizeBytes += result.sizeBytes || 0;
    if (result.entityTypes) {
      result.entityTypes.forEach(et => allEntityTypes.add(et));
    }
    if (result.companyName) {
      companiesFound.add(result.companyName);
    }
  }

  return {
    success: true,
    tallyPath: tallyPath,
    files: fileResults,
    summary: {
      totalFiles: xmlFiles.length,
      totalSizeBytes: totalSizeBytes,
      entityTypesFound: Array.from(allEntityTypes).sort(),
      companiesFound: Array.from(companiesFound).sort()
    }
  };
}

function scanSingleFile(filePath) {
  const result = {
    fileName: path.basename(filePath),
    filePath: filePath,
    sizeBytes: 0,
    entityTypes: [],
    companyName: null,
    error: null
  };

  try {
    const stats = fs.statSync(filePath);
    result.sizeBytes = stats.size;

    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(SCAN_BYTES);
    const bytesRead = fs.readSync(fd, buffer, 0, SCAN_BYTES, 0);
    fs.closeSync(fd);

    let content;
    try {
      content = buffer.slice(0, bytesRead).toString('ucs2');
    } catch (encErr) {
      content = buffer.slice(0, bytesRead).toString('utf16le');
    }

    result.entityTypes = detectEntityTypes(content);

    result.companyName = extractCompanyName(content);

  } catch (err) {
    result.error = err.message;
  }

  return result;
}

function detectEntityTypes(content) {
  const types = new Set();
  const namePattern = /<(\w+)\s+NAME="[^"]*"/g;
  let match;

  const excluded = ['ENVELOPE', 'HEADER', 'TALLYREQUEST', 'BODY', 'IMPORTDATA',
    'EXPORTDATA', 'REQUESTDESC', 'REPORTNAME', 'STATICVARIABLES', 'REQUESTDATA',
    'TALLYMESSAGE', 'DESC'];

  while ((match = namePattern.exec(content)) !== null) {
    const tag = match[1];
    if (!excluded.includes(tag) && !tag.endsWith('.LIST')) {
      types.add(tag);
    }
  }

  const vchPattern = /<(\w+)\s+VCHTYPE="[^"]*"/g;
  while ((match = vchPattern.exec(content)) !== null) {
    const tag = match[1];
    if (!excluded.includes(tag) && !tag.endsWith('.LIST')) {
      types.add(tag);
    }
  }

  return Array.from(types).sort();
}

function extractCompanyName(content) {
  const match = content.match(/<SVCURRENTCOMPANY>([^<]+)<\/SVCURRENTCOMPANY>/);
  return match ? match[1].trim() : null;
}

module.exports = { scanTallyExports, scanSingleFile, detectEntityTypes, extractCompanyName };

if (require.main === module) {
  const result = scanTallyExports();
  console.log(JSON.stringify(result, null, 2));
}
