import React from "react";
import { EmptyState, Icon } from "../common.jsx";

export function MasterRecordsPanel({
  config,
  table,
  records,
  filters,
  onFiltersChange,
  loading,
  onBulkDeleteImportedItems,
  onEditRecord,
  onDeleteRecord,
  onSelectRow,
  displayPrimaryValue
}) {
  return (
    <section className="panel records-panel">
      <div className="records-toolbar">
        <div>
          <h2>{config.title}</h2>
          <span>{records.length} record(s)</span>
        </div>
        <div className="toolbar-controls">
          {table === "items" && (
            <button type="button" className="ghost-btn danger" onClick={onBulkDeleteImportedItems}>
              Bulk Delete Imported Items
            </button>
          )}
          <input
            data-search-input="true"
            placeholder="Search records"
            value={filters.search}
            onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
          />
          <select value={filters.status} onChange={(event) => onFiltersChange({ ...filters, status: event.target.value })}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      {loading ? (
        <EmptyState title="Loading records" />
      ) : records.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{config.fields[0][1]}</th>
                <th>{config.fields[1]?.[1] || "Details"}</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  data-record-id={record.id}
                  data-order-status={record.order_status || ""}
                  data-posting-status={record.posting_status || ""}
                  data-status={record.status || ""}
                  onClick={(event) => onSelectRow(event.currentTarget)}
                >
                  <td><strong>{displayPrimaryValue(record, config.primary)}</strong></td>
                  <td>{record[config.fields[1]?.[0]] || "-"}</td>
                  <td><span className={`status ${record.status}`}>{record.status}</span></td>
                  <td>{new Date(record.updated_at || record.created_at).toLocaleDateString("en-IN")}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => onEditRecord(record)} title="Edit"><Icon name="edit" /></button>
                      <button type="button" onClick={() => onDeleteRecord(record)} title="Delete"><Icon name="trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No records found" note="Add the first record from the form on the left." />
      )}
    </section>
  );
}
