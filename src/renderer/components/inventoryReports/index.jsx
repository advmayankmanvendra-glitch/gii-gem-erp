import React from "react";
import { EmptyState } from "../common.jsx";
import { MetricLine, ReportActionButtons, ReportDateFilters, ReportSelectFilter, ReportToolbar } from "../forms/index.jsx";
import { formatCurrency } from "../../utils/formatters.js";

export { InventoryDashboardPanel } from "./InventoryDashboardPanel.jsx";

export function InventoryReportToolbar({
  mode,
  title,
  companies,
  filters,
  setFilters,
  summaryRows,
  activeItemId,
  setSelectedItemId,
  setMode,
  basis,
  setBasis,
  showMovementAnalysis,
  setShowMovementAnalysis,
  onExport,
  onPrint
}) {
  return (
    <ReportToolbar
      title={mode === "summary" ? title : mode === "monthly" ? "Monthly Movement" : "Stock Item Ledger"}
      note={`${companies.find((company) => String(company.id) === String(filters.company_id))?.company_name || companies[0]?.company_name || "GII GeM ERP"} - ${formatDateRange(filters.date_from, filters.date_to)}`}
      className="accounting-toolbar stock-report-toolbar"
    >
      <ReportDateFilters
        companyId={filters.company_id}
        companies={companies}
        dateFrom={filters.date_from}
        dateTo={filters.date_to}
        onCompanyChange={(company_id) => setFilters({ ...filters, company_id })}
        onDateFromChange={(date_from) => setFilters({ ...filters, date_from })}
        onDateToChange={(date_to) => setFilters({ ...filters, date_to })}
      />
      <ReportSelectFilter
        value={activeItemId}
        onChange={(itemId) => { setSelectedItemId(itemId); if (itemId) setMode("ledger"); }}
        placeholderLabel="All Stock Items"
        options={summaryRows.map((row) => [row.item_id, row.item_name])}
      />
      <ReportSelectFilter
        value={basis}
        onChange={setBasis}
        options={[
          ["Weighted Average", "Weighted Average"],
          ["Closing Value", "Closing Value"],
          ["Quantity Only", "Quantity Only"]
        ]}
      />
      <ReportSelectFilter
        value={mode}
        onChange={setMode}
        options={[
          ["summary", "Stock Summary"],
          ["monthly", "Monthly Movement"],
          ["ledger", "Stock Item Ledger"]
        ]}
      />
      <button className="ghost-btn" type="button" onClick={() => setShowMovementAnalysis((value) => !value)}>
        {showMovementAnalysis ? "Hide Movement Analysis" : "Show Movement Analysis"}
      </button>
      <ReportActionButtons onExport={onExport} onPrint={onPrint} />
    </ReportToolbar>
  );
}

export function StockDrillNote({ selectedItem, mode, onBack }) {
  if (mode === "summary") return null;
  return (
    <div className="workflow-note stock-drill-note">
      <strong>{selectedItem?.item_name || "Select a stock item"}</strong>
      <span>{mode === "monthly" ? "Month-wise stock movement using existing stock ledger entries." : "Voucher-wise stock movement with running balance."}</span>
      <button type="button" className="ghost-btn" onClick={onBack}>Back to Stock Summary</button>
    </div>
  );
}

export function StockReportTotals({ rows, totals, mode, selectedItem }) {
  const values = mode === "summary" ? {
    inwardQty: totals.inwardQty,
    inwardValue: totals.inwardValue,
    outwardQty: totals.outwardQty,
    outwardValue: totals.outwardValue,
    closingQty: totals.closingQty,
    closingValue: totals.closingValue
  } : {
    inwardQty: rows.reduce((sum, row) => sum + Number(row.inward_quantity || 0), 0),
    inwardValue: rows.reduce((sum, row) => sum + Number(row.inward_value || 0), 0),
    outwardQty: rows.reduce((sum, row) => sum + Number(row.outward_quantity || 0), 0),
    outwardValue: rows.reduce((sum, row) => sum + Number(row.outward_value || 0), 0),
    closingQty: rows.at(-1)?.closing_quantity || selectedItem?.closing_quantity || 0,
    closingValue: rows.at(-1)?.closing_value || selectedItem?.stock_value || 0
  };
  return (
    <div className="stock-total-cards">
      <MetricLine label="Inward Qty" value={formatNumber(values.inwardQty)} />
      <MetricLine label="Inward Value" value={formatCurrency(values.inwardValue)} />
      <MetricLine label="Outward Qty" value={formatNumber(values.outwardQty)} />
      <MetricLine label="Outward Value" value={formatCurrency(values.outwardValue)} />
      <MetricLine label="Closing Qty" value={formatNumber(values.closingQty)} />
      <MetricLine label="Closing Value" value={formatCurrency(values.closingValue)} />
    </div>
  );
}

export function StockSummaryInteractiveTable({ rows, totals, selectedItemId, onSelect }) {
  return (
    <div className="table-wrap stock-report-table-wrap">
      <table className="stock-report-table">
        <thead>
          <tr>
            <th className="particulars">Item</th>
            <th colSpan="2">Opening Balance</th>
            <th colSpan="2">Inwards</th>
            <th colSpan="2">Outwards</th>
            <th colSpan="3">Closing Balance</th>
          </tr>
          <tr>
            <th></th><th>Qty</th><th>Value</th><th>Qty</th><th>Value</th><th>Qty</th><th>Value</th><th>Qty</th><th>Rate</th><th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.item_id} className={String(row.item_id) === String(selectedItemId) ? "selected" : ""} onClick={() => onSelect(row)}>
              <td className="particulars">{row.item_name}</td>
              <td>{formatQuantity(row.opening_quantity, row.unit)}</td>
              <td>{formatCurrency(row.opening_value)}</td>
              <td>{formatQuantity(row.inward_quantity, row.unit)}</td>
              <td>{formatCurrency(row.inward_value)}</td>
              <td>{formatQuantity(row.outward_quantity, row.unit)}</td>
              <td>{formatCurrency(row.outward_value)}</td>
              <td>{formatQuantity(row.closing_quantity, row.unit)}</td>
              <td>{formatCurrency(row.weighted_rate)}</td>
              <td>{formatCurrency(row.stock_value)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="particulars">Grand Total</td>
            <td>{formatNumber(totals.openingQty)}</td><td>{formatCurrency(totals.openingValue)}</td>
            <td>{formatNumber(totals.inwardQty)}</td><td>{formatCurrency(totals.inwardValue)}</td>
            <td>{formatNumber(totals.outwardQty)}</td><td>{formatCurrency(totals.outwardValue)}</td>
            <td>{formatNumber(totals.closingQty)}</td><td></td><td>{formatCurrency(totals.closingValue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function StockMonthlyMovementTable({ rows, selectedItem, showMovementAnalysis }) {
  return (
    <div className="table-wrap stock-report-table-wrap">
      <table className="stock-report-table">
        <thead>
          <tr>
            <th className="particulars">Month</th>
            <th colSpan="2">Inwards</th>
            <th colSpan={showMovementAnalysis ? 5 : 2}>Outwards</th>
            <th colSpan="2">Closing Balance</th>
          </tr>
          <tr>
            <th></th><th>Quantity</th><th>Value</th><th>Quantity</th><th>Value</th>{showMovementAnalysis && <><th>Consumption</th><th>Movement Gain</th><th>Gain %</th></>}<th>Quantity</th><th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="particulars"><em>Opening Balance</em></td><td colSpan={showMovementAnalysis ? 9 : 6}></td></tr>
          {rows.map((row) => (
            <tr key={row.month_key} className={row.inward_quantity || row.outward_quantity ? "movement-row" : ""}>
              <td className="particulars">{row.month_label}</td>
              <td>{formatQuantity(row.inward_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.inward_value)}</td>
              <td>{formatQuantity(row.outward_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.outward_value)}</td>
              {showMovementAnalysis && <><td>{formatCurrency(row.consumption_value)}</td><td>{formatCurrency(row.gross_profit)}</td><td>{row.profit_percent ? `${formatNumber(row.profit_percent)}%` : "-"}</td></>}
              <td>{formatQuantity(row.closing_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.closing_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StockItemLedgerTable({ rows, selectedItem }) {
  return (
    <div className="table-wrap stock-report-table-wrap">
      <table className="stock-report-table">
        <thead>
          <tr>
            <th>Date</th><th className="particulars">Party / Source</th><th>Document Type</th><th>Document No.</th><th colSpan="2">Inwards</th><th colSpan="2">Outwards</th><th colSpan="2">Closing</th>
          </tr>
          <tr>
            <th></th><th></th><th></th><th></th><th>Quantity</th><th>Value</th><th>Quantity</th><th>Value</th><th>Quantity</th><th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td></td><td className="particulars"><em>Opening Balance</em></td><td></td><td></td><td></td><td></td><td></td><td></td><td>{formatQuantity(selectedItem?.opening_quantity || 0, selectedItem?.unit)}</td><td>{formatCurrency(selectedItem?.opening_value || 0)}</td></tr>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              <td>{row.transaction_date || row.entry_date || "-"}</td>
              <td className="particulars"><strong>{row.particulars}</strong><small>{row.order_number || row.warehouse_name || ""}</small></td>
              <td>{row.voucher_type || row.transaction_type || "-"}</td>
              <td>{row.document_number || row.voucher_number || "-"}</td>
              <td>{formatQuantity(row.inward_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.inward_value)}</td>
              <td>{formatQuantity(row.outward_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.outward_value)}</td>
              <td>{formatQuantity(row.closing_quantity, selectedItem?.unit)}</td>
              <td>{formatCurrency(row.closing_value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InventoryReadOnlyReportPanel({
  view,
  config,
  rows,
  filters,
  setFilters,
  companies,
  formatValue,
  onExport,
  onPrint,
  children
}) {
  return (
    <section className="panel settings-panel report-panel">
      {children}
      <ReportToolbar title={config.title} note={`${rows.length} row(s)`} className="accounting-toolbar">
        <ReportSelectFilter
          value={filters.company_id}
          onChange={(company_id) => setFilters({ ...filters, company_id })}
          options={companies.map((company) => [company.id, company.company_name])}
        />
        {view === "low_stock" && (
          <ReportSelectFilter
            value={filters.low_stock_mode || "stocked"}
            onChange={(low_stock_mode) => setFilters({ ...filters, low_stock_mode })}
            options={[
              ["stocked", "Show stocked items only"],
              ["never_stocked", "Show never-stocked items"],
              ["all", "Show all"]
            ]}
          />
        )}
        <ReportDateFilters
          dateFrom={filters.date_from}
          dateTo={filters.date_to}
          onDateFromChange={(date_from) => setFilters({ ...filters, date_from })}
          onDateToChange={(date_to) => setFilters({ ...filters, date_to })}
        />
        <ReportActionButtons onExport={onExport} onPrint={onPrint} />
      </ReportToolbar>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || `${view}-${index}`}>
                  {config.columns.map((column) => <td key={column.key}>{formatValue(row[column.key], column.type)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No inventory data" note="Post stock inward or outward documents to populate this report." />}
    </section>
  );
}

function formatNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(number);
}

function formatQuantity(value, unit = "") {
  const quantity = Number(value || 0);
  if (!quantity) return "-";
  return `${formatNumber(quantity)}${unit ? ` ${unit}` : ""}`;
}

function formatDateRange(from, to) {
  return `${formatShortDate(from)} to ${formatShortDate(to)}`;
}

function formatShortDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }).replace(/ /g, "-");
}
