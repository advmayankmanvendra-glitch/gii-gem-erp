import React from "react";
import { EmptyState, Icon } from "../common.jsx";
import { ReportActionButtons, ReportDateFilters, ReportSelectFilter, ReportToolbar } from "../forms/index.jsx";
import { formatCurrency } from "../../utils/formatters.js";

const INVENTORY_DASHBOARD_TARGETS = {
  stock_value: "stock_summary",
  reserved_value: "stock_reservations",
  procurement_value: "procurement_requirements",
  pending_grns: "grn_report",
  pending_deliveries: "delivery_challans",
  issued_today: "stock_ledger",
  transfers_today: "warehouse_transfers",
  stock_quantity: "stock_summary",
  reserved_quantity: "stock_reservations",
  issued_quantity: "stock_ledger",
  low_stock: "low_stock"
};

const VERIFICATION_PATHS = [
  ["Stock Summary", "stock_summary", "Verify closing quantity and value item-wise."],
  ["Stock Ledger", "stock_ledger", "Trace inward, outward and running balance."],
  ["Low Stock", "low_stock", "Review reorder-level exceptions."],
  ["Procurement Requirements", "procurement_requirements", "Check shortage against order demand."],
  ["Goods Receipt Notes", "grn_report", "Review pending and posted GRNs."],
  ["Delivery Challans", "delivery_challans", "Verify stock issue and delivery status."]
];

/** Formats inventory metric values without changing source dashboard data. */
function formatMetricValue(row) {
  if (row?.type === "money") return formatCurrency(Number(row.value || 0));
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(row?.value || 0));
}

/** Builds high-signal attention rows from existing inventory report collections. */
function buildAttentionRows(data = {}) {
  const rows = [];
  (data.lowStock || []).slice(0, 4).forEach((row) => rows.push({
    type: "Low Stock",
    title: row.item_name,
    detail: `${row.warehouse_name || "Unlinked warehouse"} | Closing ${row.closing_quantity ?? 0}`,
    target: "low_stock"
  }));
  (data.procurementRequirements || []).slice(0, 4).forEach((row) => rows.push({
    type: "Procurement",
    title: row.order_number || row.item_name,
    detail: `${row.item_name || "Item"} | Required ${row.procurement_required_quantity ?? 0}`,
    target: "procurement_requirements"
  }));
  (data.goodsReceipts || []).filter((row) => row.status !== "Posted").slice(0, 3).forEach((row) => rows.push({
    type: "GRN",
    title: row.grn_number || row.supplier_name || "Pending GRN",
    detail: `${row.warehouse_name || "Warehouse"} | ${row.status || "Pending"}`,
    target: "grn_report"
  }));
  (data.deliveryChallans || []).filter((row) => row.status !== "Confirmed").slice(0, 3).forEach((row) => rows.push({
    type: "Delivery",
    title: row.challan_number || row.order_number || "Pending delivery",
    detail: `${row.department_name || "Department"} | ${row.status || "Pending"}`,
    target: "delivery_challans"
  }));
  return rows.slice(0, 10);
}

/** Renders the Inventory Dashboard as a command center using existing report data. */
export function InventoryDashboardPanel({
  data,
  rows,
  filters,
  setFilters,
  companies,
  onNavigate,
  onExport,
  onPrint
}) {
  const attentionRows = buildAttentionRows(data);
  const companyName = companies.find((company) => String(company.id) === String(filters.company_id))?.company_name || "Selected company";

  return (
    <section className="dashboard-page inventory-dashboard-page">
      <ReportToolbar title="Inventory Dashboard" note={`${companyName} - stock, reservation and movement command center`} className="accounting-toolbar">
        <ReportSelectFilter
          value={filters.company_id}
          onChange={(company_id) => setFilters({ ...filters, company_id })}
          options={companies.map((company) => [company.id, company.company_name])}
        />
        <ReportDateFilters
          dateFrom={filters.date_from}
          dateTo={filters.date_to}
          onDateFromChange={(date_from) => setFilters({ ...filters, date_from })}
          onDateToChange={(date_to) => setFilters({ ...filters, date_to })}
        />
        <ReportActionButtons onExport={onExport} onPrint={onPrint} />
      </ReportToolbar>

      <div className="workflow-note">
        <strong>Inventory Verification</strong>
        <span>Use each card to open the source report behind the number instead of relying on a static dashboard figure.</span>
      </div>

      <div className="metric-grid simplified-dashboard-grid">
        {rows.map((row) => {
          const target = INVENTORY_DASHBOARD_TARGETS[row.id] || "stock_summary";
          return (
            <button key={row.id || row.metric} type="button" className="metric-card metric-card-link" onClick={() => onNavigate(target)}>
              <div>
                <span>{row.metric}</span>
                <strong>{formatMetricValue(row)}</strong>
                <small>{row.note || "Open source report"}</small>
              </div>
              <Icon name={row.type === "money" ? "rupee" : "box"} />
            </button>
          );
        })}
      </div>

      <div className="dashboard-customizer-grid">
        <section className="panel settings-panel report-panel">
          <div className="records-toolbar">
            <div>
              <h2>Inventory Attention</h2>
              <span>{attentionRows.length} item(s) needing review</span>
            </div>
          </div>
          {attentionRows.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Type</th><th>Reference</th><th>Basis</th><th>Action</th></tr></thead>
                <tbody>
                  {attentionRows.map((row, index) => (
                    <tr key={`${row.type}-${row.title}-${index}`}>
                      <td><span className="status-badge warning">{row.type}</span></td>
                      <td><strong>{row.title}</strong></td>
                      <td>{row.detail}</td>
                      <td><button type="button" className="ghost-btn" onClick={() => onNavigate(row.target)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No inventory attention items" note="No low-stock, procurement, GRN or delivery exception is pending for this company." />}
        </section>

        <section className="panel settings-panel report-panel">
          <div className="records-toolbar">
            <div>
              <h2>Verification Paths</h2>
              <span>Open the source report behind dashboard numbers</span>
            </div>
          </div>
          <div className="health-action-grid">
            {VERIFICATION_PATHS.map(([label, target, note]) => (
              <button key={target} type="button" className="ghost-btn" onClick={() => onNavigate(target)}>
                <strong>{label}</strong>
                <small>{note}</small>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
