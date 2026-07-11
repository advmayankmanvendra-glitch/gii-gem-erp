import React, { useState } from "react";
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

function validateDateRange(from, to, fyStart, fyEnd, crossFy) {
  const errors = [];
  if (!from || !to) { errors.push("Both From Date and To Date are required."); return errors; }
  const fromD = new Date(from);
  const toD = new Date(to);
  if (isNaN(fromD.getTime())) errors.push("From Date is invalid.");
  if (isNaN(toD.getTime())) errors.push("To Date is invalid.");
  if (fromD > toD) errors.push("From Date cannot be greater than To Date.");
  const today = new Date();
  if (fromD > today || toD > today) errors.push("Future dates cannot be selected.");
  if (!crossFy && fyStart && fyEnd) {
    const fyS = new Date(fyStart);
    const fyE = new Date(fyEnd);
    if (fromD < fyS || toD > fyE) errors.push(`Dates must fall within the selected Financial Year (${fyS.getFullYear()}-${fyE.getFullYear()}). Enable "Cross Financial Year Analysis" to override.`);
  }
  return errors;
}

export function ContextBar({
  selectedFy, fyOptions, onFyChange,
  period, periodOptions, onPeriodChange,
  customFrom, customTo, onCustomFrom, onCustomTo,
  customLabel, onCustomLabel,
  onApplyCustom, onResetCustom,
  comparisonMode, comparisonOptions, onComparisonChange,
  refreshTime, onRefresh, autoRefresh, onAutoRefreshToggle,
  fyStart, fyEnd,
  exportContext
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateFrom, setDateFrom] = useState(customFrom || "");
  const [dateTo, setDateTo] = useState(customTo || "");
  const [dateLabel, setDateLabel] = useState(customLabel || "");
  const [crossFy, setCrossFy] = useState(false);
  const [dateErrors, setDateErrors] = useState([]);
  const [showExport, setShowExport] = useState(false);

  function handleApplyCustom() {
    const errors = validateDateRange(dateFrom, dateTo, fyStart, fyEnd, crossFy);
    setDateErrors(errors);
    if (errors.length) return;
    const label = `${new Date(dateFrom).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${new Date(dateTo).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
    onApplyCustom(dateFrom, dateTo, dateLabel || label);
    setShowDatePicker(false);
  }

  function handleResetCustom() {
    setDateFrom("");
    setDateTo("");
    setDateLabel("");
    setDateErrors([]);
    setCrossFy(false);
    onResetCustom();
    setShowDatePicker(false);
  }

  function openDatePicker() {
    setDateFrom(customFrom || "");
    setDateTo(customTo || "");
    setDateLabel(customLabel || "");
    setDateErrors([]);
    setShowDatePicker(true);
  }

  return (
    <section className="context-bar">
      {/* Row 1: Company + Financial Year + Period */}
      <div className="context-bar-row">
        <div className="context-bar-section context-bar-fy">
          <label className="context-bar-label">Financial Year</label>
          <select value={`${selectedFy.startYear}-${selectedFy.endYear}`} onChange={(e) => {
            const fy = fyOptions.find((o) => o.value === e.target.value);
            if (fy) onFyChange({ label: fy.label, startYear: fy.start.getFullYear(), endYear: fy.end.getFullYear(), start: fy.start, end: fy.end });
          }} className="context-bar-select">
            {fyOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="context-bar-section context-bar-period">
          <label className="context-bar-label">Period</label>
          <div className="context-bar-period-buttons" role="group" aria-label="Period presets">
            {periodOptions.slice(0, 7).map((opt) => (
              <button type="button" key={opt.value} className={period === opt.value ? "active" : ""} onClick={() => onPeriodChange(opt.value)}>
                {opt.label}
              </button>
            ))}
            <button type="button" className="more-periods-toggle" onClick={() => setShowDatePicker((p) => !p)} title="More periods">
              ▼
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Extended period presets + Custom date picker */}
      <div className="context-bar-row">
        <div className="context-bar-section context-bar-extended">
          {periodOptions.slice(7, -1).map((opt) => (
            <button type="button" key={opt.value} className={period === opt.value ? "active" : ""} onClick={() => onPeriodChange(opt.value)}>
              {opt.label}
            </button>
          ))}
          <button type="button" className={period === "custom" ? "active" : ""} onClick={openDatePicker}>
            Custom Range
          </button>
        </div>

        <div className="context-bar-section context-bar-refresh">
          {refreshTime && <span className="context-bar-refresh-time">Last: {refreshTime}</span>}
          <button type="button" className="ghost-btn context-bar-refresh-btn" onClick={onRefresh} title="Refresh dashboard">⟳</button>
          <button type="button" className={`ghost-btn${autoRefresh ? " active" : ""}`} onClick={onAutoRefreshToggle} title="Auto refresh">
            {autoRefresh ? "Auto: On" : "Auto: Off"}
          </button>
          <button type="button" className="ghost-btn" onClick={() => setShowExport((e) => !e)} title="Export context">Export</button>
        </div>
      </div>

      {/* Date picker (shown when custom range is active) */}
      {showDatePicker && (
        <div className="context-bar-date-picker">
          <div className="date-picker-fields">
            <label>
              From Date
              <input type="date" value={dateFrom} max={new Date().toISOString().split("T")[0]} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label>
              To Date
              <input type="date" value={dateTo} max={new Date().toISOString().split("T")[0]} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label>
              Label (optional)
              <input type="text" value={dateLabel} placeholder="e.g. Q1 Review" onChange={(e) => setDateLabel(e.target.value)} />
            </label>
          </div>
          {dateErrors.length > 0 && (
            <div className="date-picker-errors">
              {dateErrors.map((err, i) => <span key={i} className="date-error">{err}</span>)}
            </div>
          )}
          <label className="date-picker-cross-fy">
            <input type="checkbox" checked={crossFy} onChange={(e) => setCrossFy(e.target.checked)} />
            Cross Financial Year Analysis
          </label>
          <div className="date-picker-actions">
            <button type="button" className="ghost-btn" onClick={handleApplyCustom} disabled={!dateFrom || !dateTo}>Apply</button>
            <button type="button" className="ghost-btn" onClick={handleResetCustom}>Reset</button>
            <button type="button" className="ghost-btn" onClick={() => setShowDatePicker(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Comparison selector */}
      <div className="context-bar-row">
        <div className="context-bar-section">
          <label className="context-bar-label">Comparison</label>
          <select value={comparisonMode} onChange={(e) => onComparisonChange(e.target.value)} className="context-bar-select">
            {comparisonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Export context banner */}
      {showExport && exportContext && (
        <div className="context-bar-export-banner">
          <strong>Export Context</strong>
          <div className="export-context-grid">
            <span>Company: {exportContext.company}</span>
            <span>FY: {exportContext.financialYear}</span>
            <span>Period: {exportContext.period}</span>
            <span>Comparison: {exportContext.comparison}</span>
            <span>Generated: {exportContext.generatedOn}</span>
            <span>By: {exportContext.generatedBy}</span>
          </div>
        </div>
      )}
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
