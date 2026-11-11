export function EntityPickerResultRow({ config, record, active, onSelect, id }) {
  const primary = config.resultPrimary(record);
  const secondary = config.resultSecondary(record);
  const note = config.resultNote(record);

  return (
    <button
      type="button"
      className={`entity-picker-row${active ? " active" : ""}`}
      // Mouse down keeps focus in the search box; the selection itself happens on click, so
      // Enter, Space and assistive technology select the result too.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(record)}
      id={id}
      role="option"
      aria-selected={active}
    >
      <span className="entity-picker-primary">{primary}</span>
      {secondary ? <span className="entity-picker-secondary">{secondary}</span> : null}
      {note ? <span className="entity-picker-note">{note}</span> : null}
    </button>
  );
}
