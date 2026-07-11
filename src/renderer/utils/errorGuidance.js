export function cleanErrorMessage(error) {
  return String(error?.message || error || "Action could not be completed.")
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, "")
    .replace(/^Unhandled error:\s*/i, "")
    .replace(/^SqliteError:\s*/i, "Database error: ")
    .trim();
}

const UNIQUE_CONSTRAINT_FIELD_GUIDANCE = {
  "supply_orders.order_number": {
    name: "order_number",
    section: "Order Identification",
    message: "This order number already exists.",
    action: "Use the next auto-generated order number or enter a unique manual order number."
  },
  "invoices.invoice_number": {
    name: "invoice_number",
    section: "Invoice Header",
    message: "This invoice number already exists.",
    action: "Use the next invoice sequence or verify whether the invoice is already saved."
  },
  "payments.utr_number": {
    name: "utr_number",
    section: "Payment Details",
    message: "This UTR/reference number is already used.",
    action: "Check the payment reference and avoid duplicate receipt/payment entry."
  },
  "warehouses.warehouse_name": {
    name: "warehouse_name",
    section: "Warehouse",
    message: "This warehouse name already exists.",
    action: "Map to the existing warehouse or use a clearly different warehouse name."
  },
  "items.item_name": {
    name: "item_name",
    section: "Item Master",
    message: "This item name already exists.",
    action: "Use the existing item, update it, or rename the new item."
  },
  "companies.company_name": {
    name: "company_name",
    section: "Company",
    message: "This company already exists.",
    action: "Switch to the existing company or alter its master record."
  }
};

function addError(errors, entry, fallbackSection, clean) {
  errors.push({
    severity: entry.severity || "error",
    section: entry.section || fallbackSection,
    name: entry.name || null,
    itemIndex: entry.itemIndex ?? null,
    message: entry.message || clean,
    action: entry.action || "",
    detail: entry.detail || ""
  });
}

export function buildActionErrorGuidance(error, context = {}) {
  const clean = cleanErrorMessage(error);
  const lower = clean.toLowerCase();
  const fallbackSection = context?.config?.title || context?.table || "Current Screen";
  const errors = [];

  if (/no such column:\s*is_deleted/i.test(clean)) {
    addError(errors, {
      severity: "system",
      section: "Database / Migration",
      message: "Database compatibility issue: missing column `is_deleted`.",
      detail: "The current SQLite database does not match the code path used by this screen.",
      action: "Restart the desktop app so database initialization can run. If it repeats, run the schema/migration fix before entering more records."
    }, fallbackSection, clean);
  } else if (/no such column:\s*company_id/i.test(clean)) {
    addError(errors, {
      severity: "system",
      section: "Company Context",
      message: "Database compatibility issue: missing company linkage.",
      detail: "A company-filtered save/read was attempted against a table that is missing company context support.",
      action: "Stop this entry and run the company-context/schema regression fix before continuing."
    }, fallbackSection, clean);
  } else if (/unique constraint failed:\s*([a-z0-9_]+)\.([a-z0-9_]+)/i.test(clean)) {
    const [, tableName, columnName] = clean.match(/unique constraint failed:\s*([a-z0-9_]+)\.([a-z0-9_]+)/i);
    const key = `${tableName}.${columnName}`;
    addError(errors, UNIQUE_CONSTRAINT_FIELD_GUIDANCE[key] || {
      section: "Duplicate Check",
      name: columnName,
      message: `Duplicate value blocked for ${columnName.replaceAll("_", " ")}.`,
      detail: clean,
      action: "Search existing records first, then update/map/skip instead of creating another record."
    }, fallbackSection, clean);
  } else if (/select current company|company context|required.*company|selected company does not match/i.test(clean)) {
    addError(errors, {
      section: "Current Company",
      message: "Current Company needs attention.",
      detail: clean,
      action: "Select the correct company from the right utility panel before saving or posting."
    }, fallbackSection, clean);
  } else if (/gem order number is required/i.test(clean)) {
    addError(errors, {
      name: "gem_order_number",
      section: "Order Identification",
      message: "GeM Order Number is required.",
      action: "Enter the GeM order number, or change Supply Type away from GeM if this is not a GeM order."
    }, fallbackSection, clean);
  } else if (/gem contract number is required/i.test(clean)) {
    addError(errors, {
      name: "gem_contract_number",
      section: "Order Identification",
      message: "GeM Contract Number is required.",
      action: "Enter the GeM contract number, or change Supply Type away from GeM if this order is not from GeM."
    }, fallbackSection, clean);
  } else if (/department is required/i.test(clean)) {
    addError(errors, {
      name: "department_id",
      section: "Buyer & Department",
      message: "Department is required.",
      action: "Select the buying department before saving this order."
    }, fallbackSection, clean);
  } else if (/employee assigned is required/i.test(clean)) {
    addError(errors, {
      name: "employee_id",
      section: "Internal Control",
      message: "Employee Assigned is required.",
      action: "Select the employee responsible for this order."
    }, fallbackSection, clean);
  } else if (/order item\s+(\d+)/i.test(clean)) {
    const rowMatch = clean.match(/order item\s+(\d+)/i);
    const rowIndex = Math.max(0, Number(rowMatch?.[1] || 1) - 1);
    const fieldName = lower.includes("quantity") ? "quantity"
      : lower.includes("rate") ? "quoted_rate"
        : lower.includes("hsn") ? "hsn_sac"
          : lower.includes("gst") ? "gst_rate"
            : lower.includes("remarks") ? "remarks"
              : "item_id";
    addError(errors, {
      name: fieldName,
      itemIndex: rowIndex,
      section: "Order Items",
      message: clean,
      action: "Review the highlighted order item row and correct the missing or invalid value."
    }, fallbackSection, clean);
  } else if (/at least one order item/i.test(clean)) {
    addError(errors, {
      name: "order_items",
      section: "Order Items",
      message: "At least one order item is required.",
      action: "Add item-wise order details before moving the order beyond Draft/Received."
    }, fallbackSection, clean);
  } else if (/date|invalid date/i.test(clean)) {
    addError(errors, {
      section: "Date Field",
      message: clean,
      action: "Check the date format and use the calendar picker where available."
    }, fallbackSection, clean);
  } else if (/required|cannot be negative|must be greater than|invalid/i.test(clean)) {
    addError(errors, {
      section: fallbackSection,
      message: clean,
      action: "Review required fields and highlighted values on this screen."
    }, fallbackSection, clean);
  } else {
    addError(errors, {
      severity: clean.startsWith("Database error:") ? "system" : "error",
      section: clean.startsWith("Database error:") ? "Database" : fallbackSection,
      message: clean,
      action: clean.startsWith("Database error:")
        ? "Do not continue repeated entry attempts. Capture this message and run the relevant stability fix."
        : "Review the current screen and try again."
    }, fallbackSection, clean);
  }

  const first = errors[0];
  const toast = first?.section && first.section !== fallbackSection
    ? `${first.section}: ${first.message}`
    : first?.message || clean;
  return { clean, errors, toast };
}

export function friendlyToastMessage(message) {
  const guidance = buildActionErrorGuidance(message);
  return guidance.toast || guidance.clean || "Action could not be completed.";
}
