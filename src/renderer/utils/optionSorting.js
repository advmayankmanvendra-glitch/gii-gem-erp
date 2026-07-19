function normalizedLabel(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function optionLabel(option) {
  if (Array.isArray(option)) return option[1] ?? option[0];
  if (option && typeof option === "object") {
    return option.label ?? option.name ?? option.title ?? option.value ?? option.id;
  }
  return option;
}

function optionIdentity(option) {
  if (Array.isArray(option)) return option[0];
  if (option && typeof option === "object") return option.value ?? option.id ?? option.key;
  return option;
}

export function compareAlphabetically(left, right) {
  return normalizedLabel(left).localeCompare(normalizedLabel(right), "en-IN", {
    sensitivity: "base",
    numeric: true
  });
}

export function sortOptions(options = []) {
  return [...options].sort((left, right) => {
    const labelOrder = compareAlphabetically(optionLabel(left), optionLabel(right));
    if (labelOrder) return labelOrder;
    return compareAlphabetically(optionIdentity(left), optionIdentity(right));
  });
}

export function sortRecordsBy(records = [], labelForRecord) {
  return [...records].sort((left, right) => {
    const labelOrder = compareAlphabetically(labelForRecord(left), labelForRecord(right));
    if (labelOrder) return labelOrder;
    return compareAlphabetically(left?.id, right?.id);
  });
}
