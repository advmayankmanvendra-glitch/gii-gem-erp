import { EntityPickerResultRow } from "./EntityPickerResultRow.jsx";

export function EntityPickerResultList({ config, results, loading, hasMore, activeIndex, listRef, onSelect, onLoadMore, listboxId = "entity-picker-listbox", optionId = (index) => `entity-picker-option-${index}` }) {
  if (loading && results.length === 0) {
    return <div className="entity-picker-status">Searching...</div>;
  }

  if (!loading && results.length === 0) {
    return <div className="entity-picker-status">{config.noResultsMessage}</div>;
  }

  return (
    <div className="entity-picker-results" ref={listRef} id={listboxId} role="listbox" tabIndex={-1}>
      {results.map((record, index) => (
        <EntityPickerResultRow
          key={record.id || index}
          config={config}
          record={record}
          active={index === activeIndex}
          onSelect={onSelect}
          id={optionId(index)}
        />
      ))}
      {hasMore && (
        <button type="button" className="entity-picker-load-more" onClick={onLoadMore} disabled={loading}>
          {loading ? "Loading..." : `Load more (${results.length} shown)`}
        </button>
      )}
    </div>
  );
}
