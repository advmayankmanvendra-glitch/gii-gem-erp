import { useState, useCallback, useMemo, useRef, useEffect, useId } from "react";
import { getEntityPickerConfig } from "./EntityPickerRegistry.js";
import { useEntitySearch } from "./useEntitySearch.js";
import { useEntityPickerKeyboard } from "./useEntityPickerKeyboard.js";
import { EntityPickerModal } from "./EntityPickerModal.jsx";
import { EntityPickerSearchInput } from "./EntityPickerSearchInput.jsx";
import { EntityPickerResultList } from "./EntityPickerResultList.jsx";
import { canQuickCreate } from "../../modules/quick-create/quickCreatePermissions.js";
import { getQuickCreateEntity } from "../../modules/quick-create/quickCreateRegistry.js";
import { getRememberedEntityPickerRecord, rememberEntityPickerRecord } from "./EntityPickerSelectionStore.js";

export function SmartEntityPicker({ entityType, api, role, companyId, value, onChange, onQuickCreate, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  // Ties the search box to its result list for screen readers.
  const pickerId = `entity-picker-${useId().replace(/:/g, "")}`;
  const storeRef = useRef(null);
  const config = useMemo(() => getEntityPickerConfig(entityType), [entityType]);

  const searchApi = useEntitySearch(api, entityType, { companyId });
  const keyboard = useEntityPickerKeyboard({
    results: searchApi.results,
    onSelect: handleSelect,
    onClose: () => setOpen(false),
    onQuickCreate: handleQuickCreate,
    loading: searchApi.loading
  });

  const permission = useMemo(() => {
    if (!config) return { canCreate: false };
    const qcEntity = getQuickCreateEntity(config.quickCreateType);
    return {
      canCreate: config.quickCreateType ? canQuickCreate(config.quickCreateType, role).allowed : false,
      qcLabel: qcEntity?.label || config.label
    };
  }, [config, role]);

  function handleSelect(record) {
    storeRef.current = record;
    rememberEntityPickerRecord(entityType, record);
    onChange(record.id, record);
    setOpen(false);
  }

  function handleQuickCreate() {
    if (!onQuickCreate || !config?.quickCreateType) return;
    storeRef.current = "quick-create-pending";
    onQuickCreate(config.quickCreateType, config.initialDefaults(searchApi.query));
  }

  useEffect(() => {
    function onQuickCreateEvent() {
      if (!onQuickCreate || !config?.quickCreateType) return;
      // The trigger, or this picker's open list (Alt + C in the Tally key layout).
      const inList = open && document.activeElement?.closest?.(".entity-picker-modal");
      if (!triggerRef.current?.contains(document.activeElement) && !inList) return;
      handleQuickCreate();
    }
    window.addEventListener("gii-gem-quick-create", onQuickCreateEvent);
    return () => window.removeEventListener("gii-gem-quick-create", onQuickCreateEvent);
  }, [onQuickCreate, config, open, searchApi.query]);

  const handleOpen = useCallback(() => {
    if (disabled) return;
    storeRef.current = null;
    setOpen(true);
    searchApi.search("", { limit: 50, offset: 0 });
  }, [disabled, searchApi]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const selectedLabel = useMemo(() => {
    if (!value) return "";
    const localRecord = storeRef.current && storeRef.current !== "quick-create-pending"
      && String(storeRef.current.id) === String(value)
      ? storeRef.current
      : null;
    const selectedRecord = localRecord || getRememberedEntityPickerRecord(entityType, value);
    if (selectedRecord) {
      return config?.resultPrimary(selectedRecord) || String(value);
    }
    return String(value);
  }, [value, config, entityType]);

  if (!config) {
    return <div className="field-error">Unknown entity type: {entityType}</div>;
  }

  return (
    <>
      <label className="field entity-picker-trigger" ref={triggerRef}>
        <span className="entity-picker-label">{config.label}</span>
        <div className="entity-picker-trigger-controls">
          <input
            type="text"
            className="entity-picker-trigger-input"
            value={selectedLabel}
            placeholder={placeholder || config.searchPlaceholder}
            onFocus={handleOpen}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && event.altKey) {
                event.preventDefault();
                handleOpen();
              }
              if (event.key === "F4") {
                event.preventDefault();
                handleOpen();
              }
              if ((event.key === "F10" || (event.key === "Insert" && event.altKey)) && onQuickCreate) {
                event.preventDefault();
                handleQuickCreate();
              }
            }}
            readOnly
            disabled={disabled}
            autoComplete="off"
          />
          {onQuickCreate && permission.canCreate && (
            <button type="button" className="entity-picker-qc-btn" onClick={handleQuickCreate} tabIndex={-1} title={`Create new ${config.label} (Alt+Insert)`} aria-label={`Create new ${config.label}`}>
              +
            </button>
          )}
        </div>
      </label>

      {open && (
        <EntityPickerModal onClose={handleClose} entityLabel={config.label}>
          <div className="entity-picker-header">
            <span className="entity-picker-header-label">Select {config.label}</span>
            <button type="button" className="entity-picker-close-btn" onClick={handleClose} aria-label="Close">&times;</button>
          </div>
          <EntityPickerSearchInput
            listboxId={`${pickerId}-listbox`}
            activeOptionId={keyboard.activeIndex >= 0 && keyboard.activeIndex < searchApi.results.length ? `${pickerId}-option-${keyboard.activeIndex}` : ""}
            placeholder={config.searchPlaceholder}
            value={searchApi.query}
            onChange={(value) => {
              searchApi.debouncedSearch(value);
            }}
            onKeyDown={keyboard.handleKeyDown}
          />
          {searchApi.error && <div className="entity-picker-error">{searchApi.error}</div>}
          <EntityPickerResultList
            config={config}
            results={searchApi.results}
            loading={searchApi.loading}
            hasMore={searchApi.hasMore}
            activeIndex={keyboard.activeIndex}
            listRef={keyboard.listRef}
            onSelect={handleSelect}
            onLoadMore={searchApi.loadMore}
            listboxId={`${pickerId}-listbox`}
            optionId={(index) => `${pickerId}-option-${index}`}
          />
          {searchApi.results.length === 0 && !searchApi.loading && searchApi.query.trim() && permission.canCreate && (
            <div className="entity-picker-empty-create">
              <button type="button" className="ghost-btn" onClick={handleQuickCreate}>
                {config.quickCreateLabel(searchApi.query)}
              </button>
            </div>
          )}
        </EntityPickerModal>
      )}
    </>
  );
}
