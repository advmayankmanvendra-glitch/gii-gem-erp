const ROLE_DEPTH_MAP = {
  admin: "diagnostic",
  accountant: "detailed",
  operator: "basic",
  approver: "standard",
  auditor: "detailed",
  readonly: "basic"
};

const DEPTH_CONFIG = {
  diagnostic: {
    showSourcePaths: true,
    showGraphIds: true,
    showKnownGaps: true,
    showSafetyBoundary: true,
    showDiagnosticSummary: true,
    maxSourceRefs: 5
  },
  detailed: {
    showSourcePaths: false,
    showGraphIds: false,
    showKnownGaps: false,
    showSafetyBoundary: true,
    showDiagnosticSummary: false,
    maxSourceRefs: 3
  },
  standard: {
    showSourcePaths: false,
    showGraphIds: false,
    showKnownGaps: false,
    showSafetyBoundary: true,
    showDiagnosticSummary: false,
    maxSourceRefs: 2
  },
  basic: {
    showSourcePaths: false,
    showGraphIds: false,
    showKnownGaps: false,
    showSafetyBoundary: false,
    showDiagnosticSummary: false,
    maxSourceRefs: 1
  }
};

function getDepthForRole(role) {
  return ROLE_DEPTH_MAP[role] || "standard";
}

function renderForRole(response, role) {
  const depth = getDepthForRole(role);
  const config = DEPTH_CONFIG[depth] || DEPTH_CONFIG.standard;

  const trimmedRefs = (response.sourceReferences || []).slice(0, config.maxSourceRefs);

  const filteredRefs = config.showSourcePaths
    ? trimmedRefs
    : trimmedRefs.map((ref) => ({ title: ref.title, sourceKind: ref.sourceKind, graphId: null, sourcePath: null, summary: ref.summary }));

  return {
    ...response,
    sourceReferences: filteredRefs,
    knownGaps: config.showKnownGaps ? (response.knownGaps || []) : [],
    safetyBoundary: config.showSafetyBoundary ? (response.safetyBoundary || "read-only guidance") : null,
    rolePresentation: {
      depth,
      showSources: config.maxSourceRefs > 0,
      showSafety: config.showSafetyBoundary,
      showGaps: config.showKnownGaps
    }
  };
}

export { renderForRole, getDepthForRole, ROLE_DEPTH_MAP, DEPTH_CONFIG };
