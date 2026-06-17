import React from "react";
import { EmptyState, Icon } from "../components/common.jsx";
import { formatCurrency } from "../utils/formatters.js";

export function BankRowsTable({ rows, onMatch, matchReport = false }) {
  if (!rows?.length) return <EmptyState title="No bank rows" note="Upload or select a statement import to begin review." />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Narration / Reference</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>UTR</th>
            <th>Status</th>
            <th>Match</th>
            {!matchReport && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `${row.duplicate_key}-${index}`}>
              <td>{row.transaction_date || row.matched_at}</td>
              <td><strong>{row.narration || row.matched_reference}</strong></td>
              <td>{formatCurrency(row.debit || 0)}</td>
              <td>{formatCurrency(row.credit || 0)}</td>
              <td>{row.utr || row.matched_module || "-"}</td>
              <td><span className={`status-pill ${String(row.validation_status || row.status || "Draft").toLowerCase().replaceAll(" ", "-")}`}>{row.validation_status || row.status || "Draft"}</span></td>
              <td>{row.matched_reference || row.match_status || "-"} {row.matched_score || row.confidence_score ? `(${row.matched_score || row.confidence_score}%)` : ""}</td>
              {!matchReport && <td><button className="icon-btn" type="button" title="Manual match" onClick={() => onMatch?.(row)}><Icon name="edit" /></button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
