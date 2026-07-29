import { useEffect, useMemo, useState } from "react";
import { EmptyState, Icon } from "../../../components/common.jsx";
import { Field, SelectBox } from "../../../components/forms/index.jsx";
import { confirmAction } from "../../../config/confirmations.js";
import { formChanged } from "../../../utils/formUtils.js";
import {
  accountGroupOptions,
  canManageAccountMappings
} from "./accountMappingOptions.js";

const STATUS_OPTIONS = [
  ["ALL", "All Mapping Statuses"],
  ["MAPPED", "Mapped"],
  ["UNMAPPED", "Unmapped"],
  ["MAPPING_INCOMPLETE", "Mapping Incomplete"],
  ["TYPE_MISMATCH", "Type Mismatch"],
  ["BALANCE_MISMATCH", "Normal Balance Mismatch"]
];

function statusLabel(status) {
  return {
    MAPPED: "Mapped",
    UNMAPPED: "Unmapped",
    MAPPING_INCOMPLETE: "Mapping Incomplete",
    TYPE_MISMATCH: "Type Mismatch",
    BALANCE_MISMATCH: "Normal Balance Mismatch"
  }[status] || status || "Review Required";
}

function statusClass(status) {
  return String(status || "review-required").toLowerCase().replaceAll("_", "-");
}

function statementLabel(row) {
  const statement = {
    BALANCE_SHEET: "Balance Sheet",
    PROFIT_AND_LOSS: "Profit and Loss"
  }[row.statement_code] || row.statement_code;
  return [statement, row.section_name].filter(Boolean).join(" / ") || "-";
}

export function AccountMappingReviewPanel({
  api,
  companyId,
  asOfDate,
  role,
  notify,
  onDrillAccount
}) {
  const [registry, setRegistry] = useState(null);
  const [rows, setRows] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    account_group_id: "",
    effective_from: asOfDate || "",
    change_reason: ""
  });

  const allowed = canManageAccountMappings(role);

  async function load() {
    if (!allowed || !companyId) return;
    setLoading(true);
    setLoadError("");
    try {
      const filters = {
        company_id: companyId,
        as_of_date: asOfDate
      };
      const [registryResult, classificationsResult, coverageResult] = await Promise.all([
        api.getAccountMappingRegistry(filters),
        api.getAccountClassifications(filters),
        api.getAccountMappingCoverage(filters)
      ]);
      setRegistry(registryResult);
      setRows(classificationsResult || []);
      setCoverage(coverageResult);
    } catch (error) {
      setLoadError(error.message || "Account mappings could not be loaded");
      notify(error.message || "Account mappings could not be loaded", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [companyId, asOfDate, allowed]);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "ALL" || row.mapping_status === statusFilter;
      const matchesQuery = !needle || [
        row.account_code,
        row.account_name,
        row.account_type,
        row.group_name,
        row.statement_code,
        row.section_name
      ].join(" ").toLowerCase().includes(needle);
      return matchesStatus && matchesQuery;
    });
  }, [rows, query, statusFilter]);

  const assignmentBaseline = selected ? {
    account_group_id: selected.account_group_id ? String(selected.account_group_id) : "",
    effective_from: asOfDate || "",
    change_reason: ""
  } : {
    account_group_id: "",
    effective_from: asOfDate || "",
    change_reason: ""
  };

  const groupOptions = selected ? accountGroupOptions(
    registry,
    selected.account_type,
    selected.normal_balance,
    assignmentForm.effective_from
  ) : [];

  function openAssignment(row) {
    setSelected(row);
    setAssignmentForm({
      account_group_id: row.account_group_id ? String(row.account_group_id) : "",
      effective_from: asOfDate || "",
      change_reason: ""
    });
  }

  async function closeAssignment() {
    if (!selected) return;
    if (!formChanged(assignmentForm, assignmentBaseline)) {
      setSelected(null);
      return;
    }
    const confirmed = await confirmAction({
      title: "Unsaved Account Mapping",
      message: "Exit without saving this account mapping?",
      confirmLabel: "Yes, Exit",
      cancelLabel: "No, Stay",
      mode: "warning"
    });
    if (confirmed.confirmed) setSelected(null);
  }

  async function saveAssignment(event) {
    event?.preventDefault();
    try {
      if (!assignmentForm.account_group_id) {
        throw new Error("Account Group is required. Select a compatible posting group.");
      }
      if (!assignmentForm.effective_from) {
        throw new Error("Effective Date is required for account mapping history.");
      }
      if (!assignmentForm.change_reason.trim()) {
        throw new Error("Change Reason is required. Explain why this account mapping is being assigned or changed.");
      }
      const result = await api.assignAccountGroup({
        company_id: companyId,
        account_id: selected.account_id,
        account_group_id: Number(assignmentForm.account_group_id),
        effective_from: assignmentForm.effective_from,
        change_reason: assignmentForm.change_reason.trim()
      });
      notify(result.message || "Account mapping saved");
      setSelected(null);
      await load();
    } catch (error) {
      notify(error.message, "error");
    }
  }

  if (!allowed) {
    return (
      <EmptyState
        title="Account mapping is restricted"
        note="An Administrator or Accountant must review financial-statement mappings."
      />
    );
  }

  if (!companyId) {
    return <EmptyState title="Select a company" note="Company context is required for account mapping." />;
  }

  if (loading) {
    return <EmptyState title="Loading account mappings" note="Checking governed account groups and financial-statement coverage." />;
  }

  if (loadError) {
    return (
      <div className="account-mapping-error" role="alert">
        <strong>Account mappings could not be loaded.</strong>
        <span>{loadError}</span>
        <button type="button" className="ghost-btn" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="account-mapping-review">
      <div className="account-mapping-summary" aria-label="Account mapping coverage">
        <span><small>Total Accounts</small><strong>{coverage?.total || 0}</strong></span>
        <span><small>Mapped</small><strong>{coverage?.MAPPED || 0}</strong></span>
        <span><small>Unmapped</small><strong>{coverage?.UNMAPPED || 0}</strong></span>
        <span><small>Needs Review</small><strong>{
          Number(coverage?.MAPPING_INCOMPLETE || 0)
          + Number(coverage?.TYPE_MISMATCH || 0)
          + Number(coverage?.BALANCE_MISMATCH || 0)
        }</strong></span>
      </div>

      <div className="account-mapping-filters">
        <label className="field">
          Search Accounts
          <input
            data-search-input="true"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Code, account, group or statement"
          />
        </label>
        <SelectBox
          label="Mapping Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
        />
        <span className="account-mapping-filter-count">{visibleRows.length} account(s)</span>
      </div>

      {visibleRows.length ? (
        <div className="table-wrap account-mapping-table">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th>Type</th>
                <th>Normal Balance</th>
                <th>Account Group</th>
                <th>Financial Statement</th>
                <th>Mapping Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.account_id}>
                  <td>{row.account_code}</td>
                  <td><strong>{row.account_name}</strong></td>
                  <td>{row.account_type}</td>
                  <td>{row.normal_balance}</td>
                  <td>{row.group_name || "-"}</td>
                  <td>{statementLabel(row)}</td>
                  <td>
                    <span className={`account-mapping-status ${statusClass(row.mapping_status)}`}>
                      {statusLabel(row.mapping_status)}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        title={row.mapping_status === "MAPPED" ? "Change account mapping" : "Assign account mapping"}
                        onClick={() => openAssignment(row)}
                      >
                        <Icon name="edit" />
                      </button>
                      <button
                        type="button"
                        title="Open account ledger"
                        onClick={() => onDrillAccount(row)}
                      >
                        <Icon name="book" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No accounts match these filters"
          note="Clear the search or select another mapping status."
        />
      )}

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="help-dialog account-mapping-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-mapping-dialog-title"
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key.toLowerCase() === "s") {
                event.preventDefault();
                saveAssignment(event);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                closeAssignment();
              }
            }}
          >
            <div className="panel-head">
              <div>
                <h2 id="account-mapping-dialog-title">
                  {selected.mapping_status === "MAPPED" ? "Change Account Mapping" : "Assign Account Mapping"}
                </h2>
                <p>{selected.account_code} - {selected.account_name}</p>
              </div>
              <button type="button" className="ghost-btn" onClick={closeAssignment}>Close</button>
            </div>
            <div className="account-mapping-context">
              <span><small>Account Type</small><strong>{selected.account_type}</strong></span>
              <span><small>Normal Balance</small><strong>{selected.normal_balance}</strong></span>
              <span><small>Current Group</small><strong>{selected.group_name || "Unmapped"}</strong></span>
            </div>
            <form className="form-grid" onSubmit={saveAssignment}>
              <SelectBox
                label="Account Group"
                value={assignmentForm.account_group_id}
                onChange={(account_group_id) => setAssignmentForm((current) => ({
                  ...current,
                  account_group_id
                }))}
                options={groupOptions}
              />
              <Field
                label="Effective Date"
                type="date"
                value={assignmentForm.effective_from}
                onChange={(effective_from) => setAssignmentForm((current) => ({
                  ...current,
                  effective_from,
                  account_group_id: ""
                }))}
              />
              <Field
                label="Change Reason"
                type="textarea"
                value={assignmentForm.change_reason}
                onChange={(change_reason) => setAssignmentForm((current) => ({
                  ...current,
                  change_reason
                }))}
              />
              <div className="form-actions">
                <button type="button" className="ghost-btn" onClick={closeAssignment}>Cancel</button>
                <button type="submit" className="primary-btn">Save Mapping</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

