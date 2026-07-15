import featureFunctionGraph from "../../../knowledge/feature-function-graph.json" with { type: "json" };

let _graph = null;

function loadGraph() {
  if (_graph) return _graph;
  if (!featureFunctionGraph) return null;
  _graph = featureFunctionGraph;
  return _graph;
}

const FEATURE_WEIGHT = 10;
const ALIAS_WEIGHT = 8;
const COMMON_USER_NAME_WEIGHT = 8;
const NATURAL_QUESTION_WEIGHT = 7;
const COMMON_QUESTION_WEIGHT = 5;
const CATEGORY_WORD_WEIGHT = 3;

function findFeatureByQuery(query, category, currentView) {
  const graph = loadGraph();
  if (!graph || !graph.featureNodes) return null;

  const q = (query || "").toLowerCase().trim();
  if (!q) return null;

  const normalized = q.replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  const candidates = [];

  for (const feature of graph.featureNodes) {
    let score = 0;
    const reasons = [];

    const name = (feature.canonicalName || "").toLowerCase();
    const featName = (feature.featureName || "").toLowerCase();

    const queryWords = normalized.split(/\s+/);

    const nameWords = name.split(/\s+/);
    if (nameWords.length >= 2 && queryWords.length >= 2) {
      const matchCount = nameWords.filter((w) => queryWords.includes(w)).length;
      if (matchCount >= 2) {
        score += FEATURE_WEIGHT;
        reasons.push(`canonicalName matches`);
      }
    }

    if (featName !== name && featName.split(/\s+/).length >= 2 && queryWords.length >= 2) {
      const matchCount = featName.split(/\s+/).filter((w) => queryWords.includes(w)).length;
      if (matchCount >= 2) {
        score += FEATURE_WEIGHT;
        reasons.push(`featureName matches`);
      }
    }

    const allAliases = feature.aliases || [];
    for (const alias of allAliases) {
      const a = alias.toLowerCase();
      const aliasWords = a.split(/\s+/);
      if (aliasWords.length > 1) {
        const phraseMatch = normalized.includes(a);
        if (phraseMatch) {
          score += ALIAS_WEIGHT;
          reasons.push(`alias "${alias}" matches`);
          break;
        }
      } else {
        const wordMatch = queryWords.some((w) => w === a || a === w);
        if (wordMatch) {
          score += ALIAS_WEIGHT;
          reasons.push(`alias "${alias}" matches`);
          break;
        }
      }
    }

    const allUserNames = feature.commonUserNames || [];
    for (const uname of allUserNames) {
      const u = uname.toLowerCase();
      const nameWords = u.split(/\s+/);
      if (nameWords.length > 1) {
        if (normalized.includes(u)) {
          score += COMMON_USER_NAME_WEIGHT;
          reasons.push(`commonUserNames matches`);
          break;
        }
      } else {
        if (queryWords.some((w) => w === u || u === w)) {
          score += COMMON_USER_NAME_WEIGHT;
          reasons.push(`commonUserNames matches`);
          break;
        }
      }
    }

    if (graph.naturalQuestionMap && graph.naturalQuestionMap[feature.id]) {
      const questions = graph.naturalQuestionMap[feature.id].questions || [];
      for (const qEntry of questions) {
        const nq = (qEntry.question || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        const nqWords = nq.split(/\s+/);
        const matchRatio = nqWords.filter((w) => queryWords.includes(w)).length / nqWords.length;
        if (matchRatio >= 0.6) {
          score += NATURAL_QUESTION_WEIGHT;
          reasons.push(`naturalQuestionMap matches "${qEntry.question}"`);
          if (qEntry.isUnsafe) score -= 5;
          break;
        }
      }
    }

    const allCommonQuestions = feature.commonQuestions || [];
    for (const cq of allCommonQuestions) {
      const cqNorm = cq.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      const cqWords = cqNorm.split(/\s+/);
      const matchRatio = cqWords.filter((w) => queryWords.includes(w)).length / cqWords.length;
      if (matchRatio >= 0.6) {
        score += COMMON_QUESTION_WEIGHT;
        reasons.push(`commonQuestions matches`);
        break;
      }
    }

    const purpose = (feature.whatThisFeatureDoes || "").toLowerCase();
    const purposeWords = purpose.split(/\s+/);
    const meaningfulQueryWords = queryWords.filter((w) => w.length >= 4 && !["what", "where", "when", "which", "there", "this", "that", "does", "with", "from", "have", "been", "after", "before", "many", "type", "types", "does", "how", "why", "can", "for", "the", "and", "not"].includes(w));
    for (const word of meaningfulQueryWords) {
      if (purposeWords.includes(word)) {
        score += CATEGORY_WORD_WEIGHT;
        reasons.push(`purpose keyword "${word}" matches`);
      }
    }

    if (score > 0) {
      candidates.push({
        featureId: feature.id,
        featureName: feature.canonicalName || feature.featureName,
        score,
        reasons,
        node: feature
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const topScore = candidates[0].score;
  const top = candidates.filter((c) => c.score >= topScore * 0.8);

  const best = top[0];
  let matchLevel = "none";
  if (best.score >= FEATURE_WEIGHT) {
    matchLevel = "strong";
  } else if (best.score >= ALIAS_WEIGHT) {
    matchLevel = "medium";
  } else if (best.score >= COMMON_QUESTION_WEIGHT) {
    matchLevel = "weak";
  }

  const featureNode = best.node;

  let safetyBoundary = featureNode.safetyBoundary || "read-only guidance";
  if (graph.safetyBoundaryMap && graph.safetyBoundaryMap[best.featureId]) {
    safetyBoundary = graph.safetyBoundaryMap[best.featureId];
  }

  const featureGaps = featureNode.knownGaps || [];
  const globalGaps = (graph.knownGaps || []).filter((g) =>
    (g.affectedFeatureIds || []).includes(best.featureId)
  );

  return {
    featureId: best.featureId,
    featureName: best.featureName,
    matchLevel,
    matchScore: best.score,
    matchReason: best.reasons.slice(0, 3).join("; "),
    canonicalName: featureNode.canonicalName,
    aliases: featureNode.aliases || [],
    category: featureNode.category,
    screenRef: featureNode.screenRef,
    viewKey: featureNode.viewKey,
    workflowStage: featureNode.workflowStage,
    databaseTables: featureNode.databaseTables || [],
    voucherTypes: featureNode.voucherTypes || [],
    postingFunctions: featureNode.postingFunctions || [],
    reportDependencies: featureNode.reportDependencies || [],
    manualSections: featureNode.manualSections || [],
    safetyBoundary,
    createsAccountingImpact: featureNode.createsAccountingImpact,
    createsInventoryImpact: featureNode.createsInventoryImpact,
    createsGSTImpact: featureNode.createsGSTImpact,
    canUserCreateRecordsHere: featureNode.canUserCreateRecordsHere,
    canUserPostHere: featureNode.canUserPostHere,
    whatThisFeatureDoes: featureNode.whatThisFeatureDoes,
    whatThisFeatureDoesNotDo: featureNode.whatThisFeatureDoesNotDo,
    expectedAnswerType: featureNode.expectedAnswerType,
    preferredSourceGraph: featureNode.preferredSourceGraph,
    fallbackSourceGraph: featureNode.fallbackSourceGraph,
    sourceReferences: featureNode.sourceReferences || [],
    knownGaps: [...new Set([...featureGaps, ...globalGaps.map((g) => g.description)])],
    commonQuestions: featureNode.commonQuestions || [],
    naturalQuestions: graph.naturalQuestionMap && graph.naturalQuestionMap[best.featureId]
      ? graph.naturalQuestionMap[best.featureId].questions || []
      : []
  };
}

function getFeatureById(featureId) {
  const graph = loadGraph();
  if (!graph || !graph.featureNodes) return null;
  return graph.featureNodes.find((f) => f.id === featureId) || null;
}

function getAllFeatures() {
  const graph = loadGraph();
  if (!graph || !graph.featureNodes) return [];
  return graph.featureNodes.map((f) => ({
    id: f.id,
    canonicalName: f.canonicalName || f.featureName,
    category: f.category,
    safetyBoundary: f.safetyBoundary
  }));
}

function getStats() {
  const graph = loadGraph();
  if (!graph) return null;
  return {
    graphId: graph.graphId,
    version: graph.version,
    featureCount: (graph.featureNodes || []).length,
    edgeCount: (graph.correlationEdges || []).length,
    aliasCount: graph.aliasMap ? Object.keys(graph.aliasMap).length : 0,
    naturalQuestionCount: graph.naturalQuestionMap ? Object.keys(graph.naturalQuestionMap).length : 0,
    gapCount: (graph.knownGaps || []).length
  };
}

export { findFeatureByQuery, getFeatureById, getAllFeatures, getStats, loadGraph };
