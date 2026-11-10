import { useEffect, useRef } from "react";

export function EntityPickerSearchInput({ placeholder, value, onChange, onKeyDown, listboxId, activeOptionId }) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      className="entity-picker-search"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      role="combobox"
      aria-expanded="true"
      aria-haspopup="listbox"
      aria-autocomplete="list"
      aria-controls={listboxId}
      aria-activedescendant={activeOptionId || undefined}
      autoComplete="off"
    />
  );
}
