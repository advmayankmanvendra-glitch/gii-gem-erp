import React from "react";
import { Icon } from "../common.jsx";

export function DashboardViewToolbar({ dashboardMode, dashboardModeLabels, customizing, onChangeMode, onToggleCustomize }) {
  return (
    <section className="panel dashboard-toolbar">
      <div>
        <h2>Dashboard Command Center</h2>
        <p>Select your view. Every widget links to its source report for verification.</p>
      </div>
      <div className="dashboard-mode-controls" role="group" aria-label="Dashboard view mode">
        {Object.entries(dashboardModeLabels).map(([mode, label]) => (
          <button type="button" key={mode} className={dashboardMode === mode ? "active" : ""} onClick={() => onChangeMode(mode)}>
            {label}
          </button>
        ))}
        <button type="button" className="ghost-btn" onClick={onToggleCustomize}>
          {customizing ? "Close Customize" : "Customize"}
        </button>
      </div>
    </section>
  );
}

export function PeriodSelector({ period, periodOptions, onPeriodChange, customLabel, onCustomLabelChange }) {
  return (
    <div className="period-selector" role="group" aria-label="Reporting period">
      {periodOptions.map((opt) => (
        <button
          type="button"
          key={opt.value}
          className={period === opt.value ? "active" : ""}
          onClick={() => onPeriodChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
      {period === "custom" && (
        <input
          type="text"
          className="period-custom-input"
          placeholder="e.g. Apr-Jun 2026"
          value={customLabel || ""}
          onChange={(e) => onCustomLabelChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function DashboardPeriodBar({ periodLabel, refreshTime, companyName, onRefresh }) {
  return (
    <div className="dashboard-period-bar">
      <span className="period-bar-item">
        <strong>Period:</strong> {periodLabel}
      </span>
      {refreshTime && (
        <span className="period-bar-item">
          <strong>Last Refreshed:</strong> {refreshTime}
        </span>
      )}
      {companyName && (
        <span className="period-bar-item">
          <strong>Company:</strong> {companyName}
        </span>
      )}
      {onRefresh && (
        <button type="button" className="ghost-btn period-refresh-btn" onClick={onRefresh} title="Refresh dashboard data">
          ⟳ Refresh
        </button>
      )}
    </div>
  );
}

export function DashboardCustomizer({
  dashboardMode,
  dashboardModeLabels,
  modeCards,
  modeHiddenCards,
  pinnedCards,
  onToggleCardVisibility,
  onTogglePinnedCard
}) {
  return (
    <section className="panel dashboard-customizer">
      <div>
        <h2>Customize {dashboardModeLabels[dashboardMode]} Widgets</h2>
        <p>Show, hide, pin or reorder widgets. Changes persist per view mode.</p>
      </div>
      <div className="dashboard-customizer-grid">
        {modeCards.map((card) => {
          const hidden = modeHiddenCards.includes(card.id);
          const pinned = pinnedCards.includes(`${dashboardMode}:${card.id}`);
          return (
            <div className="dashboard-customizer-row" key={card.id}>
              <label>
                <input type="checkbox" checked={!hidden} onChange={() => onToggleCardVisibility(card.id)} />
                <span>{card.label}</span>
              </label>
              <button type="button" className={pinned ? "pinned" : ""} onClick={() => onTogglePinnedCard(card.id)}>
                {pinned ? "Pinned" : "Pin"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DashboardCardGrid({ dashboardMode, visibleCards, pinnedCards, onOpenCard, onTogglePinnedCard }) {
  return (
    <>
      <div className="metric-grid simplified-dashboard-grid">
        {visibleCards.map((card) => {
          const pinned = pinnedCards.includes(`${dashboardMode}:${card.id}`);
          return (
            <div className={`metric-card dashboard-card ${pinned ? "pinned" : ""}`} key={card.id}>
              <button type="button" className="metric-card-main" onClick={() => onOpenCard(card.target)} title={`Review ${card.label}: ${card.note}`}>
                <div>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.note}</small>
                </div>
                <Icon name={card.icon} />
              </button>
              <button type="button" className="dashboard-card-pin" onClick={() => onTogglePinnedCard(card.id)} title={pinned ? "Unpin card" : "Pin card"}>
                {pinned ? "*" : "+"}
              </button>
            </div>
          );
        })}
      </div>

      {!visibleCards.length && (
        <section className="panel empty-state">
          <Icon name="grid" />
          <strong>No dashboard widgets visible</strong>
          <span>Open Customize and enable at least one widget for this view.</span>
        </section>
      )}
    </>
  );
}

export function DashboardSetupChecklist({ checklist, onOpen }) {
  return (
    <section className="panel setup-panel">
      <h2><Icon name="card" /> Getting Started - Setup Checklist</h2>
      <div className="checklist">
        {checklist.map(([label, target]) => (
          <button key={label} onClick={() => onOpen(target)}>
            <span className="dot"></span>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
