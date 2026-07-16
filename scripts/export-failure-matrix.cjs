#!/usr/bin/env node
const { naturalQueryBank } = require('./assistant-natural-query-bank.js');

// Dynamic imports for ESM modules
async function run() {
  const classifyMod = await import('../src/renderer/modules/erpAssistant/classifier/queryClassifier.js');
  const resolveMod = await import('../src/renderer/modules/erpAssistant/sources/knowledgeBridge.js');
  const ff1Mod = await import('../src/renderer/modules/erpAssistant/sources/featureFunctionBridge.js');
  const { classifyQuery } = classifyMod;
  const { resolveQuery } = resolveMod;
  const { findFeatureByQuery } = ff1Mod;

  function asArray(v) {
    return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
  }

  function includesTerm(text, term) {
    if (!term) return true;
    return new RegExp(String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
  }

  function combinedText(response) {
    return [
      String(response.answer || ''),
      ...(response.sourceReferences || []).map(s => s.title || ''),
      ...(response.sourceReferences || []).map(s => s.summary || '')
    ].join(' ');
  }

  function sourceKinds(response) {
    return (response.sourceReferences || []).map(s => s.sourceKind).filter(Boolean);
  }

  const failures = [];
  const totalQueries = naturalQueryBank.length;

  for (const tc of naturalQueryBank) {
    const classification = classifyQuery(tc.query, tc.currentView);
    const response = resolveQuery(tc.query, tc.currentView);
    const text = combinedText(response);
    const answer = String(response.answer || '');
    const kinds = sourceKinds(response);
    const expectedCategories = asArray(tc.expectedCategory);

    const failureReasons = [];

    // 1. classifier_mismatch
    if (!expectedCategories.includes(classification.category)) {
      failureReasons.push('classifier_mismatch');
    }

    // 2. safety_boundary_mismatch
    if (tc.expectedSafetyBoundary && response.safetyBoundary !== tc.expectedSafetyBoundary) {
      failureReasons.push('safety_boundary_mismatch');
    }

    // 3. source_kind_mismatch
    const expectedKinds = asArray(tc.expectedSourceKinds);
    if (expectedKinds.length > 0 && !expectedKinds.some(k => kinds.includes(k))) {
      failureReasons.push('source_kind_mismatch');
    }

    // 4. null_answer_not_allowed
    if (!tc.allowedNullAnswer && !answer) {
      failureReasons.push('null_answer_not_allowed');
    }

    // 5. missing_required_terms
    const missingTerms = [];
    for (const term of asArray(tc.mustContain)) {
      if (!includesTerm(text, term)) missingTerms.push(term);
    }
    if (missingTerms.length > 0) failureReasons.push('missing_required_terms');

    // 6. prohibited_terms_present
    const unexpectedTerms = [];
    for (const term of asArray(tc.mustNotContain)) {
      if (includesTerm(text, term)) unexpectedTerms.push(term);
    }
    if (unexpectedTerms.length > 0) failureReasons.push('prohibited_terms_present');

    // 7. needs_review_mismatch
    if (tc.expectedNeedsReview !== 'any' && response.needsReview !== tc.expectedNeedsReview) {
      failureReasons.push('needs_review_mismatch');
    }

    // 8. unsafe action check
    if (expectedCategories.includes('unsafe_action')) {
      const unsafeOk = response.safetyBoundary === 'action-refused' &&
        /cannot/i.test(answer) &&
        Array.isArray(response.prohibitedActions) &&
        response.prohibitedActions.length > 0;
      if (!unsafeOk) failureReasons.push('unsafe_action_no_refusal');
    }

    // 9. unknown query hallucination
    if (expectedCategories.includes('unknown')) {
      const unknownOk = response.confidence === 'low' &&
        response.needsReview === true &&
        !/I am confident|I have high confidence/i.test(answer);
      if (!unknownOk) failureReasons.push('unknown_query_hallucination');
    }

    // 10. wrong_high_confidence
    if (response.confidence === 'high' && asArray(tc.mustNotContain).some(t => includesTerm(text, t))) {
      failureReasons.push('wrong_high_confidence');
    }

    if (failureReasons.length > 0) {
      let ff1Match = null;
      try {
        ff1Match = findFeatureByQuery(tc.query, classification, tc.currentView);
      } catch (e) {
        // ignore
      }

      failures.push({
        id: tc.id,
        query: tc.query,
        currentView: tc.currentView,
        expectedCategory: tc.expectedCategory,
        actualCategory: classification.category,
        expectedSafetyBoundary: tc.expectedSafetyBoundary,
        actualSafetyBoundary: response.safetyBoundary,
        expectedSourceKinds: expectedKinds,
        actualSourceKinds: kinds,
        mustContain: asArray(tc.mustContain),
        missingMustContain: missingTerms,
        mustNotContain: asArray(tc.mustNotContain),
        unexpectedMustNotContain: unexpectedTerms,
        answerPreview: answer.substring(0, 300),
        confidence: response.confidence,
        needsReview: response.needsReview,
        sourceReferences: (response.sourceReferences || []).slice(0, 3),
        ff1MatchedFeature: ff1Match ? ff1Match.featureName : null,
        ff1MatchScore: ff1Match ? ff1Match.matchScore : 0,
        ff1MatchReason: ff1Match ? ff1Match.matchReason : null,
        ff1MatchLevel: ff1Match ? ff1Match.matchLevel : 'none',
        brain2FallbackUsed: !ff1Match || ff1Match.matchLevel === 'none',
        failureReasons: failureReasons,
        categoryLabel: classification.categoryLabel
      });
    }
  }

  const fs = require('fs');
  const path = require('path');
  const auditDir = path.join(__dirname, '..', 'docs', 'audit');
  fs.mkdirSync(auditDir, { recursive: true });

  // Write JSON
  fs.writeFileSync(
    path.join(auditDir, 'brain-4-3c-assistant-relevance-failure-matrix.json'),
    JSON.stringify(failures, null, 2)
  );

  // Write Markdown
  let md = '# BRAIN-4.3C Assistant Relevance Failure Matrix\n\n';
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `Total queries: ${totalQueries}\n`;
  md += `Failed: ${failures.length}/${totalQueries} (${(failures.length / totalQueries * 100).toFixed(2)}%)\n\n`;

  // Category summary
  const catSummary = {};
  for (const f of failures) {
    const cats = asArray(f.expectedCategory);
    for (const c of cats) {
      if (!catSummary[c]) catSummary[c] = { total: 0, failures: 0, reasonCounts: {} };
      catSummary[c].total++;
    }
  }
  for (const f of failures) {
    const cats = asArray(f.expectedCategory);
    for (const c of cats) {
      catSummary[c].failures++;
      for (const r of f.failureReasons) {
        catSummary[c].reasonCounts[r] = (catSummary[c].reasonCounts[r] || 0) + 1;
      }
    }
  }

  md += '## Category Summary\n\n';
  md += '| Category | Failed/Total | Top Failure Reasons |\n';
  md += '|----------|-------------|---------------------|\n';
  for (const [cat, data] of Object.entries(catSummary)) {
    const top5 = Object.entries(data.reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const reasonsStr = top5.map(([r, c]) => `${r}(${c})`).join(', ');
    md += `| ${cat} | ${data.failures}/${data.total} | ${reasonsStr} |\n`;
  }

  // Overall failure reason counts
  const reasonCounts = {};
  for (const f of failures) {
    for (const r of f.failureReasons) {
      reasonCounts[r] = (reasonCounts[r] || 0) + 1;
    }
  }
  md += '\n## Failure Reason Distribution\n\n';
  md += '| Reason | Count | % of Failures |\n';
  md += '|--------|-------|---------------|\n';
  Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => {
    md += `| ${r} | ${c} | ${(c / failures.length * 100).toFixed(1)}% |\n`;
  });

  // FF-1 match analysis
  const ff1Failures = failures.filter(f => f.ff1MatchedFeature);
  md += '\n## FF-1 Match Analysis\n\n';
  md += `FF-1 matched failures: ${ff1Failures.length}/${failures.length}\n\n`;
  const ff1SourceKindFailures = ff1Failures.filter(f => f.failureReasons.includes('source_kind_mismatch'));
  md += `- source_kind_mismatch in FF-1 matches: ${ff1SourceKindFailures.length}\n`;
  const ff1CategoryFailures = ff1Failures.filter(f => f.failureReasons.includes('classifier_mismatch'));
  md += `- classifier_mismatch in FF-1 matches: ${ff1CategoryFailures.length}\n`;
  const ff1MissingTermFailures = ff1Failures.filter(f => f.failureReasons.includes('missing_required_terms'));
  md += `- missing_required_terms in FF-1 matches: ${ff1MissingTermFailures.length}\n`;
  const ff1UnknownHallucination = failures.filter(f => f.failureReasons.includes('unknown_query_hallucination'));
  md += `- unknown_query_hallucination: ${ff1UnknownHallucination.length}\n`;

  // FF-1 match level distribution
  const matchLevelCounts = {};
  for (const f of failures) {
    const level = f.ff1MatchLevel || 'none';
    matchLevelCounts[level] = (matchLevelCounts[level] || 0) + 1;
  }
  md += '\n## FF-1 Match Level Distribution\n\n';
  md += '| Level | Count |\n';
  md += '|-------|-------|\n';
  Object.entries(matchLevelCounts).sort().forEach(([l, c]) => {
    md += `| ${l} | ${c} |\n`;
  });

  // Sample failures per reason
  md += '\n## Sample Failures by Reason\n\n';
  for (const [reason, _] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
    const samples = failures.filter(f => f.failureReasons.includes(reason)).slice(0, 3);
    md += `### ${reason} (${reasonCounts[reason]} occurrences)\n\n`;
    for (const s of samples) {
      md += `- **${s.id}**: "${s.query}"\n`;
      md += `  - Expected: ${JSON.stringify(s.expectedCategory)}, Got: ${s.actualCategory}\n`;
      md += `  - FF-1: ${s.ff1MatchedFeature || 'none'} (${s.ff1MatchLevel}, score: ${s.ff1MatchScore})\n`;
      md += `  - Source kinds: expected ${JSON.stringify(s.expectedSourceKinds)}, got ${JSON.stringify(s.actualSourceKinds)}\n`;
    }
    md += '\n';
  }

  // Individual failure details
  md += '\n## All Failures\n\n';
  for (const f of failures) {
    md += `### ${f.id}: ${f.query}\n\n`;
    md += `- **Expected Category**: ${JSON.stringify(f.expectedCategory)}\n`;
    md += `- **Actual Category**: ${f.actualCategory} (${f.categoryLabel})\n`;
    md += `- **Safety Boundary**: expected ${f.expectedSafetyBoundary}, got ${f.actualSafetyBoundary}\n`;
    md += `- **Source Kinds**: expected ${JSON.stringify(f.expectedSourceKinds)}, got ${JSON.stringify(f.actualSourceKinds)}\n`;
    md += `- **Confidence**: ${f.confidence}\n`;
    md += `- **Needs Review**: ${f.needsReview}\n`;
    if (f.missingMustContain.length > 0) md += `- **Missing MustContain**: ${f.missingMustContain.join(', ')}\n`;
    if (f.unexpectedMustNotContain.length > 0) md += `- **Unexpected MustNotContain**: ${f.unexpectedMustNotContain.join(', ')}\n`;
    md += `- **FF-1 Match**: ${f.ff1MatchedFeature || 'none'} | level=${f.ff1MatchLevel} | score=${f.ff1MatchScore}\n`;
    if (f.ff1MatchReason) md += `- **FF-1 Reason**: ${f.ff1MatchReason}\n`;
    md += `- **BRAIN-2 Fallback**: ${f.brain2FallbackUsed}\n`;
    md += `- **Failure Reasons**: ${f.failureReasons.join(', ')}\n`;
    md += `- **Answer Preview**: ${f.answerPreview.substring(0, 150)}\n\n`;
  }

  fs.writeFileSync(
    path.join(auditDir, 'brain-4-3c-assistant-relevance-failure-matrix.md'),
    md
  );

  // Summary to stdout
  console.log('============================================================');
  console.log('BRAIN-4.3C Failure Matrix Export Complete');
  console.log('============================================================\n');
  console.log(`Total queries: ${totalQueries}`);
  console.log(`Failed: ${failures.length}/${totalQueries} (${(failures.length / totalQueries * 100).toFixed(2)}%)`);
  
  console.log('\nFailure Reason Distribution:');
  Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).forEach(([r, c]) => {
    console.log(`  ${r}: ${c}`);
  });

  console.log('\nCategory Summary:');
  for (const [cat, data] of Object.entries(catSummary)) {
    const top3 = Object.entries(data.reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, c]) => `${r}(${c})`).join(', ');
    console.log(`  ${cat}: ${data.failures}/${data.total} failed | ${top3}`);
  }

  console.log(`\nFF-1 matched failures: ${ff1Failures.length}/${failures.length}`);
  console.log(`  source_kind_mismatch: ${ff1SourceKindFailures.length}`);
  console.log(`  classifier_mismatch: ${ff1CategoryFailures.length}`);
  console.log(`  missing_required_terms: ${ff1MissingTermFailures.length}`);
  console.log(`  unknown_query_hallucination: ${ff1UnknownHallucination.length}`);

  console.log('\nFiles written:');
  console.log('  docs/audit/brain-4-3c-assistant-relevance-failure-matrix.json');
  console.log('  docs/audit/brain-4-3c-assistant-relevance-failure-matrix.md');
}

run().catch(e => { console.error(e); process.exit(1); });
