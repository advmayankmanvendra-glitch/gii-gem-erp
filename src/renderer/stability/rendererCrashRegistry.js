import { rendererErrorSummary, safeArray, safeObject } from "./rendererStabilityUtils.js";

const CRASH_REGISTRY_KEY = "gii-gem-renderer-crash-registry";
const MAX_CRASHES = 25;

export function readRendererCrashRegistry() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(CRASH_REGISTRY_KEY) || "[]");
    return safeArray(parsed);
  } catch {
    return [];
  }
}

export function recordRendererCrash(error, info = {}, context = {}) {
  const summary = rendererErrorSummary(error, info);
  const safeContext = safeObject(context);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    section: safeContext.section || "renderer",
    currentView: safeContext.view || safeContext.currentView || "unknown",
    routeView: safeContext.routeView || safeContext.view || "unknown",
    company: safeContext.company || safeContext.companyName || "Unselected",
    companyId: safeContext.companyId || safeContext.company_id || "",
    companyScope: safeContext.companyScope || safeContext.company_scope || "",
    user: safeContext.user || safeContext.userName || "Unknown",
    role: safeContext.role || "",
    message: summary.message,
    stack: summary.stack,
    componentStack: summary.componentStack
  };
  try {
    const next = [entry, ...readRendererCrashRegistry()].slice(0, MAX_CRASHES);
    window.localStorage?.setItem(CRASH_REGISTRY_KEY, JSON.stringify(next));
  } catch {
    // Crash capture must never create a second renderer failure.
  }
  return entry;
}

export function clearRendererCrashRegistry() {
  try {
    window.localStorage?.removeItem(CRASH_REGISTRY_KEY);
  } catch {
    // Local storage may be unavailable in recovery contexts.
  }
}
