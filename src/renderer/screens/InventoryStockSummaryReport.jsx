import React, { useState } from "react";
import { MetricLine, ReportToolbar } from "../components/forms/index.jsx";
import { exportRows, formatCurrency } from "../utils/formatters.js";
import { requestPrintPreview } from "../utils/uiHelpers.js";

export function InteractiveStockSummaryReport({ data, filters, setFilters, rows, title }) {
  const [mode, setMode] = useState("summary");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [showMovementAnalysis, setShowMovementAnalysis] = useState(false);
  const [basis, setBasis] = useState("Weighted Average");
  const companies = data.companies || [];
  const summaryRows = buildStockItemSummary(rows || [], data.stockLedger || []);
  const selectedItem = summaryRows.find((row) => String(row.item_id) === String(selectedItemId)) || summaryRows[0] || null;
  const activeItemId = selectedItemId || selectedItem?.item_id || "";
  const ledgerRows = (data.stockLedger || []).filter((row) => !activeItemId || String(row.item_id) === String(activeItemId));
  const itemVoucherRows = buildStockVoucherRows(ledgerRows, selectedItem);
  const monthlyRows = buildStockMonthlyRows(ledgerRows, selectedItem, filters.date_from, filters.date_to, showMovementAnalysis);
  const totals = summaryRows.reduce((acc, row) => ({
    openingQty: acc.openingQty + Number(row.opening_quantity || 0),
    openingValue: acc.openingValue + Number(row.opening_value || 0),
    inwardQty: acc.inwardQty + Number(row.inward_quantity || 0),
    inwardValue: acc.inwardValue + Number(row.inward_value || 0),
    outwardQty: acc.outwardQty + Number(row.outward_quantity || 0),
    outwardValue: acc.outwardValue + Number(row.outward_value || 0),
    closingQty: acc.closingQty + Number(row.closing_quantity || 0),
    closingValue: acc.closingValue + Number(row.stock_value || 0)
  }), { openingQty: 0, openingValue: 0, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0, closingQty: 0, closingValue: 0 });
  const currentRows = mode === "summary" ? summaryRows : mode === "monthly" ? monthlyRows : itemVoucherRows;
  const exportTitle = mode === "summary" ? "Stock Summary" : mode === "monthly" ? `Monthly Movement - ${selectedItem?.item_name || ""}` : `Stock Item Ledger - ${selectedItem?.item_name || ""}`;

  return (
    <section className="panel settings-panel report-panel stock-report-panel">
      <ReportToolbar
        title={mode === "summary" ? title : mode === "monthly" ? "Monthly Movement" : "Stock Item Ledger"}
        note={`${companies.find((company) => String(company.id) === String(filters.company_id))?.company_name || companies[0]?.company_name || "GII GeM ERP"} - ${formatDateRange(filters.date_from, filters.date_to)}`}
        className="accounting-toolbar stock-report-toolbar"
      >
          <select value={filters.company_id} onChange={(event) => setFilters({ ...filters, company_id: event.target.value })}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
          </select>
          <input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
          <input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
          <select value={activeItemId} onChange={(event) => { setSelectedItemId(event.target.value); if (event.target.value) setMode("ledger"); }}>
            <option value="">All Stock Items</option>
            {summaryRows.map((row) => <option key={row.item_id} value={row.item_id}>{row.item_name}</option>)}
          </select>
          <select value={basis} onChange={(event) => setBasis(event.target.value)}>
            <option>Weighted Average</option>
            <option>Closing Value</option>
            <option>Quantity Only</option>
          </select>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="summary">Stock Summary</option>
            <option value="monthly">Monthly Movement</option>
            <option value="ledger">Stock Item Ledger</option>
          </select>
          <button className="ghost-btn" type="button" onClick={() => setShowMovementAnalysis((value) => !value)}>{showMovementAnalysis ? "Hide Movement Analysis" : "Show Movement Analysis"}</button>
          <button className="ghost-btn" type="button" onClick={() => exportRows(exportTitle, currentRows)}>Export</button>
          <button className="ghost-btn" type="button" onClick={requestPrintPreview}>Print</button>
      </ReportToolbar>

      {mode !== "summary" && (
        <div className="workflow-note stock-drill-note">
          <strong>{selectedItem?.item_name || "Select a stock item"}</strong>
          <span>{mode === "monthly" ? "Month-wise stock movement using existing stock ledger entries." : "Voucher-wise stock movement with running balance."}</span>
          <button type="button" className="ghost-btn" onClick={() => setMode("summary")}>Back to Stock Summary</button>
        </div>
      )}

      <StockReportTotals
        rows={currentRows}
        totals={totals}
        mode={mode}
        selectedItem={selectedItem}
      />

        {mode === "summary" && (
          <StockSummaryInteractiveTable
            rows={summaryRows}
            totals={totals}
            selectedItemId={activeItemId}
            onSelect={(row) => {
              setSelectedItemId(row.item_id);
              setMode("ledger");
            }}
          />
        )}
        {mode === "monthly" && (
          <StockMonthlyMovementTable rows={monthlyRows} selectedItem={selectedItem} showMovementAnalysis={showMovementAnalysis} />
        )}
        {mode === "ledger" && (
          <StockItemLedgerTable rows={itemVoucherRows} selectedItem={selectedItem} />
        )}
    </section>
  );
}

function StockReportTotals({ rows, totals, mode, selectedItem }) {
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

function StockSummaryInteractiveTable({ rows, totals, selectedItemId, onSelect }) {
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

function StockMonthlyMovementTable({ rows, selectedItem, showMovementAnalysis }) {
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

function StockItemLedgerTable({ rows, selectedItem }) {
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

function buildStockItemSummary(rows = [], ledgerRows = []) {
  const byItem = new Map();
  rows.forEach((row) => {
    const itemId = row.item_id || row.id || row.item_name;
    const existing = byItem.get(String(itemId)) || {
      item_id: itemId,
      item_name: row.item_name || "Unnamed Item",
      unit: row.unit || "",
      opening_quantity: 0,
      opening_value: 0,
      inward_quantity: 0,
      inward_value: 0,
      outward_quantity: 0,
      outward_value: 0,
      closing_quantity: 0,
      stock_value: 0,
      reorder_level: row.reorder_level || 0,
      minimum_stock_level: row.minimum_stock_level || 0
    };
    existing.opening_quantity += Number(row.opening_stock || row.opening_quantity || 0);
    existing.opening_value += Number(row.opening_value || 0);
    existing.inward_quantity += Number(row.inward_quantity || 0);
    existing.inward_value += Number(row.inward_value || 0);
    existing.outward_quantity += Number(row.outward_quantity || 0);
    existing.outward_value += Number(row.outward_value || 0);
    existing.closing_quantity += Number(row.closing_quantity || 0);
    existing.stock_value += Number(row.stock_value || 0);
    existing.weighted_rate = existing.closing_quantity ? existing.stock_value / existing.closing_quantity : Number(row.weighted_rate || row.opening_rate || 0);
    byItem.set(String(itemId), existing);
  });
  ledgerRows.forEach((row) => {
    const itemId = row.item_id || row.id || row.item_name;
    const existing = byItem.get(String(itemId)) || {
      item_id: itemId,
      item_name: row.item_name || "Unnamed Item",
      unit: row.unit || "",
      opening_quantity: 0,
      opening_value: 0,
      inward_quantity: 0,
      inward_value: 0,
      outward_quantity: 0,
      outward_value: 0,
      closing_quantity: 0,
      stock_value: 0,
      reorder_level: row.reorder_level || 0,
      minimum_stock_level: row.minimum_stock_level || 0
    };
    const inwardQty = Number(row.inward_quantity || 0);
    const outwardQty = Number(row.outward_quantity || 0);
    const value = Math.abs(Number(row.value || 0));
    existing.inward_quantity += inwardQty;
    existing.inward_value += inwardQty ? value : 0;
    existing.outward_quantity += outwardQty;
    existing.outward_value += outwardQty ? value : 0;
    if (!existing.closing_quantity) existing.closing_quantity += inwardQty - outwardQty;
    if (!existing.stock_value) existing.stock_value += inwardQty ? value : -value;
    existing.weighted_rate = existing.closing_quantity ? existing.stock_value / existing.closing_quantity : Number(row.rate || 0);
    byItem.set(String(itemId), existing);
  });
  return [...byItem.values()].sort((a, b) => String(a.item_name).localeCompare(String(b.item_name)));
}

function buildStockVoucherRows(ledgerRows = [], selectedItem) {
  let runningQty = Number(selectedItem?.opening_quantity || 0);
  let runningValue = Number(selectedItem?.opening_value || 0);
  return [...ledgerRows].sort((a, b) => String(a.transaction_date || "").localeCompare(String(b.transaction_date || ""))).map((row) => {
    const inwardQty = Number(row.inward_quantity || 0);
    const outwardQty = Number(row.outward_quantity || 0);
    const inwardValue = inwardQty ? Number(row.value || row.inward_value || 0) : 0;
    const outwardValue = outwardQty ? Math.abs(Number(row.value || row.outward_value || 0)) : 0;
    runningQty += inwardQty - outwardQty;
    runningValue += inwardValue - outwardValue;
    return {
      ...row,
      particulars: row.supplier_name || row.department_name || row.particulars || row.source_module || row.transaction_type || "-",
      inward_value: inwardValue,
      outward_value: outwardValue,
      closing_quantity: runningQty,
      closing_value: runningValue
    };
  });
}

function buildStockMonthlyRows(ledgerRows = [], selectedItem, dateFrom, dateTo, showProfit) {
  const start = new Date(dateFrom || "2026-04-01");
  const end = new Date(dateTo || new Date().toISOString().slice(0, 10));
  const rows = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let runningQty = Number(selectedItem?.opening_quantity || 0);
  let runningValue = Number(selectedItem?.opening_value || 0);
  while (cursor <= end) {
    const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const movements = ledgerRows.filter((row) => String(row.transaction_date || row.entry_date || "").startsWith(monthKey));
    const inwardQty = movements.reduce((sum, row) => sum + Number(row.inward_quantity || 0), 0);
    const outwardQty = movements.reduce((sum, row) => sum + Number(row.outward_quantity || 0), 0);
    const inwardValue = movements.filter((row) => Number(row.inward_quantity || 0)).reduce((sum, row) => sum + Number(row.value || row.inward_value || 0), 0);
    const outwardValue = movements.filter((row) => Number(row.outward_quantity || 0)).reduce((sum, row) => sum + Math.abs(Number(row.value || row.outward_value || 0)), 0);
    runningQty += inwardQty - outwardQty;
    runningValue += inwardValue - outwardValue;
    const consumptionValue = showProfit ? outwardValue : 0;
    const grossProfit = 0;
    rows.push({
      month_key: monthKey,
      month_label: cursor.toLocaleString("en-IN", { month: "long" }),
      inward_quantity: inwardQty,
      inward_value: inwardValue,
      outward_quantity: outwardQty,
      outward_value: outwardValue,
      consumption_value: consumptionValue,
      gross_profit: grossProfit,
      profit_percent: outwardValue ? (grossProfit / outwardValue) * 100 : 0,
      closing_quantity: runningQty,
      closing_value: runningValue
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return rows;
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
