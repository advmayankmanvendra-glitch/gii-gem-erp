import { useState, useEffect, useCallback, useRef } from "react";
import { readJsonPreference } from "../../utils/uiHelpers.js";

const DASHBOARD_PERIOD_KEY = "gii-gem-dashboard-period";
const DASHBOARD_PERIOD_LABEL_KEY = "gii-gem-dashboard-period-label";

export const PERIOD_OPTIONS = [
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_financial_year", label: "This Financial Year" },
  { value: "last_month", label: "Last Month" },
  { value: "custom", label: "Custom Range" }
];

function getFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month < 3 ? year - 1 : year;
  return { start: new Date(startYear, 3, 1), end: new Date(startYear + 1, 2, 31) };
}

function getPeriodRange(period) {
  const now = new Date();
  switch (period) {
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start, end };
    }
    case "this_quarter": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), (q + 1) * 3, 0);
      return { start, end };
    }
    case "this_financial_year":
      return getFinancialYear();
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start, end };
    }
    case "custom":
      return { start: null, end: null };
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) };
  }
}

function formatPeriodLabel(period, customLabel) {
  if (period === "custom") return customLabel || "Custom Range";
  const option = PERIOD_OPTIONS.find((o) => o.value === period);
  return option ? option.label : "This Month";
}

export function usePeriod() {
  const [period, setPeriodState] = useState(() => window.localStorage?.getItem(DASHBOARD_PERIOD_KEY) || "this_month");
  const [customLabel, setCustomLabelState] = useState(() => window.localStorage?.getItem(DASHBOARD_PERIOD_LABEL_KEY) || "");

  const setPeriod = useCallback((value) => {
    setPeriodState(value);
    window.localStorage?.setItem(DASHBOARD_PERIOD_KEY, value);
  }, []);

  const setCustomLabel = useCallback((value) => {
    setCustomLabelState(value);
    window.localStorage?.setItem(DASHBOARD_PERIOD_LABEL_KEY, value || "");
  }, []);

  const range = getPeriodRange(period);
  const label = formatPeriodLabel(period, customLabel);

  return { period, setPeriod, range, label, customLabel, setCustomLabel };
}

export function useDashboardData(apiClient, companyContext) {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTime, setRefreshTime] = useState(null);
  const [bankLedgers, setBankLedgers] = useState([]);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    if (!apiClient || !companyContext) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      apiClient.getDashboardCounts(companyContext),
      apiClient.getBankLedgers ? apiClient.getBankLedgers(companyContext) : Promise.resolve([])
    ]).then(([countsResult, bankResult]) => {
      if (!mountedRef.current) return;
      if (countsResult.status === "fulfilled") setCounts(countsResult.value);
      else setError(countsResult.reason?.message || "Failed to load dashboard data");
      if (bankResult.status === "fulfilled") setBankLedgers(bankResult.value);
      setRefreshTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  return { counts, loading, error, refreshTime, bankLedgers, refresh: fetchData };
}

export function resolveCardValue(card, counts) {
  if (card.staticValue !== undefined) return card.staticValue;
  const raw = counts?.[card.valueKey] ?? (card.fallbackKey ? counts?.[card.fallbackKey] : 0);
  return raw ?? 0;
}
