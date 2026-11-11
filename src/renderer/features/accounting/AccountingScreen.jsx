import { useEffect, useState } from "react";
import { formatCurrency, exportRows } from "../../utils/formatters.js";
import { scrollToSection } from "../../utils/navigationScroll.js";
import { requestPrintPreview } from "../../utils/uiHelpers.js";
import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { EmptyState, Icon } from "../../components/common.jsx";
import { Field, getPresetDates, ReportActionButtons, ReportDateFilters, ReportToolbar, SelectBox } from "../../components/forms/index.jsx";
import { DrilldownPanel } from "../../components/panels/DrilldownPanel.jsx";
import { AccountingControlReportTable, FinancialControlOverview, LockedYearControlNotice } from "../../components/accountingControls/index.jsx";
import { buildReadOnlyReportFamilyConfig, isReadOnlyReportFamilyView, ReadOnlyReportFamilyTable } from "../../screens/ReadOnlyReportFamilyScreen.jsx";
import { accountingTableConfig } from "./accountingTableConfig.js";
import { buildAllocationCorrectionForm, allocationTargetOptions, formatCell } from "./accountingHelpers.js";
import { confirmAction, reversalConfirmOptions, postConfirmOptions, approveConfirmOptions } from "../../utils/actionUtils.js";
import { AccountMappingReviewPanel } from "./accountMappings/AccountMappingReviewPanel.jsx";
import { canManageAccountMappings } from "./accountMappings/accountMappingOptions.js";
import { FinancialYearInputDialog, OpeningBalanceInputDialog } from "./components/AccountingInputDialogs.jsx";

export function AccountingScreen({ view, notify, role, companyContext, onNavigate, api }) {
  const today = new Date().toISOString().slice(0, 10);
  const currentFinancialYear = getPresetDates("this_fy");
  const [filters, setFilters] = useState({ company_id: companyContext?.company_id || "", date_from: currentFinancialYear.date_from, date_to: today });
  const [data, setData] = useState(null);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [drilldown, setDrilldown] = useState(null);
  const [allocationCorrection, setAllocationCorrection] = useState(null);
  const [allocationCorrectionForm, setAllocationCorrectionForm] = useState(buildAllocationCorrectionForm("receipt"));
  const [financialYearDialogOpen, setFinancialYearDialogOpen] = useState(false);
  const [openingBalanceDialog, setOpeningBalanceDialog] = useState(null);
  const canPostControls = roleAllowsAction(role, "voucher");
  const canApproveControls = roleAllowsAction(role, "approve");
  const canManagePeriods = roleAllowsAction(role, "approve");
  const canManageMappings = canManageAccountMappings(role);

  async function load() {
    try {
      const effectiveFilters = { ...filters, company_id: companyContext?.company_id || filters.company_id };
      const result = await api.getAccountingData(effectiveFilters);
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
  }, [filters.company_id, filters.date_from, filters.date_to, companyContext?.company_id, companyContext?.company_scope]);

  const readOnlyReportFamily = isReadOnlyReportFamilyView(view);
  const config = readOnlyReportFamily
    ? buildReadOnlyReportFamilyConfig(view, data || {})
    : accountingTableConfig(view, data || {});
  const rows = config.rows || [];
  const accountingControlPanelViews = ["posting_control", "approval_queue", "financial_control", "audit_log"];
  const isAccountingControlPanelView = accountingControlPanelViews.includes(view);
  const voucherLines = selectedVoucher ? (data?.voucherLines || []).filter((line) => Number(line.voucher_id) === Number(selectedVoucher.id)) : [];

  async function handleReverse(row) {
    if (row.status === "Reversed" || row.source_module === "voucher_reversal") {
      notify("This voucher is already part of a reversal chain", "error");
      return;
    }
    const confirmed = await confirmAction({
      ...reversalConfirmOptions("vouchers", row.id),
      message: "Are you sure you want to proceed? This voucher may affect ledgers, trial balance, GST, receivables, payables and reports."
    });
    if (!confirmed.confirmed) return;
    try {
      await api.reverseVoucher(row.id, confirmed.reason);
      notify("Reversal voucher posted");
      setSelectedVoucher(null);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handlePostingAction(action, row) {
    try {
      if (action === "post" || action === "retry") {
        if (action === "retry" && row.retry_available !== "Yes") {
          notify("Retry is available only for safe failed posting records.", "error");
          return;
        }
        const confirmed = await confirmAction({
          ...postConfirmOptions(row.module, row.record_id),
          message: action === "retry"
            ? "Retry posting this failed record? Confirm only after reviewing the source record and posting error."
            : "Do you want to post this voucher to the books of accounts?",
          cancelLabel: "No, Review Again"
        });
        if (!confirmed.confirmed) return;
        await api.postTransaction(row.module, row.record_id);
        notify(action === "retry" ? `${row.reference} posting retried` : `${row.reference} posted`);
      } else if (action === "approve") {
        const confirmed = await confirmAction(approveConfirmOptions(row.module, row.record_id));
        if (!confirmed.confirmed) return;
        await api.approveTransaction(row.module, row.record_id, null, "Approved from Posting Control");
        notify(`${row.reference} approved`);
      } else if (action === "error") {
        await confirmAction({
          mode: "normal",
          title: "Posting Error",
          message: row.posting_error || "No posting error recorded",
          confirmLabel: "OK",
          hideCancel: true,
          moduleName: row.module,
          recordId: row.record_id
        });
      }
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleFinancialYearStatus(row, status) {
    try {
      const confirmed = await confirmAction({
        mode: "warning",
        title: `${status} Financial Year`,
        message: status === "Closed"
          ? "Closing the financial year will restrict posting and editing for this period. Do you want to continue?"
          : `Do you want to mark this financial year as ${status}?`,
        confirmLabel: status === "Closed" ? "Yes, Close Year" : "Yes, Proceed",
        cancelLabel: "No, Cancel",
        moduleName: "financial_years",
        recordId: row.id
      });
      if (!confirmed.confirmed) return;
      await api.updateFinancialYearStatus(row.id, status, null);
      notify(`Financial year marked ${status}`);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function handleAllocationAction(kind, row) {
    setAllocationCorrection({ kind, row });
    setAllocationCorrectionForm(buildAllocationCorrectionForm(kind, row));
  }

  async function submitAllocationCorrection(event) {
    event.preventDefault();
    if (!allocationCorrection) return;
    const { kind, row } = allocationCorrection;
    const reason = allocationCorrectionForm.reason.trim();
    const label = kind === "receipt" ? row.receipt_voucher : row.payment_voucher;
    if (!reason) {
      notify("Correction reason is required before changing an allocation", "error");
      return;
    }
    if (allocationCorrectionForm.action === "reallocate" && !allocationCorrectionForm.target_id) {
      notify(kind === "receipt" ? "Select the invoice to reallocate this receipt to" : "Select the purchase bill to reallocate this supplier payment to", "error");
      return;
    }
    const confirmed = await confirmAction({
      mode: "danger",
      title: allocationCorrectionForm.action === "reallocate" ? "Reallocate Entry" : "Unallocate Entry",
      message: allocationCorrectionForm.action === "reallocate"
        ? `Reallocate ${label}? This will reverse the current allocation and create a new controlled allocation.`
        : `Unallocate ${label}? This may affect receivable/payable reconciliation reports.`,
      confirmLabel: allocationCorrectionForm.action === "reallocate" ? "Yes, Reallocate" : "Yes, Unallocate",
      cancelLabel: "No, Cancel",
      moduleName: kind === "receipt" ? "payment_allocations" : "supplier_payment_allocations",
      recordId: row.id
    });
    if (!confirmed.confirmed) return;
    try {
      if (allocationCorrectionForm.action === "reallocate") {
        if (kind === "receipt") {
          await api.reallocateReceiptAllocation(row.id, {
            billing_id: allocationCorrectionForm.target_id,
            allocated_amount: Number(allocationCorrectionForm.allocated_amount || 0),
            tds_deducted: Number(allocationCorrectionForm.tds_deducted || 0),
            gst_tds_deducted: Number(allocationCorrectionForm.gst_tds_deducted || 0),
            other_deductions: Number(allocationCorrectionForm.other_deductions || 0),
            allow_excess: allocationCorrectionForm.allow_excess,
            remarks: reason,
            reason
          });
        } else {
          await api.reallocateSupplierPaymentAllocation(row.id, {
            procurement_id: allocationCorrectionForm.target_id,
            allocated_amount: Number(allocationCorrectionForm.allocated_amount || 0),
            allow_excess: allocationCorrectionForm.allow_excess,
            remarks: reason,
            reason
          });
        }
        notify("Allocation reallocated and audit trail updated");
      } else {
        if (kind === "receipt") {
          await api.unallocateReceiptAllocation(row.id, reason);
        } else {
          await api.unallocateSupplierPaymentAllocation(row.id, reason);
        }
        notify("Allocation removed and audit trail updated");
      }
      setAllocationCorrection(null);
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function handleAdvanceAdjustmentReverse(row) {
    const confirmed = await confirmAction({
      ...reversalConfirmOptions("advance_adjustments", row.id),
      message: `Reverse adjustment ${row.reference || row.id}?`
    });
    if (!confirmed.confirmed) return;
    try {
      await api.reverseAdvanceAdjustment(row.id, confirmed.reason, null);
      notify("Advance adjustment reversed");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function openDrilldown(row, mode = "account") {
    try {
      const payload = {
        company_id: filters.company_id,
        date_from: filters.date_from,
        date_to: filters.date_to
      };
      if (mode === "account") payload.account_id = row.account_id || row.id;
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

  function openPartyReconciliationDrill(row) {
    const id = row.id;
    const drillMap = {
      receivable: {
        title: "Department Receivable Reconciliation Drilldown",
        ledgerTitle: "Department Ledger Entries",
        ledgerRows: data?.partyLedger?.filter((entry) => entry.party_type === "department") || [],
        subledgerTitle: "Bill-wise Receivables",
        subledgerRows: data?.billWiseReceivables || [],
        relatedTitle: "Receipt Allocations",
        relatedRows: data?.paymentAllocations || []
      },
      payable: {
        title: "Supplier Payable Reconciliation Drilldown",
        ledgerTitle: "Supplier Ledger Entries",
        ledgerRows: data?.partyLedger?.filter((entry) => entry.party_type === "supplier") || [],
        subledgerTitle: "Bill-wise Payables",
        subledgerRows: data?.billWisePayables || [],
        relatedTitle: "Supplier Payment Allocations",
        relatedRows: data?.supplierPaymentAllocations || []
      },
      receipt_allocations: {
        title: "Receipt Allocation Reconciliation Drilldown",
        ledgerTitle: "Receipt Allocation Rows",
        ledgerRows: data?.paymentAllocations || [],
        subledgerTitle: "Unallocated Receipts",
        subledgerRows: data?.unallocatedReceipts || [],
        relatedTitle: "Advance Receipts",
        relatedRows: data?.advanceReceipts || []
      },
      supplier_allocations: {
        title: "Supplier Allocation Reconciliation Drilldown",
        ledgerTitle: "Supplier Allocation Rows",
        ledgerRows: data?.supplierPaymentAllocations || [],
        subledgerTitle: "Unallocated Supplier Payments",
        subledgerRows: data?.unallocatedSupplierPayments || [],
        relatedTitle: "Supplier Advances",
        relatedRows: data?.supplierAdvances || []
      }
    };
    const drill = drillMap[id] || drillMap.receivable;
    setDrilldown({ mode: "party_reconciliation", sourceRow: row, ...drill });
    notify("Party reconciliation drilldown opened");
    scrollToSection(".voucher-detail-panel", false);
  }

  function tableNameForControlRow(row) {
    const moduleName = String(row.table_name || row.module_name || row.source_module || row.module || "").toLowerCase();
    const map = {
      billing: "invoices",
      invoices: "invoices",
      procurement: "procurements",
      procurements: "procurements",
      receipt: "payments",
      payment: "payments",
      payments: "payments",
      supplier_payment: "supplier_payments",
      expense: "expense_entries",
      expense_entries: "expense_entries",
      financial_years: "financial_years",
      opening_balances: "opening_balances",
      credit_terms: "credit_terms",
      voucher_proposals: "voucher_proposals"
    };
    return map[moduleName] || moduleName || "";
  }

  function sourceRowsForControl(row) {
    const recordId = Number(row.record_id || row.source_id || row.id || 0);
    const sourceModule = String(row.source_module || row.module || row.module_name || "").toLowerCase();
    const datasets = {
      billing: data?.invoices || [],
      procurement: data?.procurements || [],
      receipt: data?.payments || [],
      payment: data?.payments || [],
      expense: data?.expenseEntries || [],
      financial_years: data?.financialYears || [],
      opening_balances: data?.openingBalances || [],
      credit_terms: data?.creditTerms || []
    };
    const sourceRows = datasets[sourceModule] || [];
    return recordId ? sourceRows.filter((item) => Number(item.id || item.record_id) === recordId) : sourceRows;
  }

  function voucherRowsForControl(row) {
    const voucherId = Number(row.voucher_id || row.opening_voucher_id || 0);
    const voucherNumber = row.voucher_number;
    return (data?.dayBook || []).filter((item) => (voucherId && Number(item.id) === voucherId) || (voucherNumber && item.voucher_number === voucherNumber));
  }

  function ledgerRowsForControl(row) {
    const voucherId = Number(row.voucher_id || row.opening_voucher_id || 0);
    const voucherNumber = row.voucher_number;
    const sourceModule = row.source_module;
    const sourceId = Number(row.record_id || row.source_id || 0);
    return (data?.ledger || []).filter((item) => (
      (voucherId && Number(item.voucher_id) === voucherId)
      || (voucherNumber && item.voucher_number === voucherNumber)
      || (sourceModule && sourceId && item.source_module === sourceModule && Number(item.source_id) === sourceId)
    ));
  }

  function auditRowsForControl(row) {
    const tableName = tableNameForControlRow(row);
    const recordId = Number(row.record_id || row.source_id || row.id || 0);
    return (data?.auditLog || []).filter((item) => {
      const tableMatches = tableName ? item.table_name === tableName : true;
      const recordMatches = recordId ? Number(item.record_id || 0) === recordId : true;
      return tableMatches && recordMatches;
    });
  }

  function controlEvidenceFor(row) {
    const map = {
      current_year: { title: "Financial Year Evidence", rows: data?.financialYears || [] },
      period: { title: "Selected Control Period", rows: [{ date_from: filters.date_from, date_to: filters.date_to, company_id: filters.company_id }] },
      trial: { title: "Trial Balance Evidence", rows: data?.trialBalance || [] },
      unposted: { title: "Posting Queue Evidence", rows: data?.postingControl || [] },
      drafts: { title: "Draft Transaction Evidence", rows: (data?.postingControl || []).filter((item) => item.posting_status === "Draft") },
      approval: { title: "Approval Queue Evidence", rows: data?.approvalQueue || [] },
      reversed: { title: "Reversal Audit Evidence", rows: (data?.auditLog || []).filter((item) => String(item.action || "").toLowerCase().includes("revers")) },
      closed: { title: "Closed / Locked Year Evidence", rows: (data?.financialYears || []).filter((item) => ["Closed", "Locked"].includes(item.status)) },
      locked: { title: "Locked Year Evidence", rows: (data?.financialYears || []).filter((item) => item.status === "Locked") },
      profit: { title: "Profit & Loss Evidence", rows: data?.profitLoss?.rows || [] },
      bs_diff: { title: "Balance Sheet Evidence", rows: data?.balanceSheet?.rows || [] },
      gst: { title: "GST Register Evidence", rows: [...(data?.gstRegisters?.output || []), ...(data?.gstRegisters?.input || [])] },
      tds: { title: "TDS Register Evidence", rows: data?.tdsRegisters || [] },
      party_recon: { title: "Party Reconciliation Evidence", rows: data?.partyReconciliation || [] },
      rec_overdue: { title: "Receivable Ageing Evidence", rows: data?.receivableAgeing || [] },
      pay_overdue: { title: "Payable Ageing Evidence", rows: data?.payableAgeing || [] }
    };
    return map[row.id] || { title: "Control Evidence", rows: [] };
  }

  function openFinancialControlDrill(row) {
    const evidence = row.control ? controlEvidenceFor(row) : null;
    setDrilldown({
      mode: "control_evidence",
      title: row.control || row.reference || row.module_name || "Financial Control Evidence",
      sourceRow: row,
      sourceTitle: evidence?.title || "Source Record",
      sourceRows: evidence?.rows || sourceRowsForControl(row),
      voucherTitle: "Linked Vouchers",
      voucherRows: voucherRowsForControl(row),
      ledgerTitle: "Ledger Lines",
      ledgerRows: ledgerRowsForControl(row),
      auditTitle: "Audit Trail",
      auditRows: auditRowsForControl(row)
    });
    notify("Control drilldown opened");
    scrollToSection(".voucher-detail-panel", false);
  }

  async function handleDrilldownInlineAction(action, reason) {
    try {
      if (action.actionType === "reverse") {
        const voucherId = action.voucherId;
        if (!voucherId) throw new Error("No voucher ID available for reversal");
        await api.reverseVoucher(voucherId, reason);
        notify("Voucher reversed successfully. A reversal voucher was created.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "unallocate_receipt") {
        const allocationId = action.allocationId;
        if (!allocationId) throw new Error("No allocation ID available");
        await api.unallocateReceiptAllocation(allocationId, reason);
        notify("Receipt allocation removed. Outstanding balance updated.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "unallocate_supplier") {
        const allocationId = action.allocationId;
        if (!allocationId) throw new Error("No allocation ID available");
        await api.unallocateSupplierPaymentAllocation(allocationId, reason);
        notify("Supplier payment allocation removed. Balance due updated.");
        setDrilldown(null);
        load();
      } else if (action.actionType === "reverse_advance") {
        const adjustmentId = action.adjustmentId;
        if (!adjustmentId) throw new Error("No adjustment ID available");
        await api.reverseAdvanceAdjustment(adjustmentId, reason, null);
        notify("Advance adjustment reversed.");
        setDrilldown(null);
        load();
      }
    } catch (error) {
      notify(error.message, "error");
    }
  }

  async function closeYearFromPrompt() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before closing a financial year", "error");
      return;
    }
    const openYears = data?.financialYears || [];
    if (openYears.length < 2) {
      notify("At least two financial years are required", "error");
      return;
    }
    const from = openYears[1] || openYears[0];
    const to = openYears[0];
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Close Financial Year",
      message: "Closing the financial year will restrict posting and editing for this period. Do you want to continue?",
      confirmLabel: "Yes, Close Year",
      cancelLabel: "No, Cancel",
      moduleName: "financial_years",
      recordId: from.id
    });
    if (!confirmed.confirmed) return;
    try {
      await api.closeFinancialYear({ company_id: companyContext.company_id, from_financial_year_id: from.id, to_financial_year_id: to.id });
      notify("Year-end closing completed");
      load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openFinancialYearDialog() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before creating a financial year", "error");
      return;
    }
    setFinancialYearDialogOpen(true);
  }

  async function createFinancialYear(form) {
    const name = form.financial_year_name.trim();
    if (!name || !form.start_date || !form.end_date) {
      notify("Financial year name, start date and end date are required", "error");
      return;
    }
    if (form.end_date < form.start_date) {
      notify("Financial year end date must be on or after its start date", "error");
      return;
    }
    try {
      await api.createFinancialYear({
        company_id: companyContext.company_id,
        financial_year_name: name,
        start_date: form.start_date,
        end_date: form.end_date,
        status: "Open"
      });
      notify("Financial year created");
      setFinancialYearDialogOpen(false);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function openOpeningBalancePanel() {
    if (!companyContext?.company_id) {
      notify("Select Current Company before posting opening balance", "error");
      return;
    }
    const year = data?.financialYears?.find((row) => row.status === "Open");
    const account = data?.accounts?.[0];
    if (!year || !account) {
      notify("Open financial year and account are required", "error");
      return;
    }
    setOpeningBalanceDialog({ account, year });
  }

  async function createOpeningBalance(amountValue) {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Opening debit amount must be greater than zero", "error");
      return;
    }
    const { account, year } = openingBalanceDialog || {};
    if (!account?.id || !year?.id) {
      notify("The selected account or financial year is no longer available. Reopen Add Opening and try again.", "error");
      return;
    }
    setOpeningBalanceDialog(null);
    const confirmed = await confirmAction({
      ...postConfirmOptions("opening_balances", account.id),
      message: "Do you want to post this opening balance? Once posted, it may affect trial balance and financial statements."
    });
    if (!confirmed.confirmed) return;
    try {
      await api.createOpeningBalance({
        company_id: companyContext?.company_id || filters.company_id,
        financial_year_id: year.id,
        balance_type: "Account",
        account_id: account.id,
        opening_debit: amount,
        opening_credit: 0,
        remarks: "Opening balance entered from control screen"
      });
      notify("Opening balance voucher posted");
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  return (
    <section className="panel settings-panel report-panel">
      <ReportToolbar title={config.title} note={`${rows.length} row(s)`} className="accounting-toolbar">
          <ReportDateFilters
            companyId={filters.company_id}
            companies={data?.companies || []}
            dateFrom={filters.date_from}
            dateTo={filters.date_to}
            onCompanyChange={(company_id) => setFilters((prev) => ({ ...prev, company_id }))}
            onDateFromChange={(date_from) => setFilters((prev) => ({ ...prev, date_from }))}
            onDateToChange={(date_to) => setFilters((prev) => ({ ...prev, date_to }))}
            onPresetChange={(date_from, date_to) => setFilters((prev) => ({ ...prev, date_from, date_to }))}
          />
          <ReportActionButtons onExport={() => exportRows(config.title, rows)} onPrint={requestPrintPreview} />
          {view === "financial_years" && <button className="ghost-btn" onClick={openFinancialYearDialog} disabled={!canManagePeriods}>New FY</button>}
          {view === "opening_balances" && <button className="ghost-btn" onClick={openOpeningBalancePanel} disabled={!canPostControls} data-action-key="opening_balances.add_opening">Add Opening</button>}
          {view === "year_end_closing" && <button className="ghost-btn" onClick={closeYearFromPrompt} disabled={!canManagePeriods}>Close Year</button>}
      </ReportToolbar>
      {view === "financial_control" && <FinancialControlOverview data={data || {}} onDrill={openFinancialControlDrill} />}
      {["financial_years", "year_end_closing", "carry_forward", "opening_balances"].includes(view) && <LockedYearControlNotice data={data || {}} />}
      {view === "chart_accounts" && canManageMappings ? (
        <AccountMappingReviewPanel
          api={api}
          companyId={companyContext?.company_id || filters.company_id}
          asOfDate={filters.date_to}
          role={role}
          notify={notify}
          onDrillAccount={(row) => openDrilldown(row, "account")}
        />
      ) : readOnlyReportFamily ? (
        <ReadOnlyReportFamilyTable
          view={view}
          data={data || {}}
          config={config}
          rows={rows}
          onDrillAccount={(row) => openDrilldown(row, "account")}
          onDrillVoucher={(row) => openDrilldown(row, "voucher")}
          onDrillSource={(row) => openDrilldown(row, "source")}
          onPartyReconciliationDrill={openPartyReconciliationDrill}
          onNavigate={onNavigate}
        />
      ) : isAccountingControlPanelView ? (
        <AccountingControlReportTable
          config={config}
          rows={rows}
          formatCell={formatCell}
          canApproveControls={canApproveControls}
          canPostControls={canPostControls}
          handlePostingAction={handlePostingAction}
          openFinancialControlDrill={openFinancialControlDrill}
        />
      ) : rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || row.account_code || row.voucher_line_id || index}>
                  {config.columns.map((column) => (
                    <td key={column.key}>
                      {column.type === "actions" && view === "day_book" ? (
                        <div className="row-actions">
                          <button className="icon-btn" type="button" title="View voucher lines" onClick={() => setSelectedVoucher(row)}>
                            <Icon name="file" />
                          </button>
                          <button className="icon-btn danger" type="button" title="Reverse voucher" onClick={() => handleReverse(row)} disabled={row.status === "Reversed" || row.source_module === "voucher_reversal"}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : column.type === "drill_account" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "account")}>Ledger</button>
                      ) : column.type === "drill_voucher" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "voucher")}>Voucher</button>
                      ) : column.type === "drill_source" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openDrilldown(row, "source")} disabled={!row.source_module || !row.source_id}>Source</button>
                      ) : column.type === "posting_actions" ? (
                        <div className="row-actions">
                          <button type="button" title={canApproveControls ? "Approve" : "Approval requires approver role"} onClick={() => handlePostingAction("approve", row)} disabled={!canApproveControls || row.approval_status === "Approved" || row.posting_status === "Posted"}><Icon name="shield" /></button>
                          <button type="button" title={canPostControls ? "Post" : "Posting requires accounting role"} onClick={() => handlePostingAction("post", row)} disabled={!canPostControls || row.posting_status === "Posted" || row.posting_status === "Reversed"}><Icon name="receipt" /></button>
                          <button type="button" title={row.retry_available === "Yes" ? "Retry safe failed posting" : "Retry only appears for failed posting records"} onClick={() => handlePostingAction("retry", row)} disabled={!canPostControls || row.retry_available !== "Yes"}><Icon name="undo" /></button>
                          <button type="button" title="View Error" onClick={() => handlePostingAction("error", row)} disabled={!row.posting_error}><Icon name="file" /></button>
                          <button type="button" title="Control drilldown" onClick={() => openFinancialControlDrill(row)}><Icon name="grid" /></button>
                        </div>
                      ) : column.type === "fy_actions" ? (
                        <div className="row-actions">
                          <button type="button" title={canManagePeriods ? "Close year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Closed")} disabled={!canManagePeriods || row.status !== "Open"}><Icon name="lock" /></button>
                          <button type="button" title={canManagePeriods ? "Reopen year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Open")} disabled={!canManagePeriods || row.status === "Open"}><Icon name="undo" /></button>
                          <button type="button" title={canManagePeriods ? "Lock year" : "Financial year action requires approver role"} onClick={() => handleFinancialYearStatus(row, "Locked")} disabled={!canManagePeriods || row.status === "Locked"}><Icon name="shield" /></button>
                          <button type="button" title="Control drilldown" onClick={() => openFinancialControlDrill(row)}><Icon name="grid" /></button>
                        </div>
                      ) : column.type === "allocation_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Unallocate / reallocate" onClick={() => handleAllocationAction(view === "payment_allocations" ? "receipt" : "supplier", row)}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : column.type === "party_reconciliation_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Drill into ledger and sub-ledger rows" onClick={() => openPartyReconciliationDrill(row)}>
                            <Icon name="file" />
                          </button>
                        </div>
                      ) : column.type === "control_drill" ? (
                        <button className="ghost-btn small-btn" type="button" onClick={() => openFinancialControlDrill(row)}>Drill</button>
                      ) : column.type === "advance_adjustment_actions" ? (
                        <div className="row-actions">
                          <button type="button" title="Reverse adjustment" onClick={() => handleAdvanceAdjustmentReverse(row)} disabled={row.status === "Reversed"}>
                            <Icon name="undo" />
                          </button>
                        </div>
                      ) : formatCell(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No accounting data" note="Post vouchers or run seed data to populate this view." />}
      {allocationCorrection && (
        <div className="voucher-detail-panel">
          <div className="panel-head">
            <div>
              <h3>{allocationCorrection.kind === "receipt" ? "Receipt Allocation Correction" : "Supplier Payment Allocation Correction"}</h3>
              <p>Use this controlled workflow to unallocate or reallocate without editing posted accounting entries directly.</p>
            </div>
            <button className="ghost-btn" type="button" onClick={() => setAllocationCorrection(null)}>Close</button>
          </div>
          <div className="workflow-note">
            <strong>{allocationCorrection.kind === "receipt" ? allocationCorrection.row.receipt_voucher : allocationCorrection.row.payment_voucher}</strong>
            <span>
              Current allocation: {formatCurrency(Number(allocationCorrection.row.allocated_amount || 0))}
              {allocationCorrection.kind === "receipt" ? ` | TDS ${formatCurrency(Number(allocationCorrection.row.tds_deducted || 0))} | GST TDS ${formatCurrency(Number(allocationCorrection.row.gst_tds_deducted || 0))}` : ""}
              {allocationCorrection.row.allocation_status ? <span className="badge" style={{ marginLeft: 8 }}>{allocationCorrection.row.allocation_status}</span> : null}
            </span>
            <small>Reason is mandatory and the action is written to allocation audit. {allocationCorrection.kind === "receipt" ? "Unallocation restores the invoice balance and removes the receipt-invoice link." : "Unallocation restores the purchase bill balance and removes the payment-bill link."}</small>
          </div>
          <form className="form-grid" onSubmit={submitAllocationCorrection}>
            <SelectBox
              label="Correction Action"
              value={allocationCorrectionForm.action}
              onChange={(action) => setAllocationCorrectionForm((current) => ({ ...current, action }))}
              options={[
                ["unallocate", "Unallocate only"],
                ["reallocate", "Reallocate to another invoice / bill"]
              ]}
            />
            {allocationCorrectionForm.action === "reallocate" && (
              <>
                <SelectBox
                  label={allocationCorrection.kind === "receipt" ? "Target Invoice" : "Target Purchase Bill"}
                  value={allocationCorrectionForm.target_id}
                  onChange={(target_id) => setAllocationCorrectionForm((current) => ({ ...current, target_id }))}
                  options={allocationTargetOptions(allocationCorrection.kind, data || {})}
                />
                <Field
                  label="Allocated Amount"
                  type="number"
                  value={allocationCorrectionForm.allocated_amount}
                  onChange={(allocated_amount) => setAllocationCorrectionForm((current) => ({ ...current, allocated_amount }))}
                />
                {allocationCorrection.kind === "receipt" && (
                  <>
                    <Field
                      label="TDS Deducted"
                      type="number"
                      value={allocationCorrectionForm.tds_deducted}
                      onChange={(tds_deducted) => setAllocationCorrectionForm((current) => ({ ...current, tds_deducted }))}
                    />
                    <Field
                      label="GST TDS Deducted"
                      type="number"
                      value={allocationCorrectionForm.gst_tds_deducted}
                      onChange={(gst_tds_deducted) => setAllocationCorrectionForm((current) => ({ ...current, gst_tds_deducted }))}
                    />
                    <Field
                      label="Other Deductions"
                      type="number"
                      value={allocationCorrectionForm.other_deductions}
                      onChange={(other_deductions) => setAllocationCorrectionForm((current) => ({ ...current, other_deductions }))}
                    />
                  </>
                )}
                <label className="checkbox-line">
                  <input
                    type="checkbox"
                    checked={allocationCorrectionForm.allow_excess}
                    onChange={(event) => setAllocationCorrectionForm((current) => ({ ...current, allow_excess: event.target.checked }))}
                  />
                  Allow excess allocation after review
                </label>
              </>
            )}
            <Field
              label="Correction Reason"
              type="textarea"
              value={allocationCorrectionForm.reason}
              onChange={(reason) => setAllocationCorrectionForm((current) => ({ ...current, reason }))}
            />
            <div className="form-actions">
              <button className="ghost-btn" type="button" onClick={() => setAllocationCorrection(null)}>Cancel</button>
              <button className="primary-btn" type="submit">
                {allocationCorrectionForm.action === "reallocate" ? "Confirm Reallocation" : "Confirm Unallocation"}
              </button>
            </div>
          </form>
        </div>
      )}
      {view === "day_book" && selectedVoucher && (
        <div className="voucher-detail-panel">
          <div>
            <h3>{selectedVoucher.voucher_number} - {selectedVoucher.voucher_type}</h3>
            <p>{selectedVoucher.narration || "No narration"}</p>
          </div>
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                {voucherLines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.account_code} - {line.account_name}</td>
                    <td>{formatCurrency(Number(line.debit || 0))}</td>
                    <td>{formatCurrency(Number(line.credit || 0))}</td>
                    <td>{line.narration || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {drilldown && <DrilldownPanel drilldown={drilldown} onClose={() => setDrilldown(null)} onNavigate={onNavigate} onInlineAction={handleDrilldownInlineAction} notify={notify} onDrillVoucher={(row) => openDrilldown(row, "voucher")} />}
      {financialYearDialogOpen && (
        <FinancialYearInputDialog onClose={() => setFinancialYearDialogOpen(false)} onSubmit={createFinancialYear} />
      )}
      {openingBalanceDialog && (
        <OpeningBalanceInputDialog
          account={openingBalanceDialog.account}
          financialYear={openingBalanceDialog.year}
          onClose={() => setOpeningBalanceDialog(null)}
          onSubmit={createOpeningBalance}
        />
      )}
    </section>
  );
}
