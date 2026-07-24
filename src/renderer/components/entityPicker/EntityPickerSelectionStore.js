const selectionRecords = new Map();

function selectionKey(entityType, id) {
  const normalizedType = entityType === "ledger_account" ? "ledger" : entityType;
  return `${normalizedType}:${String(id ?? "")}`;
}

export function rememberEntityPickerRecord(entityType, record) {
  if (!entityType || record?.id === undefined || record?.id === null) return;
  selectionRecords.set(selectionKey(entityType, record.id), record);
}

export function getRememberedEntityPickerRecord(entityType, id) {
  if (!entityType || id === undefined || id === null || id === "") return null;
  return selectionRecords.get(selectionKey(entityType, id)) || null;
}
