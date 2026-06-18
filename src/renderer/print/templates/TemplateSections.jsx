import React from "react";
import { firstTable, hasTemplateData, pickFields } from "../printUtils.js";

function DocumentTemplate({ title, purpose, preview, data, fieldHints = [], tableTitle = "Line Details" }) {
  const highlightedFields = fieldHints.length ? pickFields(data, fieldHints) : [];
  const fields = highlightedFields.length ? highlightedFields : (data.fields || []).slice(0, 18);
  const table = firstTable(data);
  return (
    <section className="certified-print-template">
      <div className="certified-print-banner">
        <span>GII GeM ERP Certified Print Template</span>
        <strong>{title}</strong>
        <small>{purpose}</small>
      </div>
      {!hasTemplateData(data) && <MissingData warnings={data.warnings} />}
      <section className="certified-print-meta">
        <div>
          <span>Source Screen</span>
          <strong>{preview.title || "GII GeM ERP"}</strong>
        </div>
        <div>
          <span>Generated At</span>
          <strong>{preview.generatedAt || "-"}</strong>
        </div>
        <div>
          <span>Navigation</span>
          <strong>{preview.breadcrumb || "-"}</strong>
        </div>
      </section>
      <FieldGrid title="Document Details" fields={fields} />
      {table ? <DataTable title={table.heading || tableTitle} table={table} /> : <MissingData warnings={["No line-item or report table was loaded for this template."]} />}
      {(data.tables || []).slice(1, 3).map((extraTable) => <DataTable key={extraTable.heading} title={extraTable.heading} table={extraTable} compact />)}
      <section className="certified-print-note">
        <strong>Certification note</strong>
        <p>This print is generated from currently loaded ERP data. Re-open the source record/report and refresh before printing final statutory or operational documents.</p>
      </section>
    </section>
  );
}

function FieldGrid({ title, fields }) {
  if (!fields?.length) return <MissingData warnings={["No document header fields were available on the loaded screen."]} />;
  return (
    <section className="certified-print-section">
      <h2>{title}</h2>
      <div className="certified-print-field-grid">
        {fields.map((field, index) => (
          <div key={`${field.label}-${index}`}>
            <span>{field.label}</span>
            <strong>{field.value || "-"}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataTable({ title, table, compact = false }) {
  const headers = table.headers?.length ? table.headers : table.rows?.[0]?.map((_, index) => `Column ${index + 1}`) || [];
  return (
    <section className={`certified-print-section ${compact ? "compact" : ""}`}>
      <h2>{title}</h2>
      <table className="certified-print-table">
        <thead>
          <tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {(table.rows || []).length ? table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{headers.map((_, cellIndex) => <td key={cellIndex}>{row[cellIndex] || "-"}</td>)}</tr>
          )) : (
            <tr><td colSpan={Math.max(headers.length, 1)}>No rows loaded for this table.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function MissingData({ warnings = [] }) {
  return (
    <section className="certified-print-missing">
      <strong>Missing loaded data</strong>
      {(warnings.length ? warnings : ["The selected template needs a loaded record or report."]).map((warning) => <p key={warning}>{warning}</p>)}
    </section>
  );
}

export { DataTable, DocumentTemplate, FieldGrid, MissingData };
