import { dashboardFilters } from "../dashboardService.js";

export const DASHBOARD_NAV_CONTEXT_KEY = "gii-gem-dashboard-nav-context";

/** Reads the period/navigation snapshot the dashboard saved when a widget was opened. */
export function readDashboardNavContext() {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_NAV_CONTEXT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Request filters for a drilldown: the live company context stays authoritative,
 * and the originating widget's saved date range (when there is one) is applied
 * exactly as the dashboard applied it, so the drilldown reconciles with the card.
 */
export function drilldownFilters(companyContext) {
  const range = readDashboardNavContext()?.range;
  return dashboardFilters(companyContext, { start: toDate(range?.start), end: toDate(range?.end) });
}

/** True when a YYYY-MM-DD (or ISO) date falls inside the filters' date range; no range means no limit. */
export function inFilterRange(value, filters) {
  if (!filters?.date_from && !filters?.date_to) return true;
  const day = String(value || "").slice(0, 10);
  if (!day) return false;
  if (filters.date_from && day < filters.date_from) return false;
  if (filters.date_to && day > filters.date_to) return false;
  return true;
}
