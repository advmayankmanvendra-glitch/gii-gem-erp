import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { DASHBOARD_VIEW_KEY } from "../../config/storageKeys.js";
import { readJsonPreference } from "../../utils/uiHelpers.js";
import { DASHBOARD_NAV_CONTEXT_KEY } from "./drilldowns/drilldownFilters.js";

const DashboardContext = createContext(null);

export function DashboardProvider({ children, companyContext, apiClient }) {
  const [dashboardMode, setDashboardModeState] = useState(() => window.localStorage?.getItem(DASHBOARD_VIEW_KEY) || "executive");

  const setDashboardMode = useCallback((mode) => {
    setDashboardModeState(mode);
    window.localStorage?.setItem(DASHBOARD_VIEW_KEY, mode);
  }, []);

  const navigateWithContext = useCallback((setView, target, extraContext = {}) => {
    if (!setView || !target) return;
    // Only the originating period/navigation details are saved. Drilldowns take
    // the company from the live company context, never from this snapshot.
    const context = {
      mode: dashboardMode,
      ...extraContext
    };
    try {
      sessionStorage.setItem(DASHBOARD_NAV_CONTEXT_KEY, JSON.stringify(context));
    } catch { /* drilldown then opens without a saved period */ }
    setView(target);
  }, [dashboardMode]);

  const readNavContext = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_NAV_CONTEXT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const navContext = useMemo(() => ({
    company: companyContext,
    mode: dashboardMode
  }), [companyContext, dashboardMode]);

  const value = useMemo(() => ({
    dashboardMode,
    setDashboardMode,
    navigateWithContext,
    readNavContext,
    navContext
  }), [dashboardMode, setDashboardMode, navigateWithContext, readNavContext, navContext]);

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboardContext() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    return {
      dashboardMode: "executive",
      setDashboardMode: () => {},
      navigateWithContext: (_setView, target) => _setView?.(target),
      readNavContext: () => null,
      navContext: {}
    };
  }
  return ctx;
}
