import { EmptyState, Icon } from "../../../components/common.jsx";

export function SupplyOrderRecordsPanel({ config, records, references, filters, setFilters, loading, edit, remove, isRecordLocked, transactionPrimary, transactionAmount }) {
  return (
    <section id="supply-order-list-panel" className="panel records-panel supply-order-list-panel">
      <div className="records-toolbar">
        <div>
          <h2>{config.title}</h2>
          <span>{records.length} order record(s)</span>
        </div>
        <div className="toolbar-controls">
          <input data-search-input="true" placeholder="Search supply orders" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
        </div>
      </div>
      {loading ? <EmptyState title="Loading supply orders" /> : records.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Items</th>
                <th>Value</th>
                <th>Date</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => {
                const locked = isRecordLocked(record);
                return (
                  <tr key={record.id}>
                    <td><strong>{transactionPrimary(record, config)}</strong></td>
                    <td>{record.order_item_count || 0} item(s)</td>
                    <td>{transactionAmount(record)}</td>
                    <td>{record.order_date || "-"}</td>
                    <td><span className={`status ${(record.order_status || record.posting_status || "draft").toLowerCase().replaceAll(" ", "-")}`}>{record.order_status || record.posting_status || "Draft"}</span></td>
                    <td>
                      <div className="row-actions">
                        <button type="button" onClick={() => edit(record)} title={locked ? "Locked record" : "Edit"} disabled={locked}><Icon name="edit" /></button>
                        <button type="button" onClick={() => remove(record)} title={locked ? "Locked record" : "Delete"} disabled={locked}><Icon name="trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No supply orders found" note="Create the first supply order from the New Supply Order button." />}
    </section>
  );
}
