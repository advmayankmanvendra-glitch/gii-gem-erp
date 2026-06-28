import React, { useState } from "react";
import { Icon } from "../../components/common.jsx";
import { formatCurrency } from "../../utils/formatters.js";

function formatCardValue(value, format) {
  if (format === "currency") return formatCurrency(value);
  return String(value ?? 0);
}

/** Returns a lightweight dashboard integrity label without recalculating report totals. */
function widgetIntegrity(card, value) {
  if (card.integrity) return card.integrity;
  const count = Number(value || 0);
  if (["pending_procurement", "pending_billing", "pending_documents", "pending_supply", "pending_delivery", "low_stock", "critical_alerts", "unposted_vouchers"].includes(card.id)) {
    return count > 0 ? "Warning" : "Reconciled";
  }
  return "Reconciled";
}

function ComparisonRow({ comparison }) {
  if (!comparison) return null;
  const arrow = comparison.trend === "up" ? "▲" : comparison.trend === "down" ? "▼" : "→";
  const color = comparison.trend === "up" ? "#1a7f37" : comparison.trend === "down" ? "#cf222e" : "#8a9aa8";
  return (
    <div className="widget-comparison" style={{ color }}>
      <span className="comparison-previous">{formatCardValue(comparison.previous, "currency")}</span>
      <span className="comparison-arrow">{arrow}</span>
      <span className="comparison-value">{formatCardValue(comparison.current, "currency")}</span>
      <span className="comparison-variance">{comparison.variancePercent >= 0 ? "+" : ""}{comparison.variancePercent.toFixed(1)}%</span>
    </div>
  );
}

export function WidgetContainer({ card, value, format, dataSource, refreshTime, periodLabel, comparisonLabel, comparisonData, isPinned, onOpen, onTogglePin, onRemove, onResize }) {
  const [size, setSize] = useState("medium");
  const displayValue = formatCardValue(value, format);
  const drillTarget = card.drilldownTarget || card.target;
  const reconcileTarget = card.reconcileTarget || drillTarget;
  const integrity = widgetIntegrity(card, value);

  function handleResize() {
    const next = size === "small" ? "medium" : size === "medium" ? "large" : "small";
    setSize(next);
    onResize?.(card.id, next);
  }

  return (
    <div className={`widget-card widget-size-${size}${isPinned ? " widget-pinned" : ""}`}>
      <div className="widget-header">
        <div className="widget-title-row">
          <Icon name={card.icon} />
          <span className="widget-label">{card.label}</span>
        </div>
        <div className="widget-actions">
          <button type="button" className="widget-action-btn" onClick={handleResize} title={`Resize (${size})`}>⤡</button>
          <button type="button" className={`widget-action-btn${isPinned ? " active" : ""}`} onClick={() => onTogglePin(card.id)} title={isPinned ? "Unpin" : "Pin"}>
            {isPinned ? "★" : "☆"}
          </button>
          {onRemove && <button type="button" className="widget-action-btn widget-remove-btn" onClick={() => onRemove(card.id)} title="Remove">✕</button>}
        </div>
      </div>

      <button type="button" className="widget-body" onClick={() => onOpen(drillTarget)} title={`Review ${card.label}`}>
        <strong className="widget-value">{displayValue}</strong>
        <span className={`widget-integrity widget-integrity-${String(integrity).toLowerCase().replace(/\s+/g, "-")}`}>{integrity}</span>
        {comparisonData && <ComparisonRow comparison={comparisonData} />}
        {card.nextAction && <small className="widget-next-action">{card.nextAction}</small>}
      </button>

      <div className="widget-footer">
        {dataSource && <span className="widget-meta" title="Source Report">Source Report: {dataSource}</span>}
        {refreshTime && <span className="widget-meta" title="Last Refreshed">As of {refreshTime}</span>}
        <span className="widget-meta" title="Reporting Period">Period: {periodLabel}</span>
        {comparisonLabel && <span className="widget-meta widget-comparison-label" title="Comparison">{comparisonLabel}</span>}
        {reconcileTarget && (
          <button type="button" className="widget-reconcile-btn" onClick={() => onOpen(reconcileTarget)} title="Reconcile with source report">
            Reconcile →
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkQueueWidget({ card, value, format, dataSource, refreshTime, periodLabel, comparisonLabel, comparisonData, isPinned, onOpen, onTogglePin, onRemove, onResize, items }) {
  const displayValue = formatCardValue(value, format);
  const drillTarget = card.drilldownTarget || card.target;
  const reconcileTarget = card.reconcileTarget || drillTarget;
  const integrity = widgetIntegrity(card, value);

  return (
    <div className={`widget-card widget-work-queue${isPinned ? " widget-pinned" : ""}`}>
      <div className="widget-header">
        <div className="widget-title-row">
          <Icon name={card.icon} />
          <span className="widget-label">{card.label}</span>
          <span className="widget-count-badge">{items?.length || 0}</span>
        </div>
        <div className="widget-actions">
          <button type="button" className="widget-action-btn" onClick={() => onResize?.(card.id)} title="Resize">⤡</button>
          <button type="button" className={`widget-action-btn${isPinned ? " active" : ""}`} onClick={() => onTogglePin(card.id)} title={isPinned ? "Unpin" : "Pin"}>
            {isPinned ? "★" : "☆"}
          </button>
          {onRemove && <button type="button" className="widget-action-btn widget-remove-btn" onClick={() => onRemove(card.id)} title="Remove">✕</button>}
        </div>
      </div>

      <div className="widget-body">
        <strong className="widget-value">{displayValue}</strong>
        <span className={`widget-integrity widget-integrity-${String(integrity).toLowerCase().replace(/\s+/g, "-")}`}>{integrity}</span>
        {comparisonData && <ComparisonRow comparison={comparisonData} />}
        {card.nextAction && <small className="widget-next-action">{card.nextAction}</small>}
        {items?.length > 0 && (
          <div className="widget-queue">
            {items.slice(0, 5).map((item, i) => (
              <button key={i} type="button" className="widget-queue-item" onClick={() => onOpen(item.target || card.target)}>
                <span className="queue-item-label">{item.label || `Item ${i + 1}`}</span>
                {item.value !== undefined && <span className="queue-item-value">{formatCardValue(item.value, item.format || "number")}</span>}
              </button>
            ))}
            {items.length > 5 && <span className="widget-queue-more">+{items.length - 5} more</span>}
          </div>
        )}
      </div>

      <div className="widget-footer">
        {dataSource && <span className="widget-meta">Source Report: {dataSource}</span>}
        {refreshTime && <span className="widget-meta">As of {refreshTime}</span>}
        <span className="widget-meta">Period: {periodLabel}</span>
        {comparisonLabel && <span className="widget-meta widget-comparison-label">{comparisonLabel}</span>}
        {reconcileTarget && (
          <button type="button" className="widget-reconcile-btn" onClick={() => onOpen(reconcileTarget)} title="Reconcile with source report">
            Reconcile →
          </button>
        )}
      </div>
    </div>
  );
}

export function WidgetGrid({ children }) {
  return <div className="widget-grid">{children}</div>;
}

export function WidgetToolbar({ onAddWidget, availableCards, mode }) {
  const [adding, setAdding] = useState(false);
  const [selectedCard, setSelectedCard] = useState("");

  function handleAdd() {
    if (selectedCard && onAddWidget) {
      onAddWidget(selectedCard);
      setSelectedCard("");
      setAdding(false);
    }
  }

  return (
    <div className="widget-toolbar">
      {onAddWidget && (
        <div className="widget-add-controls">
          {adding ? (
            <>
              <select value={selectedCard} onChange={(e) => setSelectedCard(e.target.value)} className="widget-add-select">
                <option value="">-- Select widget --</option>
                {availableCards.filter((c) => !c.hidden).map((card) => (
                  <option key={card.id} value={card.id}>{card.label}</option>
                ))}
              </select>
              <button type="button" className="ghost-btn" onClick={handleAdd} disabled={!selectedCard}>Add</button>
              <button type="button" className="ghost-btn" onClick={() => setAdding(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="ghost-btn" onClick={() => setAdding(true)}>+ Add Widget</button>
          )}
        </div>
      )}
    </div>
  );
}
