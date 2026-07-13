import { useEffect, useState } from "react";
import { DrilldownPanel } from "../../components/panels/DrilldownPanel.jsx";
import { DeliveryChallanQuickForm } from "../../components/panels/SmallComponents.jsx";
import { Field, SelectBox } from "../../components/forms/index.jsx";
import { InventoryDashboardPanel, InventoryReadOnlyReportPanel } from "../../components/inventoryReports/index.jsx";
import { InteractiveStockSummaryReport } from "../../screens/InventoryStockSummaryReport.jsx";
import { formatCell } from "../accounting/accountingHelpers.js";
import { exportRows, formatCurrency } from "../../utils/formatters.js";
import { requestPrintPreview } from "../../utils/uiHelpers.js";
import { scrollToSection } from "../../utils/navigationScroll.js";
import { inventoryTableConfig } from "../inventory/inventoryTableConfig.js";

export function InventoryReportScreen({ view, notify, companyContext, onNavigate, api }) {
  const today = new Date().toISOString().slice(0, 10);
  const [filters, setFilters] = useState({ company_id: companyContext?.company_id || "", date_from: "2026-01-01", date_to: today, low_stock_mode: "stocked" });
  const [data, setData] = useState(null);
  const [drilldown, setDrilldown] = useState(null);

  async function load() {
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || filters.company_id };
      const result = await api.getInventoryData(effectiveFilters);
      setData(result);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  useEffect(() => {
    if (companyContext?.company_id && String(filters.company_id || "") !== String(companyContext.company_id)) {
      setFilters((current) => ({ ...current, company_id: companyContext.company_id }));
      return;
    }
    load();
  }, [filters.company_id, filters.date_from, filters.date_to, filters.low_stock_mode, companyContext?.company_id, companyContext?.company_scope]);

  async function openInventoryDrilldown(row, mode = "account") {
    try {
      const payload = {
        company_id: filters.company_id,
        date_from: filters.date_from,
        date_to: filters.date_to
      };
      if (mode === "account") payload.account_id = row.id;
      if (mode === "voucher") payload.voucher_id = row.voucher_id || row.id;
      if (mode === "source") {
        payload.source_module = row.source_module;
        payload.source_id = row.source_id;
      }
      const result = await api.getDrilldownData(payload);
      setDrilldown({ mode, title: row.account_name || row.voucher_number || row.reference || "Drilldown", ...result });
      notify("Drilldown opened");
      scrollToSection(".voucher-detail-panel", false);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  const config = inventoryTableConfig(view, data || {});
  const rows = config.rows || [];
  if (view === "inventory_dashboard") {
    return (
      <InventoryDashboardPanel
        data={data || {}}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        companies={data?.companies || []}
        onNavigate={onNavigate}
        onExport={() => exportRows(config.title, rows)}
        onPrint={requestPrintPreview}
      />
    );
  }
  if (view === "stock_summary") {
    return (
      <InteractiveStockSummaryReport
        data={data || {}}
        filters={filters}
        setFilters={setFilters}
        rows={rows}
        title={config.title}
      />
    );
  }
  return (
    <>
      <InventoryReadOnlyReportPanel
        view={view}
        config={config}
        rows={rows}
        filters={filters}
        setFilters={setFilters}
        companies={data?.companies || []}
        formatValue={formatCell}
        onExport={() => exportRows(config.title, rows)}
        onPrint={requestPrintPreview}
        onDrillVoucher={(row) => openInventoryDrilldown(row, "voucher")}
        onDrillSource={(row) => openInventoryDrilldown(row, "source")}
        onDrillAccount={(row) => openInventoryDrilldown(row, "account")}
        onNavigate={onNavigate}
      >
        {view === "delivery_challans" && <DeliveryChallanQuickForm api={api} data={data || {}} notify={notify} onSaved={load} confirmAction={window.__giiGemConfirm || (() => Promise.resolve({ confirmed: true }))} />}
        {view === "warehouse_transfers" && <WarehouseTransferQuickForm data={data || {}} notify={notify} onSaved={load} api={api} confirmAction={window.__giiGemConfirm || (() => Promise.resolve({ confirmed: true }))} />}
      </InventoryReadOnlyReportPanel>
      {drilldown && <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} onNavigate={onNavigate} notify={notify} />}
    </>
  );
}

function WarehouseTransferQuickForm({ data, notify, onSaved, api, confirmAction }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ from_warehouse_id: "", to_warehouse_id: "", item_id: "", quantity: "", rate: "", transfer_date: today, reason: "" });
  async function submit(event) {
    event.preventDefault();
    try {
      const transfer = await api.createWarehouseTransfer({
        company_id: data.company_id,
        from_warehouse_id: Number(form.from_warehouse_id),
        to_warehouse_id: Number(form.to_warehouse_id),
        item_id: Number(form.item_id),
        quantity: Number(form.quantity),
        rate: Number(form.rate || 0),
        transfer_date: form.transfer_date,
        reason: form.reason
      });
      const confirmed = await confirmAction({
        mode: "warning",
        title: "Post Warehouse Transfer",
        message: "Do you want to proceed with this inventory action? Stock balances may be affected.",
        confirmLabel: "Yes, Proceed",
        cancelLabel: "No, Cancel",
        moduleName: "warehouse_transfers",
        recordId: transfer.id
      });
      if (!confirmed.confirmed) return;
      await api.postWarehouseTransfer(transfer.id, 1);
      notify(`Warehouse transfer posted: ${transfer.transfer_number || transfer.id}`);
      setForm({ from_warehouse_id: "", to_warehouse_id: "", item_id: "", quantity: "", rate: "", transfer_date: today, reason: "" });
      onSaved();
    } catch (error) {
      notify(error.message, "error");
    }
  }
  const warehouses = (data.references?.warehouses || []).map((row) => [row.id, row.warehouse_name]);
  return (
    <form className="inline-entry-form" onSubmit={submit}>
      <SelectBox label="From Warehouse" value={form.from_warehouse_id} onChange={(value) => setForm({ ...form, from_warehouse_id: value })} options={warehouses} />
      <SelectBox label="To Warehouse" value={form.to_warehouse_id} onChange={(value) => setForm({ ...form, to_warehouse_id: value })} options={warehouses} />
      <SelectBox label="Item" value={form.item_id} onChange={(value) => setForm({ ...form, item_id: value })} options={(data.references?.items || []).map((row) => [row.id, row.item_name])} />
      <Field name="quantity" label="Quantity" type="number" value={form.quantity} onChange={(value) => setForm({ ...form, quantity: value })} />
      <Field name="rate" label="Rate" type="number" value={form.rate} onChange={(value) => setForm({ ...form, rate: value })} />
      <Field name="transfer_date" label="Transfer Date" type="date" value={form.transfer_date} onChange={(value) => setForm({ ...form, transfer_date: value })} />
      <Field name="reason" label="Reason" type="text" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} />
      <button className="primary-btn">Post Transfer</button>
    </form>
  );
}
