import React, { useState, useCallback } from "react";
import { DASHBOARD_MODE_LABELS, MODE_CARDS, MODE_DEFAULT_VISIBLE } from "../features/dashboards/dashboardConfig.js";
import { useFinancialYear, usePeriod, useComparison, useDashboardData, resolveCardValue, PERIOD_OPTIONS, COMPARISON_OPTIONS, buildExportContext } from "../features/dashboards/dashboardService.js";
import { WidgetContainer, WorkQueueWidget, WidgetGrid, WidgetToolbar } from "../features/dashboards/widgetFramework.jsx";
import { DashboardProvider, useDashboardContext } from "../features/dashboards/dashboardContext.jsx";
import { DASHBOARD_HIDDEN_CARDS_KEY, DASHBOARD_PINNED_CARDS_KEY, DASHBOARD_WIDGET_ORDER_KEY, DASHBOARD_VIEW_KEY } from "../config/storageKeys.js";
import { ContextBar, DashboardViewToolbar, DashboardCustomizer, DashboardSetupChecklist } from "../components/dashboard/index.jsx";
import { safeArray, safeObject } from "../stability/rendererStabilityUtils.js";
import { readJsonPreference } from "../utils/uiHelpers.js";

function DashboardInner({ notify, setView, companyContext, apiClient }) {
  const { counts, loading, error, refreshTime, refresh: refreshData } = useDashboardData(apiClient, companyContext);
  const { selectedFy, setFinancialYear, fyOptions } = useFinancialYear();
  const { period, setPeriod, range, label: periodLabel, customLabel, setCustomLabel, customFrom, setCustomFrom, customTo, setCustomTo, applyCustomRange, resetCustomRange } = usePeriod(selectedFy.start, selectedFy.end);
  const { comparisonMode, setComparison, comparisonLabel, applyComparison } = useComparison(period, range);
  const { dashboardMode, setDashboardMode, navigateWithContext } = useDashboardContext();
  const [customizing, setCustomizing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [hiddenCards, setHiddenCards] = useState(() => safeObject(readJsonPreference(DASHBOARD_HIDDEN_CARDS_KEY, {})));
  const [pinnedCards, setPinnedCards] = useState(() => safeArray(readJsonPreference(DASHBOARD_PINNED_CARDS_KEY, [])));
  const [widgetOrder, setWidgetOrder] = useState(() => safeArray(readJsonPreference(DASHBOARD_WIDGET_ORDER_KEY, {})));

  const modeCards = safeArray(MODE_CARDS[dashboardMode] || MODE_CARDS.executive);

  function persist(key, value) {
    window.localStorage?.setItem(key, value);
  }

  const changeMode = useCallback((mode) => {
    setDashboardMode(mode);
    setCustomizing(false);
  }, [setDashboardMode]);

  const toggleCardVisibility = useCallback((cardId) => {
    setHiddenCards((current) => {
      const safe = safeObject(current);
      const currentHidden = safeArray(safe[dashboardMode] || []);
      const nextHidden = currentHidden.includes(cardId) ? currentHidden.filter((id) => id !== cardId) : [...currentHidden, cardId];
      const next = { ...safe, [dashboardMode]: nextHidden };
      persist(DASHBOARD_HIDDEN_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  }, [dashboardMode]);

  const togglePinnedCard = useCallback((cardId) => {
    const pinKey = `${dashboardMode}:${cardId}`;
    setPinnedCards((current) => {
      const safe = safeArray(current);
      const next = safe.includes(pinKey) ? safe.filter((item) => item !== pinKey) : [...safe, pinKey];
      persist(DASHBOARD_PINNED_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  }, [dashboardMode]);

  const addWidget = useCallback((cardId) => {
    setHiddenCards((current) => {
      const safe = safeObject(current);
      const currentHidden = safeArray(safe[dashboardMode] || []);
      const nextHidden = currentHidden.filter((id) => id !== cardId);
      const next = { ...safe, [dashboardMode]: nextHidden };
      persist(DASHBOARD_HIDDEN_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  }, [dashboardMode]);

  const removeWidget = useCallback((cardId) => {
    setHiddenCards((current) => {
      const safe = safeObject(current);
      const currentHidden = safeArray(safe[dashboardMode] || []);
      const nextHidden = currentHidden.includes(cardId) ? currentHidden : [...currentHidden, cardId];
      const next = { ...safe, [dashboardMode]: nextHidden };
      persist(DASHBOARD_HIDDEN_CARDS_KEY, JSON.stringify(next));
      return next;
    });
  }, [dashboardMode]);

  const resizeWidget = useCallback((cardId, size) => {
    const key = `${DASHBOARD_VIEW_KEY}:size`;
    const sizes = safeObject(readJsonPreference(key, {}));
    sizes[`${dashboardMode}:${cardId}`] = size;
    persist(key, JSON.stringify(sizes));
  }, [dashboardMode]);

  const handleDrillDown = useCallback((target) => {
    navigateWithContext(setView, target);
  }, [navigateWithContext, setView]);

  const handleFyChange = useCallback((fy) => {
    setFinancialYear(fy);
  }, [setFinancialYear]);

  const safeHiddenCards = safeObject(hiddenCards);
  const safePinnedCards = safeArray(pinnedCards);
  const defaultVisibleIds = safeArray(MODE_DEFAULT_VISIBLE[dashboardMode] || MODE_DEFAULT_VISIBLE.executive);
  const modeVisible = safeArray(safeHiddenCards[dashboardMode]);

  const modeHiddenCards = modeVisible.length ? modeVisible : modeCards.filter((card) => !defaultVisibleIds.includes(card.id)).map((card) => card.id);
  const visibleCards = modeCards.filter((card) => !modeHiddenCards.includes(card.id));
  const hiddenCardsList = modeCards.filter((card) => modeHiddenCards.includes(card.id));

  const sortedCards = [...visibleCards].sort((left, right) => {
    const leftPinned = safePinnedCards.includes(`${dashboardMode}:${left.id}`) ? 0 : 1;
    const rightPinned = safePinnedCards.includes(`${dashboardMode}:${right.id}`) ? 0 : 1;
    if (leftPinned !== rightPinned) return leftPinned - rightPinned;
    const orderMap = safeObject(widgetOrder);
    const leftOrder = orderMap[`${dashboardMode}:${left.id}`] ?? 0;
    const rightOrder = orderMap[`${dashboardMode}:${right.id}`] ?? 0;
    return leftOrder - rightOrder;
  });

  const exportContext = buildExportContext(companyContext, selectedFy, periodLabel, comparisonLabel);
  const hasNoData = !loading && !error && (!counts || Object.keys(counts).length === 0);

  const checklist = [
    ["Add Company", "companies"],
    ["Add Employees", "employees"],
    ["Add Departments", "government_departments"],
    ["Add Suppliers", "suppliers"],
    ["Add Items", "items"],
    ["Create Expense Heads", "expense_heads"],
    ["Create Supply Order", "supply_orders"],
    ["Add Procurement", "procurements"],
    ["Raise Invoice", "invoices"]
  ];

  return (
    <section className="page dashboard-page">
      <div className="context-strip">
        <strong>{companyContext.company_scope === "all" ? "All Companies View" : "Company"}</strong>
        <span>{companyContext.company_name || "Create a company to begin"}</span>
      </div>

      <ContextBar
        selectedFy={selectedFy}
        fyOptions={fyOptions}
        onFyChange={handleFyChange}
        period={period}
        periodOptions={PERIOD_OPTIONS}
        onPeriodChange={setPeriod}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        customLabel={customLabel}
        onCustomLabel={setCustomLabel}
        onApplyCustom={applyCustomRange}
        onResetCustom={resetCustomRange}
        comparisonMode={comparisonMode}
        comparisonOptions={COMPARISON_OPTIONS}
        onComparisonChange={setComparison}
        refreshTime={refreshTime}
        onRefresh={refreshData}
        autoRefresh={autoRefresh}
        onAutoRefreshToggle={() => setAutoRefresh((a) => !a)}
        fyStart={selectedFy.start}
        fyEnd={selectedFy.end}
        exportContext={exportContext}
      />

      <DashboardViewToolbar
        dashboardMode={dashboardMode}
        dashboardModeLabels={DASHBOARD_MODE_LABELS}
        customizing={customizing}
        onChangeMode={changeMode}
        onToggleCustomize={() => setCustomizing((current) => !current)}
      />

      {customizing && (
        <DashboardCustomizer
          dashboardMode={dashboardMode}
          dashboardModeLabels={DASHBOARD_MODE_LABELS}
          modeCards={modeCards}
          modeHiddenCards={modeHiddenCards}
          pinnedCards={safePinnedCards}
          onToggleCardVisibility={toggleCardVisibility}
          onTogglePinnedCard={togglePinnedCard}
        />
      )}

      {loading && (
        <section className="panel loading-state">
          <strong>Loading dashboard data...</strong>
        </section>
      )}

      {error && (
        <section className="panel error-state">
          <strong>Error loading dashboard</strong>
          <span>{error}</span>
          <button type="button" className="ghost-btn" onClick={refreshData}>Retry</button>
        </section>
      )}

      {!loading && !error && (
        <>
          <WidgetToolbar
            onAddWidget={addWidget}
            availableCards={hiddenCardsList}
            mode={dashboardMode}
          />

          <WidgetGrid>
            {sortedCards.map((card) => {
              const value = resolveCardValue(card, counts);
              const isPinned = safePinnedCards.includes(`${dashboardMode}:${card.id}`);
              const isWorkQueue = ["pending_procurement", "pending_billing", "pending_documents", "pending_supply", "pending_delivery", "low_stock"].includes(card.id);

              if (isWorkQueue) {
                return (
                  <WorkQueueWidget
                    key={card.id}
                    card={card}
                    value={value}
                    format={card.format}
                    dataSource={card.dataSource}
                    refreshTime={refreshTime}
                    periodLabel={periodLabel}
                    comparisonLabel={comparisonLabel}
                    isPinned={isPinned}
                    onOpen={handleDrillDown}
                    onTogglePin={togglePinnedCard}
                    onRemove={removeWidget}
                    onResize={resizeWidget}
                    items={[]}
                  />
                );
              }

              return (
                <WidgetContainer
                  key={card.id}
                  card={card}
                  value={value}
                  format={card.format}
                  dataSource={card.dataSource}
                  refreshTime={refreshTime}
                  periodLabel={periodLabel}
                  comparisonLabel={comparisonLabel}
                  isPinned={isPinned}
                  onOpen={handleDrillDown}
                  onTogglePin={togglePinnedCard}
                  onRemove={removeWidget}
                  onResize={resizeWidget}
                />
              );
            })}
          </WidgetGrid>

          {!visibleCards.length && (
            <section className="panel empty-state">
              <strong>No dashboard widgets visible</strong>
              <span>Add widgets using the + Add Widget button above, or switch to another view mode.</span>
            </section>
          )}
        </>
      )}

      {hasNoData && <DashboardSetupChecklist checklist={checklist} onOpen={setView} />}
    </section>
  );
}

export function DashboardScreen(props) {
  return (
    <DashboardProvider companyContext={props.companyContext} apiClient={props.apiClient}>
      <DashboardInner {...props} />
    </DashboardProvider>
  );
}
