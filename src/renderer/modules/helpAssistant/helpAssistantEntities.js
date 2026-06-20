/**
 * Adds a unique extracted entity to the answer payload.
 */
function addEntity(entities, type, value, label = value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue) return;
  const key = `${type}:${cleanValue.toLowerCase()}`;
  if (entities.some((entity) => entity.key === key)) return;
  entities.push({ key, type, value: cleanValue, label: String(label || cleanValue).trim() });
}

/**
 * Extracts operational references from a natural-language help question.
 */
function extractEntities(query) {
  const text = String(query || "");
  const entities = [];

  const referencePatterns = [
    { type: "Order", prefix: "Order", regex: /\b(?:order|so|po|gem)[\s:#-]*([a-z0-9][a-z0-9/-]{1,})\b/gi },
    { type: "Invoice", prefix: "Invoice", regex: /\b(?:invoice|inv|bill)[\s:#-]*([a-z0-9][a-z0-9/-]{1,})\b/gi },
    { type: "Voucher", prefix: "Voucher", regex: /\b(?:voucher|vch)[\s:#-]*([a-z0-9][a-z0-9/-]{1,})\b/gi }
  ];

  referencePatterns.forEach(({ type, prefix, regex }) => {
    let match = regex.exec(text);
    while (match) {
      addEntity(entities, type, match[1], `${prefix}: ${match[1]}`);
      match = regex.exec(text);
    }
  });

  const standaloneRefs = text.match(/\b(?:SO|PO|GEM|INV|BILL|VCH)-[A-Z0-9/-]+\b/gi) || [];
  standaloneRefs.forEach((reference) => {
    const upper = reference.toUpperCase();
    if (upper.startsWith("INV") || upper.startsWith("BILL")) addEntity(entities, "Invoice", reference, `Invoice: ${reference}`);
    else if (upper.startsWith("VCH")) addEntity(entities, "Voucher", reference, `Voucher: ${reference}`);
    else addEntity(entities, "Order", reference, `Order: ${reference}`);
  });

  const numbers = text.match(/\b\d{4,}\b/g) || [];
  numbers.slice(0, 5).forEach((number) => addEntity(entities, "Number", number, `Number: ${number}`));

  const datePhrases = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["tomorrow", "Tomorrow"],
    ["this month", "This month"],
    ["last month", "Last month"],
    ["current fy", "Current FY"],
    ["current financial year", "Current FY"],
    ["this quarter", "This quarter"],
    ["next quarter", "Next quarter"]
  ];
  const lower = text.toLowerCase();
  datePhrases.forEach(([phrase, label]) => {
    if (lower.includes(phrase)) addEntity(entities, "Date", phrase, label);
  });

  return entities.map(({ key, ...entity }) => entity);
}

export { extractEntities };
