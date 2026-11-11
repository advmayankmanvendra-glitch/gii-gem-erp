const fs = require('fs');
const path = require('path');

const { scanTallyExports } = require('./scan-tally-exports.cjs');
const { parseTallyXml } = require('./parse-tally-xml.cjs');
const { mapTallyToGii, mapAllEntities } = require('./map-tally-to-gii.cjs');
const { validateTallyMapping } = require('./validate-tally-mapping.cjs');

const TALLY_PRIME_PATH = 'C:\\Program Files\\TallyPrime';
const REPORTS_DIR = path.join(__dirname, '..', '..', 'reports');

function generateTallyKnowledgeReport() {
  console.log('[Tally Intelligence Layer] Starting report generation...');
  console.log(`[Tally Intelligence Layer] Scanning: ${TALLY_PRIME_PATH}`);

  const scanResult = scanTallyExports(TALLY_PRIME_PATH);

  if (!scanResult.success) {
    console.error(`[Tally Intelligence Layer] Scan failed: ${scanResult.error}`);
    return { success: false, error: scanResult.error };
  }

  console.log(`[Tally Intelligence Layer] Found ${scanResult.summary.totalFiles} XML file(s)`);

  const allParsedEntities = [];
  const fileParseResults = [];
  let totalEntityCount = 0;
  const companyNames = new Set();

  for (const fileInfo of scanResult.files) {
    console.log(`[Tally Intelligence Layer] Parsing: ${fileInfo.fileName}`);

    const parseResult = parseTallyXml(fileInfo.filePath);

    if (!parseResult.success) {
      console.warn(`[Tally Intelligence Layer] Warning: Could not parse ${fileInfo.fileName}: ${parseResult.errors.join(', ')}`);
      fileParseResults.push({
        fileName: fileInfo.fileName,
        success: false,
        errors: parseResult.errors,
        warnings: parseResult.warnings
      });
      continue;
    }

    if (parseResult.envelope && parseResult.envelope.companyName) {
      companyNames.add(parseResult.envelope.companyName);
    }

    const mappedEntities = mapAllEntities(parseResult.entities);
    const validationResult = validateTallyMapping(parseResult);

    allParsedEntities.push(...parseResult.entities);
    totalEntityCount += parseResult.entities.length;

    fileParseResults.push({
      fileName: fileInfo.fileName,
      success: true,
      entityTypes: parseResult.entityType,
      entityCount: parseResult.entities.length,
      envelope: parseResult.envelope,
      mappedCount: mappedEntities.filter(m => m.success).length,
      unmappedCount: mappedEntities.filter(m => !m.success).length,
      validation: {
        warnings: validationResult.warnings.length,
        errors: validationResult.errors.length,
        isValid: validationResult.summary.isValid
      },
      mappedEntities: mappedEntities,
      validationResult: validationResult
    });

    console.log(`[Tally Intelligence Layer]   -> ${parseResult.entities.length} entities, ${mappedEntities.filter(m => m.success).length} mapped`);
  }

  console.log(`[Tally Intelligence Layer] Total entities found: ${totalEntityCount}`);
  console.log(`[Tally Intelligence Layer] Generating reports...`);

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const auditReport = buildAuditReport(scanResult, fileParseResults, companyNames, totalEntityCount);
  const mappingReport = buildMappingReport(fileParseResults);
  const readinessReport = buildReadinessReport(fileParseResults, totalEntityCount);

  const auditPath = path.join(REPORTS_DIR, 'tally-intelligence-layer-audit-report.md');
  const mappingPath = path.join(REPORTS_DIR, 'tally-to-gii-erp-mapping-report.md');
  const readinessPath = path.join(REPORTS_DIR, 'tally-migration-readiness-report.md');

  fs.writeFileSync(auditPath, auditReport, 'utf-8');
  fs.writeFileSync(mappingPath, mappingReport, 'utf-8');
  fs.writeFileSync(readinessPath, readinessReport, 'utf-8');

  console.log(`[Tally Intelligence Layer] Reports generated:`);
  console.log(`  - ${auditPath}`);
  console.log(`  - ${mappingPath}`);
  console.log(`  - ${readinessPath}`);

  return {
    success: true,
    scanResult: scanResult,
    filesProcessed: fileParseResults.length,
    totalEntities: totalEntityCount,
    companyNames: Array.from(companyNames),
    reports: {
      audit: auditPath,
      mapping: mappingPath,
      readiness: readinessPath
    }
  };
}

function buildAuditReport(scanResult, fileParseResults, companyNames, totalEntityCount) {
  const now = new Date().toISOString();
  const lines = [];

  lines.push('# Tally Intelligence Layer Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push(`**TallyPrime Path:** ${scanResult.tallyPath}`);
  lines.push(`**Total XML Files Found:** ${scanResult.summary.totalFiles}`);
  lines.push(`**Total Size:** ${formatBytes(scanResult.summary.totalSizeBytes)}`);
  lines.push(`**Companies Found:** ${companyNames.size > 0 ? Array.from(companyNames).join(', ') : 'None'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## File Scan Summary');
  lines.push('');
  lines.push('| File | Size | Entity Types | Entities Found | Status |');
  lines.push('|------|------|-------------|----------------|--------|');

  for (const fileResult of scanResult.files) {
    const parseResult = fileParseResults.find(p => p.fileName === fileResult.fileName);
    const entityTypes = parseResult ? (Array.isArray(parseResult.entityTypes) ? parseResult.entityTypes.join(', ') : parseResult.entityTypes || 'N/A') : 'N/A';
    const entityCount = parseResult ? parseResult.entityCount : 0;
    const status = fileResult.error ? 'ERROR' : (parseResult && parseResult.success ? 'OK' : 'PARTIAL');
    lines.push(`| ${fileResult.fileName} | ${formatBytes(fileResult.sizeBytes)} | ${entityTypes} | ${entityCount} | ${status} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Entity Type Discovery');
  lines.push('');
  lines.push(`**Entity types found across all files:** ${scanResult.summary.entityTypesFound.join(', ') || 'None'}`);
  lines.push('');

  const entityTypeTotals = {};
  for (const pr of fileParseResults) {
    if (pr.success && pr.mappedEntities) {
      for (const me of pr.mappedEntities) {
        const et = me.entityType || 'UNKNOWN';
        entityTypeTotals[et] = (entityTypeTotals[et] || 0) + 1;
      }
    }
  }

  lines.push('| Entity Type | Count | Mapped | Unmapped |');
  lines.push('|-------------|-------|--------|----------|');
  for (const [et, count] of Object.entries(entityTypeTotals).sort()) {
    const mapped = fileParseResults.reduce((acc, pr) => {
      if (pr.mappedEntities) {
        return acc + pr.mappedEntities.filter(m => m.entityType === et && m.success).length;
      }
      return acc;
    }, 0);
    const unmapped = count - mapped;
    lines.push(`| ${et} | ${count} | ${mapped} | ${unmapped} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Validation Results');
  lines.push('');
  lines.push('| File | Warnings | Errors | Valid |');
  lines.push('|------|----------|--------|-------|');

  for (const pr of fileParseResults) {
    if (pr.validation) {
      const validMark = pr.validation.isValid ? 'Yes' : 'No';
      lines.push(`| ${pr.fileName} | ${pr.validation.warnings} | ${pr.validation.errors} | ${validMark} |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Issues');
  lines.push('');

  for (const pr of fileParseResults) {
    if (!pr.validationResult) continue;
    const vr = pr.validationResult;
    const hasIssues = vr.warnings.length > 0 || vr.errors.length > 0;
    if (!hasIssues) continue;

    lines.push(`### ${pr.fileName}`);
    lines.push('');

    if (vr.errors.length > 0) {
      lines.push('#### Errors');
      for (const err of vr.errors) {
        lines.push(`- **[${err.type}]** ${err.message}`);
      }
      lines.push('');
    }

    if (vr.warnings.length > 0) {
      lines.push('#### Warnings');
      for (const warn of vr.warnings) {
        lines.push(`- **[${warn.type}]** ${warn.message}`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total files scanned:** ${scanResult.summary.totalFiles}`);
  lines.push(`- **Total entities parsed:** ${totalEntityCount}`);
  lines.push(`- **Companies identified:** ${companyNames.size > 0 ? Array.from(companyNames).join(', ') : 'None'}`);
  lines.push(`- **Entity types detected:** ${scanResult.summary.entityTypesFound.join(', ') || 'None'}`);
  lines.push('');

  const totalErrors = fileParseResults.reduce((acc, pr) => acc + (pr.validation ? pr.validation.errors : 0), 0);
  const totalWarnings = fileParseResults.reduce((acc, pr) => acc + (pr.validation ? pr.validation.warnings : 0), 0);
  lines.push(`- **Total validation errors:** ${totalErrors}`);
  lines.push(`- **Total validation warnings:** ${totalWarnings}`);
  lines.push(`- **Overall health:** ${totalErrors === 0 ? 'GOOD' : 'ISSUES FOUND'}`);

  return lines.join('\n');
}

function buildMappingReport(fileParseResults) {
  const now = new Date().toISOString();
  const lines = [];

  lines.push('# Tally to GII GeM ERP Mapping Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const allMappedEntities = [];
  for (const pr of fileParseResults) {
    if (pr.mappedEntities) {
      allMappedEntities.push(...pr.mappedEntities);
    }
  }

  if (allMappedEntities.length === 0) {
    lines.push('## No entities found to map.');
    return lines.join('\n');
  }

  const byType = {};
  for (const me of allMappedEntities) {
    if (!byType[me.entityType]) byType[me.entityType] = [];
    byType[me.entityType].push(me);
  }

  for (const [entityType, entities] of Object.entries(byType).sort()) {
    lines.push(`## ${entityType} (${entities.length} instances)`);
    lines.push('');

    const successful = entities.filter(e => e.success);
    const failed = entities.filter(e => !e.success);

    if (successful.length > 0) {
      lines.push('### Mapping Details');
      lines.push('');
      const sample = successful[0];
      lines.push(`- **GII ERP Module:** ${sample.giiModule || 'Unknown'}`);
      lines.push(`- **Risk Priority:** ${sample.risk || 'Unknown'}`);
      lines.push(`- **Matched Fields:** ${sample.matchedFields.length}`);
      lines.push(`- **Unmatched Fields:** ${sample.unmatchedFields.length}`);
      lines.push(`- **Risky Fields:** ${sample.riskyFields.length}`);
      lines.push(`- **Missing Required Fields:** ${(sample.missingRequiredFields || []).length}`);

      if (sample.reservedGroupType) {
        lines.push(`- **GII Account Type:** ${sample.reservedGroupType}`);
      }
      if (sample.giiVoucherType) {
        lines.push(`- **GII Voucher Type:** ${sample.giiVoucherType}`);
      }
      lines.push('');

      if (sample.matchedFields.length > 0) {
        lines.push('| Tally Field | GII ERP Field | Target Table | Type | Required |');
        lines.push('|-------------|---------------|--------------|------|----------|');
        for (const mf of sample.matchedFields) {
          lines.push(`| ${mf.tallyField} | ${mf.giiField} | ${mf.target} | ${mf.type} | ${mf.required ? 'Yes' : 'No'} |`);
        }
        lines.push('');
      }

      if (sample.unmatchedFields.length > 0) {
        lines.push('#### Unmatched Fields');
        lines.push('');
        for (const uf of sample.unmatchedFields) {
          lines.push(`- \`${uf.tallyField}\` = \`${uf.value}\` — ${uf.reason}`);
        }
        lines.push('');
      }

      if (failed.length > 0) {
        lines.push('#### Failed Mappings');
        for (const f of failed) {
          lines.push(`- \`${f.entityName || 'unnamed'}\`: ${f.error}`);
        }
        lines.push('');
      }
    } else {
      lines.push('No successful mappings for this entity type.');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('## Overall Mapping Statistics');
  lines.push('');
  const total = allMappedEntities.length;
  const mapped = allMappedEntities.filter(e => e.success).length;
  const unmapped = total - mapped;
  const totalMatched = allMappedEntities.reduce((acc, e) => acc + (e.matchedFields ? e.matchedFields.length : 0), 0);
  const totalUnmatched = allMappedEntities.reduce((acc, e) => acc + (e.unmatchedFields ? e.unmatchedFields.length : 0), 0);
  const totalRisky = allMappedEntities.reduce((acc, e) => acc + (e.riskyFields ? e.riskyFields.length : 0), 0);

  lines.push(`- **Total entities:** ${total}`);
  lines.push(`- **Successfully mapped:** ${mapped} (${((mapped / total) * 100).toFixed(1)}%)`);
  lines.push(`- **Unmapped entities:** ${unmapped}`);
  lines.push(`- **Total matched fields:** ${totalMatched}`);
  lines.push(`- **Total unmatched fields:** ${totalUnmatched}`);
  lines.push(`- **Total risky fields (P0/P1):** ${totalRisky}`);

  return lines.join('\n');
}

function buildReadinessReport(fileParseResults, totalEntityCount) {
  const now = new Date().toISOString();
  const lines = [];

  lines.push('# Tally Migration Readiness Report');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  const allMapped = [];
  for (const pr of fileParseResults) {
    if (pr.mappedEntities) {
      allMapped.push(...pr.mappedEntities);
    }
  }

  const totalMapped = allMapped.filter(e => e.success).length;
  const totalUnmapped = allMapped.filter(e => !e.success).length;
  const totalWarnings = fileParseResults.reduce((acc, pr) => acc + (pr.validation ? pr.validation.warnings : 0), 0);
  const totalErrors = fileParseResults.reduce((acc, pr) => acc + (pr.validation ? pr.validation.errors : 0), 0);

  const mappedPct = totalEntityCount > 0 ? ((totalMapped / totalEntityCount) * 100).toFixed(1) : '0.0';
  const errorFree = totalErrors === 0;

  lines.push('## Migration Readiness Assessment');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push('|--------|-------|');
  lines.push(`| Total entities found | ${totalEntityCount} |`);
  lines.push(`| Successfully mapped | ${totalMapped} (${mappedPct}%) |`);
  lines.push(`| Unmapped entities | ${totalUnmapped} |`);
  lines.push(`| Validation errors | ${totalErrors} |`);
  lines.push(`| Validation warnings | ${totalWarnings} |`);
  lines.push(`| Error-free | ${errorFree ? 'Yes' : 'No'} |`);

  let readiness = 'NOT READY';
  if (errorFree && totalUnmapped === 0 && totalWarnings === 0) {
    readiness = 'READY';
  } else if (errorFree && parseFloat(mappedPct) >= 90) {
    readiness = 'NEARLY READY';
  } else if (errorFree) {
    readiness = 'NEEDS REVIEW';
  }

  lines.push(`| **Readiness** | **${readiness}** |`);
  lines.push('');

  lines.push('---');
  lines.push('');

  if (totalErrors > 0) {
    lines.push('## Blocking Issues');
    lines.push('');
    for (const pr of fileParseResults) {
      if (pr.validationResult) {
        for (const err of pr.validationResult.errors) {
          lines.push(`- **[${pr.fileName}]** ${err.message}`);
        }
      }
    }
    lines.push('');
  }

  if (totalWarnings > 0) {
    lines.push('## Warnings (Review Recommended)');
    lines.push('');
    const warnByType = {};
    for (const pr of fileParseResults) {
      if (pr.validationResult) {
        for (const warn of pr.validationResult.warnings) {
          if (!warnByType[warn.type]) warnByType[warn.type] = [];
          warnByType[warn.type].push(warn);
        }
      }
    }
    for (const [type, warns] of Object.entries(warnByType)) {
      lines.push(`### ${type} (${warns.length})`);
      for (const w of warns) {
        lines.push(`- ${w.message}`);
      }
      lines.push('');
    }
  }

  lines.push('## Dependency Order for Migration');
  lines.push('');
  lines.push('1. **Groups** → Account Groups (Chart of Accounts)');
  lines.push('2. **Ledgers** → General Ledger');
  lines.push('3. **Stock Groups** → Item Groups');
  lines.push('4. **Stock Categories** → Item Categories');
  lines.push('5. **Units** → Unit of Measure');
  lines.push('6. **Stock Items** → Item Master');
  lines.push('7. **Voucher Types** → Document Types');
  lines.push('8. **Vouchers** → Transactions');
  lines.push('');

  const gstinFound = fileParseResults.some(pr => {
    if (pr.envelope && pr.envelope.companyName) return true;
    return false;
  });

  lines.push('## GST Readiness');
  lines.push('');
  lines.push(`| Requirement | Status |`);
  lines.push('|-------------|--------|');
  lines.push(`| Company GSTIN available | ${gstinFound ? 'Check export files' : 'Not found in scan'} |`);
  lines.push(`| HSN/SAC codes extracted | Check individual entities |`);
  lines.push(`| UQC mapping available | Check UNIT entities |`);
  lines.push('');

  lines.push('## Recommendations');
  lines.push('');

  if (totalErrors > 0) {
    lines.push('- **Fix validation errors before migration**');
  }
  if (totalWarnings > 0) {
    lines.push('- **Review all warnings** — some may indicate data quality issues');
  }
  if (totalUnmapped > 0) {
    lines.push('- **Investigate unmapped entities** — they may require custom mapping extensions');
  }
  if (parseFloat(mappedPct) < 100) {
    lines.push('- **Complete field-level mapping** for all known entity types');
  }
  lines.push('- **Verify parent-child references** before loading data');
  lines.push('- **Run trial balance comparison** after initial migration');
  lines.push('- **Validate inventory valuation** matches Tally closing data');

  return lines.join('\n');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + units[i];
}

if (require.main === module) {
  const result = generateTallyKnowledgeReport();
  if (result.success) {
    console.log(`\n[Tally Intelligence Layer] Report generation completed successfully.`);
    process.exit(0);
  } else {
    console.error(`\n[Tally Intelligence Layer] Report generation failed: ${result.error}`);
    process.exit(1);
  }
}

module.exports = { generateTallyKnowledgeReport };
