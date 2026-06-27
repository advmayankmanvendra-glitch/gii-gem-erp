import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { DASHBOARD_VIEW_KEY } from "../../config/storageKeys.js";
import { readJsonPreference } from "../../utils/uiHelpers.js";

const DashboardContext = createContext(null);

export function DashboardProvider({ children, companyContext, apiClient }) {
  const [dashboardMode, setDashboardModeState] = useState(() => window.localStorage?.getItem(DASHBOARD_VIEW_KEY) || "executive");

  const setDashboardMode = useCallback((mode) => {
    setDashboardModeState(mode);
    window.localStorage?.setItem(DASHBOARD_VIEW_KEY, mode);
  }, []);

  const navigateWithContext = useCallback((setView, target) => {
    if (!setView || !target) return;
    const context = {
      company: companyContext,
      mode: dashboardMode
    };
    sessionStorage.setItem("gii-gem-dashboard-nav-context", JSON.stringify(context));
    setView(target);
  }, [companyContext, dashboardMode]);

  const readNavContext = useCallback(() => {
    try {
      const raw = sessionStorage.getItem("gii-gem-dashboard-nav-context");
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
