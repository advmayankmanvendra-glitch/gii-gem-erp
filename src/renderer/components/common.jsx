import React from "react";
import { formatCurrency } from "../utils/formatters.js";

export function IntelligenceCard({ title, note, children }) {
  return (
    <section className="intelligence-card">
      <div>
        <h3>{title}</h3>
        {note && <p>{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function MetricRows({ rows }) {
  return (
    <div className="metric-rows">
      {rows.map(([label, value]) => (
        <span key={label}><small>{label}</small><strong>{value}</strong></span>
      ))}
    </div>
  );
}

export function MiniDataTable({ columns, rows, emptyTitle }) {
  if (!rows.length) return <EmptyState title={emptyTitle} note="Nothing is pending for the current selection." />;
  return (
    <div className="table-wrap mini-data-table">
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 8).map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SummaryTable({ title, rows, columns }) {
  const plainNumberColumns = new Set(["rows", "orders", "days", "total_rows", "valid_rows", "duplicate_rows", "error_rows", "available_reports"]);
  return (
    <section className="panel settings-panel report-panel">
      <div className="records-toolbar">
        <div>
          <h2>{title}</h2>
          <span>{rows.length} row(s)</span>
        </div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                {columns.map((column) => <th key={column}>{column.replaceAll("_", " ")}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const label = row.name || row.receipt_reference || row.payment_reference || row.invoice_number || row.purchase_invoice_number || row.party_name || row.department_name || row.supplier_name || `Row ${index + 1}`;
                return (
                <tr key={row.id || row.payment_id || row.supplier_payment_id || label}>
                  <td><strong>{label}</strong></td>
                  {columns.map((column) => <td key={column}>{typeof row[column] === "number" && !plainNumberColumns.has(column) ? formatCurrency(row[column]) : row[column]}</td>)}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No report data" note="Create Phase 2 transaction records to populate this report." />}
    </section>
  );
}

export function Metric({ label, value, note, icon, onClick }) {
  const Component = onClick ? "button" : "article";
  return (
    <Component className={`metric-card${onClick ? " metric-card-clickable" : ""}`} type={onClick ? "button" : undefined} onClick={onClick} title={onClick ? `Open ${label}` : undefined}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <Icon name={icon} />
    </Component>
  );
}

export function EmptyState({ title, note }) {
  return (
    <div className="empty-state">
      <Icon name="box" />
      <strong>{title}</strong>
      {note && <span>{note}</span>}
    </div>
  );
}

export function Icon({ name }) {
  const paths = {
    grid: <><path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M4 14h6v6H4z"/><path d="M14 14h6v6h-6z"/></>,
    building: <><path d="M4 21V5l8-3 8 3v16"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.8"/><path d="M16 3.2a4 4 0 0 1 0 7.6"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/></>,
    truck: <><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/></>,
    box: <><path d="M21 16V8l-9-5-9 5v8l9 5z"/><path d="m3.3 7.5 8.7 5 8.7-5"/><path d="M12 22V12"/></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    bank: <><path d="m3 10 9-7 9 7"/><path d="M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 21h16"/></>,
    clipboard: <><path d="M8 4h8v4H8z"/><path d="M6 6H5a2 2 0 0 0-2 2v12h18V8a2 2 0 0 0-2-2h-1"/></>,
    cart: <><path d="M3 3h2l2 12h11l3-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    file: <><path d="M14 2H6v20h12V8z"/><path d="M14 2v6h6"/></>,
    card: <><path d="M3 6h18v12H3z"/><path d="M3 10h18"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></>,
    rupee: <><path d="M6 4h12M6 8h12M6 12h6a4 4 0 0 0 0-8"/><path d="m6 12 8 8"/></>,
    wallet: <><path d="M3 7h18v12H3z"/><path d="M16 12h5v4h-5z"/><path d="M3 7l3-4h12l3 4"/></>,
    chart: <><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16V9M12 16V6M16 16v-4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a8 8 0 0 0 .1-6l2-1.5-2-3.5-2.4 1a8 8 0 0 0-5.2-3L11.5 0h-4l-.4 3a8 8 0 0 0-5.2 3l-2.4-1-2 3.5L.5 10a8 8 0 0 0 .1 6l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 5.2 3l.4 3h4l.4-3a8 8 0 0 0 5.2-3l2.4 1 2-3.5z" transform="scale(.75) translate(4 0)"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    calendar: <><path d="M4 5h16v16H4z"/><path d="M8 3v4M16 3v4M4 11h16"/></>,
    lock: <><path d="M6 10h12v10H6z"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    collapse: <><path d="M4 5h16v14H4z"/><path d="M9 5v14"/><path d="m15 9-3 3 3 3"/></>,
    edit: <><path d="m12 20 9-9-8-8-9 9v8z"/><path d="M18 6 6 18"/></>,
    undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-2"/></>,
    trash: <><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/></>,
    download: <><path d="M21 15v4H3v-4"/><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.8 2.8 0 0 1 5.2 1.4c0 2-2.7 2.1-2.7 4"/><path d="M12 18h.01"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}
