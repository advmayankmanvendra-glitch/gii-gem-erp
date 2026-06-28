import { useState, useEffect, useCallback, useRef } from "react";
import { readJsonPreference } from "../../utils/uiHelpers.js";
import { buildTreasuryOverview } from "./treasuryService.js";

const DASHBOARD_PERIOD_KEY = "gii-gem-dashboard-period";
const DASHBOARD_PERIOD_LABEL_KEY = "gii-gem-dashboard-period-label";
const DASHBOARD_FY_KEY = "gii-gem-dashboard-fy";
const DASHBOARD_COMPARISON_KEY = "gii-gem-dashboard-comparison";
const DASHBOARD_FROM_KEY = "gii-gem-dashboard-from";
const DASHBOARD_TO_KEY = "gii-gem-dashboard-to";
const DASHBOARD_AUTO_REFRESH_KEY = "gii-gem-dashboard-auto-refresh";

export const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "last_quarter", label: "Last Quarter" },
  { value: "this_financial_year", label: "This Financial Year" },
  { value: "previous_financial_year", label: "Previous Financial Year" },
  { value: "ytd", label: "Year to Date (YTD)" },
  { value: "mtd", label: "Month to Date (MTD)" },
  { value: "qtd", label: "Quarter to Date (QTD)" },
  { value: "custom", label: "Custom Range" }
];

export const COMPARISON_OPTIONS = [
  { value: "none", label: "No Comparison" },
  { value: "previous_period", label: "Compare with Previous Period" },
  { value: "same_period_last_year", label: "Compare with Same Period Last Year" },
  { value: "previous_fy", label: "Compare with Previous Financial Year" },
  { value: "budget", label: "Compare with Budget" }
];

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getQuarterStart(date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}

function getQuarterEnd(date) {
  const qStart = getQuarterStart(date);
  return new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0, 23, 59, 59, 999);
}

function prevQuarterStartQuarter(date) {
  const q = Math.floor(date.getMonth() / 3);
  const prevQ = q === 0 ? 3 : q - 1;
  const prevYear = q === 0 ? date.getFullYear() - 1 : date.getFullYear();
  return new Date(prevYear, prevQ * 3 - 3, 1);
}

function prevQuarterEndQuarter(date) {
  const qStart = prevQuarterStartQuarter(date);
  return new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0, 23, 59, 59, 999);
}

export function getFinancialYear(date) {
  const d = date || new Date();
  const year = d.getFullYear();
  const month = d.getMonth();
  const startYear = month < 3 ? year - 1 : year;
  return {
    startYear,
    endYear: startYear + 1,
    label: `FY ${startYear}–${String(startYear + 1).slice(-2)}`,
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59, 999)
  };
}

export function getFinancialYearOptions() {
  const now = new Date();
  const current = getFinancialYear(now);
  const options = [];
  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(now.getFullYear() + offset, now.getMonth(), 1);
    const fy = getFinancialYear(d);
    if (!options.find((o) => o.label === fy.label)) {
      options.push({ value: `${fy.startYear}-${fy.endYear}`, label: fy.label, start: fy.start, end: fy.end });
    }
  }
  return options.sort((a, b) => b.start - a.start);
}

function formatDate(d) {
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function getPeriodRange(period, fyStart, fyEnd) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  switch (period) {
    case "today":
      return { start: new Date(today), end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    case "yesterday":
      return { start: new Date(yesterday), end: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999) };
    case "this_week":
      return { start: startOfWeek(now), end: endOfWeek(now) };
    case "last_week": {
      const lastWeek = new Date(now);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return { start: startOfWeek(lastWeek), end: endOfWeek(lastWeek) };
    }
    case "this_month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) };
    case "last_month":
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999) };
    case "this_quarter":
      return { start: getQuarterStart(now), end: getQuarterEnd(now) };
    case "last_quarter":
      return { start: prevQuarterStartQuarter(now), end: prevQuarterEndQuarter(now) };
    case "this_financial_year": {
      const fy = getFinancialYear(now);
      return { start: fy.start, end: fy.end };
    }
    case "previous_financial_year": {
      const fy = getFinancialYear(new Date(now.getFullYear() - 1, now.getMonth(), 1));
      return { start: fy.start, end: fy.end };
    }
    case "ytd":
      return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) };
    case "mtd":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    case "qtd": {
      const qStart = getQuarterStart(now);
      return { start: qStart, end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) };
    }
    case "custom": {
      if (fyStart && fyEnd) return { start: new Date(fyStart), end: new Date(fyEnd) };
      return { start: null, end: null };
    }
    default: {
      const defaultFy = getFinancialYear(now);
      return { start: defaultFy.start, end: defaultFy.end };
    }
  }
}

function getPreviousPeriodRange(period, range) {
  if (!range.start || !range.end) return null;
  const diff = range.end.getTime() - range.start.getTime();

  if (period === "this_financial_year") {
    const prev = getFinancialYear(new Date(range.start.getFullYear() - 1, 3, 1));
    return { start: prev.start, end: prev.end };
  }
  if (period === "previous_financial_year") {
    return null;
  }
  if (period === "this_quarter" || period === "last_quarter") {
    const quarterMs = 90 * 24 * 60 * 60 * 1000;
    return { start: new Date(range.start.getTime() - quarterMs), end: new Date(range.start.getTime() - 1) };
  }

  return { start: new Date(range.start.getTime() - diff - 1), end: new Date(range.start.getTime() - 1) };
}

function getSamePeriodLastYearRange(range) {
  if (!range.start || !range.end) return null;
  return {
    start: new Date(range.start.getFullYear() - 1, range.start.getMonth(), range.start.getDate()),
    end: new Date(range.end.getFullYear() - 1, range.end.getMonth(), range.end.getDate())
  };
}

function formatPeriodLabel(period, customLabel, range) {
  if (period === "custom") return customLabel || "Custom Range";
  if (period === "ytd") return `YTD (${range.start ? formatDate(range.start) : "..."} – ${range.end ? formatDate(range.end) : "..."})`;
  if (period === "mtd") return `MTD (${range.start ? formatDate(range.start) : "..."} – ${range.end ? formatDate(range.end) : "..."})`;
  if (period === "qtd") return `QTD (${range.start ? formatDate(range.start) : "..."} – ${range.end ? formatDate(range.end) : "..."})`;
  const option = PERIOD_OPTIONS.find((o) => o.value === period);
  if (option) return `${option.label} (${range.start ? formatDate(range.start) : "..."} – ${range.end ? formatDate(range.end) : "..."})`;
  return "Custom Range";
}

function formatComparisonLabel(mode, range) {
  switch (mode) {
    case "none": return null;
    case "previous_period": return "vs Previous Period";
    case "same_period_last_year": return `vs Same Period Last Year (${range?.start ? range.start.getFullYear() - 1 : "..."})`;
    case "previous_fy": return `vs Previous FY`;
    case "budget": return "vs Budget";
    default: return null;
  }
}

function computeVariance(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return { variance: cur, variancePercent: cur > 0 ? 100 : 0, trend: cur > 0 ? "up" : cur < 0 ? "down" : "flat" };
  const variance = cur - prev;
  const variancePercent = ((cur - prev) / Math.abs(prev)) * 100;
  const trend = variance > 0 ? "up" : variance < 0 ? "down" : "flat";
  return { variance, variancePercent, trend };
}

export function useFinancialYear() {
  const [selectedFy, setSelectedFy] = useState(() => {
    const stored = window.localStorage?.getItem(DASHBOARD_FY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...parsed, start: new Date(parsed.start), end: new Date(parsed.end) };
    }
    return getFinancialYear(new Date());
  });

  const setFinancialYear = useCallback((fy) => {
    setSelectedFy(fy);
    window.localStorage?.setItem(DASHBOARD_FY_KEY, JSON.stringify({ label: fy.label, startYear: fy.startYear, endYear: fy.endYear, start: fy.start.toISOString(), end: fy.end.toISOString() }));
  }, []);

  const fyOptions = getFinancialYearOptions();

  return { selectedFy, setFinancialYear, fyOptions };
}

export function usePeriod(fyStart, fyEnd) {
  const [period, setPeriodState] = useState(() => window.localStorage?.getItem(DASHBOARD_PERIOD_KEY) || "this_month");
  const [customLabel, setCustomLabelState] = useState(() => window.localStorage?.getItem(DASHBOARD_PERIOD_LABEL_KEY) || "");
  const [customFrom, setCustomFromState] = useState(() => window.localStorage?.getItem(DASHBOARD_FROM_KEY) || "");
  const [customTo, setCustomToState] = useState(() => window.localStorage?.getItem(DASHBOARD_TO_KEY) || "");

  const setPeriod = useCallback((value) => {
    setPeriodState(value);
    window.localStorage?.setItem(DASHBOARD_PERIOD_KEY, value);
  }, []);

  const setCustomLabel = useCallback((value) => {
    setCustomLabelState(value);
    window.localStorage?.setItem(DASHBOARD_PERIOD_LABEL_KEY, value || "");
  }, []);

  const setCustomFrom = useCallback((value) => {
    setCustomFromState(value);
    window.localStorage?.setItem(DASHBOARD_FROM_KEY, value || "");
  }, []);

  const setCustomTo = useCallback((value) => {
    setCustomToState(value);
    window.localStorage?.setItem(DASHBOARD_TO_KEY, value || "");
  }, []);

  const range = getPeriodRange(period, customFrom || fyStart, customTo || fyEnd);
  const label = formatPeriodLabel(period, customLabel, range);

  const applyCustomRange = useCallback((fromDate, toDate, labelText) => {
    setCustomFrom(fromDate);
    setCustomTo(toDate);
    if (labelText) setCustomLabel(labelText);
    setPeriod("custom");
  }, [setCustomFrom, setCustomTo, setCustomLabel, setPeriod]);

  const resetCustomRange = useCallback(() => {
    setCustomFrom("");
    setCustomTo("");
    setCustomLabel("");
    setPeriod("this_month");
  }, [setCustomFrom, setCustomTo, setCustomLabel, setPeriod]);

  return {
    period, setPeriod, range, label,
    customLabel, setCustomLabel,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    applyCustomRange, resetCustomRange
  };
}

export function useComparison(period, range) {
  const [comparisonMode, setComparisonState] = useState(() => window.localStorage?.getItem(DASHBOARD_COMPARISON_KEY) || "none");

  const setComparison = useCallback((value) => {
    setComparisonState(value);
    window.localStorage?.setItem(DASHBOARD_COMPARISON_KEY, value);
  }, []);

  let comparisonRange = null;
  if (comparisonMode === "previous_period") comparisonRange = getPreviousPeriodRange(period, range);
  else if (comparisonMode === "same_period_last_year") comparisonRange = getSamePeriodLastYearRange(range);

  const comparisonLabel = formatComparisonLabel(comparisonMode, comparisonRange);

  function applyComparison(prevValue, currentValue) {
    if (comparisonMode === "none" || prevValue === null || prevValue === undefined) return null;
    return {
      previous: prevValue,
      current: currentValue,
      ...computeVariance(currentValue, prevValue)
    };
  }

  return { comparisonMode, setComparison, comparisonRange, comparisonLabel, applyComparison };
}

export function useDashboardData(apiClient, companyContext) {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTime, setRefreshTime] = useState(null);
  const [bankLedgers, setBankLedgers] = useState([]);
  const [treasury, setTreasury] = useState(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(() => {
    if (!apiClient || !companyContext) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      apiClient.getDashboardCounts(companyContext),
      apiClient.getBankLedgers ? apiClient.getBankLedgers(companyContext) : Promise.resolve([]),
      apiClient.getAccountingData ? apiClient.getAccountingData(companyContext) : Promise.resolve(null)
    ]).then(([countsResult, bankResult, accountingResult]) => {
      if (!mountedRef.current) return;
      const nextCounts = countsResult.status === "fulfilled" ? countsResult.value : null;
      const nextBanks = bankResult.status === "fulfilled" ? bankResult.value : [];
      const nextAccounting = accountingResult.status === "fulfilled" ? accountingResult.value : null;
      if (countsResult.status === "fulfilled") setCounts(nextCounts);
      else setError(countsResult.reason?.message || "Failed to load dashboard data");
      setBankLedgers(nextBanks);
      setTreasury(buildTreasuryOverview(nextCounts, nextAccounting, nextBanks));
      setRefreshTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setLoading(false);
    });
  }, [apiClient, companyContext]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  return { counts, loading, error, refreshTime, bankLedgers, treasury, refresh: fetchData };
}

export function resolveCardValue(card, counts) {
  if (card.staticValue !== undefined) return card.staticValue;
  const raw = counts?.[card.valueKey] ?? (card.fallbackKey ? counts?.[card.fallbackKey] : 0);
  return raw ?? 0;
}

export function buildExportContext(companyContext, selectedFy, periodLabel, comparisonLabel) {
  return {
    company: companyContext?.company_name || "All Companies",
    financialYear: selectedFy?.label || "N/A",
    period: periodLabel || "N/A",
    comparison: comparisonLabel || "None",
    generatedOn: new Date().toLocaleString("en-IN"),
    generatedBy: "System"
  };
}
