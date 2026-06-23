import React, { useState } from "react";
import {
  InventoryReportToolbar,
  StockDrillNote,
  StockItemLedgerTable,
  StockMonthlyMovementTable,
  StockReportTotals,
  StockSummaryInteractiveTable
} from "../components/inventoryReports/index.jsx";
import { StockAccountingStructureSummary } from "../features/reports/accountingIntelligence.jsx";
import { exportRows } from "../utils/formatters.js";
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
      <InventoryReportToolbar
        mode={mode}
        title={title}
        companies={companies}
        filters={filters}
        setFilters={setFilters}
        summaryRows={summaryRows}
        activeItemId={activeItemId}
        setSelectedItemId={setSelectedItemId}
        setMode={setMode}
        basis={basis}
        setBasis={setBasis}
        showMovementAnalysis={showMovementAnalysis}
        setShowMovementAnalysis={setShowMovementAnalysis}
        onExport={() => exportRows(exportTitle, currentRows)}
        onPrint={requestPrintPreview}
      />

      <StockAccountingStructureSummary mode={mode} selectedItem={selectedItem} totals={totals} rows={currentRows} />

      <StockDrillNote selectedItem={selectedItem} mode={mode} onBack={() => setMode("summary")} />

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
