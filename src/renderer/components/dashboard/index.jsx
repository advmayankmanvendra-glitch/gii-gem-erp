import React from "react";
import { Icon } from "../common.jsx";

export function DashboardViewToolbar({ dashboardMode, dashboardModeLabels, customizing, onChangeMode, onToggleCustomize }) {
  return (
    <section className="panel dashboard-toolbar">
      <div>
        <h2>Dashboard View</h2>
        <p>Choose the card set that matches the review you are doing now.</p>
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
        <h2>Customize {dashboardModeLabels[dashboardMode]} Cards</h2>
        <p>Show, hide or pin cards without changing dashboard calculations.</p>
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
          <strong>No dashboard cards visible</strong>
          <span>Open Customize and enable at least one card for this view.</span>
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
