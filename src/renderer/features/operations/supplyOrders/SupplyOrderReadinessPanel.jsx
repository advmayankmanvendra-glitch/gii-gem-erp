export function SupplyOrderReadinessPanel({ title, rows }) {
  return (
    <section className="supply-order-readiness-panel">
      <h2>{title}</h2>
      <div className="readiness-list">
        {rows.map((row) => (
          <div key={row.label} className={`readiness-row ${row.tone}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
