import React, { useEffect, useState } from "react";
import { dashboardDefaultVisible, dashboardModeLabels } from "../config/dashboard.js";
import { DASHBOARD_HIDDEN_CARDS_KEY, DASHBOARD_PINNED_CARDS_KEY, DASHBOARD_VIEW_KEY } from "../config/storageKeys.js";
import { DashboardCardGrid, DashboardCustomizer, DashboardSetupChecklist, DashboardViewToolbar } from "../components/dashboard/index.jsx";
import { formatCurrency } from "../utils/formatters.js";
import { readJsonPreference } from "../utils/uiHelpers.js";

export function DashboardScreen({ notify, setView, companyContext, apiClient }) {
  const [counts, setCounts] = useState(null);
  const [dashboardMode, setDashboardMode] = useState(() => window.localStorage?.getItem(DASHBOARD_VIEW_KEY) || "executive");
  const [customizing, setCustomizing] = useState(false);
  const [hiddenCards, setHiddenCards] = useState(() => readJsonPreference(DASHBOARD_HIDDEN_CARDS_KEY, {}));
  const [pinnedCards, setPinnedCards] = useState(() => readJsonPreference(DASHBOARD_PINNED_CARDS_KEY, []));

  useEffect(() => {
    apiClient.getDashboardCounts(companyContext).then(setCounts).catch((error) => notify(error.message, "error"));
  }, [companyContext.company_id, companyContext.company_scope]);

  useEffect(() => {
    window.localStorage?.setItem(DASHBOARD_VIEW_KEY, dashboardMode);
  }, [dashboardMode]);

  useEffect(() => {
    window.localStorage?.setItem(DASHBOARD_HIDDEN_CARDS_KEY, JSON.stringify(hiddenCards));
  }, [hiddenCards]);

  useEffect(() => {
    window.localStorage?.setItem(DASHBOARD_PINNED_CARDS_KEY, JSON.stringify(pinnedCards));
  }, [pinnedCards]);

  const dashboardCards = {
    executive: [
      { id: "orders_pending", label: "Orders Pending", value: counts?.activeOrders ?? 0, note: "Open supply orders", icon: "clipboard", target: "supply_orders" },
      { id: "billing_this_month", label: "Billing This Month", value: formatCurrency(counts?.totalOrderValue ?? 0), note: "Review invoices", icon: "rupee", target: "invoices" },
      { id: "collections_this_month", label: "Collections This Month", value: formatCurrency(counts?.amountReceived ?? 0), note: "Open cash book", icon: "card", target: "cash_book" },
      { id: "receivables", label: "Outstanding Receivables", value: formatCurrency(counts?.outstanding ?? 0), note: "Verify bill-wise", icon: "wallet", target: "bill_wise_receivables" },
      { id: "payables", label: "Supplier Payables", value: formatCurrency(counts?.supplierPayables ?? counts?.payables ?? 0), note: "Open payables", icon: "truck", target: "payables" },
      { id: "net_profit", label: "Net Profit", value: formatCurrency(counts?.totalProfit ?? 0), note: "Open profitability", icon: "trend", target: "profitability_reports" },
      { id: "stock_value", label: "Stock Value", value: formatCurrency(counts?.totalStockValue ?? 0), note: "Verify stock summary", icon: "box", target: "stock_summary" },
      { id: "critical_alerts", label: "Critical Alerts", value: counts?.lowStockItems ?? 0, note: "Low stock and exceptions", icon: "shield", target: "low_stock" },
      { id: "companies", label: "Companies", value: counts?.companies ?? 0, note: "Legal entities", icon: "building", target: "companies" },
      { id: "suppliers", label: "Suppliers", value: counts?.suppliers ?? 0, note: "Registered vendors", icon: "truck", target: "suppliers" },
      { id: "items", label: "Items", value: counts?.items ?? 0, note: "Catalogue records", icon: "box", target: "items" }
    ],
    operations: [
      { id: "orders_received", label: "Orders Received", value: counts?.totalOrders ?? 0, note: "Review all orders", icon: "clipboard", target: "supply_orders" },
      { id: "pending_procurement", label: "Pending Procurement", value: counts?.pendingProcurement ?? 0, note: "Open procurement queue", icon: "cart", target: "pending_procurement" },
      { id: "pending_supply", label: "Pending Supply", value: counts?.pendingSupply ?? counts?.activeOrders ?? 0, note: "Review order lifecycle", icon: "truck", target: "order_lifecycle" },
      { id: "pending_billing", label: "Pending Billing", value: counts?.pendingBilling ?? 0, note: "Open billing pending", icon: "receipt", target: "pending_billing" },
      { id: "pending_documents", label: "Pending Documents", value: counts?.pendingDocuments ?? 0, note: "Open missing documents", icon: "file", target: "missing_documents" },
      { id: "ready_for_closure", label: "Ready For Closure", value: counts?.readyForClosure ?? 0, note: "Review closure-ready orders", icon: "clipboard", target: "operations_dashboard" },
      { id: "low_stock", label: "Low Stock", value: counts?.lowStockItems ?? 0, note: "Open low-stock list", icon: "shield", target: "low_stock" },
      { id: "pending_delivery", label: "Pending Delivery", value: counts?.pendingDeliveries ?? 0, note: "Open delivery challans", icon: "truck", target: "delivery_challans" },
      { id: "items_in_stock", label: "Items In Stock", value: counts?.itemsInStock ?? 0, note: "Verify stock summary", icon: "box", target: "stock_summary" },
      { id: "items_issued", label: "Items Issued", value: counts?.itemsIssued ?? 0, note: "Verify stock ledger", icon: "truck", target: "stock_ledger" },
      { id: "returns", label: "Returns", value: counts?.returnedItems ?? 0, note: "Open return register", icon: "undo", target: "stock_returns" }
    ],
    accounts: [
      { id: "cash_bank_balance", label: "Cash/Bank Balance", value: formatCurrency(counts?.cashBankBalance ?? counts?.amountReceived ?? 0), note: "Open cash book", icon: "card", target: "cash_book" },
      { id: "receivables", label: "Receivables", value: formatCurrency(counts?.outstanding ?? 0), note: "Open receivables", icon: "wallet", target: "bill_wise_receivables" },
      { id: "payables", label: "Payables", value: formatCurrency(counts?.supplierPayables ?? counts?.payables ?? 0), note: "Open payables", icon: "truck", target: "payables" },
      { id: "unposted_vouchers", label: "Unposted Vouchers", value: counts?.unpostedVouchers ?? counts?.draftVouchers ?? 0, note: "Open posting queue", icon: "receipt", target: "posting_control" },
      { id: "pending_approvals", label: "Pending Approvals", value: counts?.pendingApprovals ?? 0, note: "Open approval queue", icon: "shield", target: "approval_queue" },
      { id: "gst_position", label: "GST Position", value: formatCurrency(counts?.gstPayable ?? 0), note: "Open GST summary", icon: "receipt", target: "gst" },
      { id: "tds_receivable", label: "TDS Receivable", value: formatCurrency(counts?.tdsReceivable ?? 0), note: "Open TDS register", icon: "receipt", target: "tds_register" },
      { id: "trial_balance_status", label: "Trial Balance", value: "Balanced", note: "Verify trial balance", icon: "clipboard", target: "trial_balance" },
      { id: "day_book", label: "Day Book", value: counts?.postedVouchers ?? 0, note: "Posted voucher view", icon: "book", target: "day_book" },
      { id: "profit_loss", label: "Profit & Loss", value: formatCurrency(counts?.totalProfit ?? 0), note: "Open P&L", icon: "trend", target: "profit_loss" },
      { id: "balance_sheet", label: "Balance Sheet", value: "Open", note: "Review financial position", icon: "building", target: "balance_sheet" }
    ]
  };

  const modeCards = dashboardCards[dashboardMode] || dashboardCards.executive;
  const defaultVisible = dashboardDefaultVisible[dashboardMode] || dashboardDefaultVisible.executive;
  const modeHiddenCards = hiddenCards[dashboardMode] || modeCards.filter((card) => !defaultVisible.includes(card.id)).map((card) => card.id);
  const sortedCards = [...modeCards].sort((left, right) => {
    const leftPinned = pinnedCards.includes(`${dashboardMode}:${left.id}`) ? 0 : 1;
    const rightPinned = pinnedCards.includes(`${dashboardMode}:${right.id}`) ? 0 : 1;
    return leftPinned - rightPinned;
  });
  const visibleCards = sortedCards.filter((card) => !modeHiddenCards.includes(card.id));

  function changeMode(mode) {
    setDashboardMode(mode);
    setCustomizing(false);
  }

  function toggleCardVisibility(cardId) {
    setHiddenCards((current) => {
      const currentHidden = current[dashboardMode] || modeCards.filter((card) => !defaultVisible.includes(card.id)).map((card) => card.id);
      const nextHidden = currentHidden.includes(cardId) ? currentHidden.filter((id) => id !== cardId) : [...currentHidden, cardId];
      return { ...current, [dashboardMode]: nextHidden };
    });
  }

  function togglePinnedCard(cardId) {
    const pinKey = `${dashboardMode}:${cardId}`;
    setPinnedCards((current) => current.includes(pinKey) ? current.filter((item) => item !== pinKey) : [...current, pinKey]);
  }

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

      <DashboardViewToolbar
        dashboardMode={dashboardMode}
        dashboardModeLabels={dashboardModeLabels}
        customizing={customizing}
        onChangeMode={changeMode}
        onToggleCustomize={() => setCustomizing((current) => !current)}
      />

      {customizing && (
        <DashboardCustomizer
          dashboardMode={dashboardMode}
          dashboardModeLabels={dashboardModeLabels}
          modeCards={modeCards}
          modeHiddenCards={modeHiddenCards}
          pinnedCards={pinnedCards}
          onToggleCardVisibility={toggleCardVisibility}
          onTogglePinnedCard={togglePinnedCard}
        />
      )}

      <DashboardCardGrid
        dashboardMode={dashboardMode}
        visibleCards={visibleCards}
        pinnedCards={pinnedCards}
        onOpenCard={setView}
        onTogglePinnedCard={togglePinnedCard}
      />

      <DashboardSetupChecklist checklist={checklist} onOpen={setView} />
    </section>
  );
}
