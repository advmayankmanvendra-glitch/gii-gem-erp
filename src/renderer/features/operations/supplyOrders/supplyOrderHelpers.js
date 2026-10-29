import { sumRupees } from "../../../utils/money.js";
export function blankSupplyOrderItem() {
  return {
    _key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    item_id: "",
    item_description: "",
    brand: "",
    model: "",
    hsn_sac: "",
    quantity: "",
    unit: "",
    quoted_rate: "",
    gst_rate: "",
    required_delivery_date: "",
    remarks: ""
  };
}

export function supplyOrderLineHasInput(line = {}) {
  return ["item_id", "item_description", "brand", "model", "hsn_sac", "quantity", "unit", "quoted_rate", "gst_rate", "required_delivery_date", "remarks"].some((key) => String(line[key] ?? "").trim());
}

export function itemById(references, id) {
  return (references?.items || []).find((item) => String(item.id) === String(id));
}

export function calculatedSupplyOrderLine(line = {}, references) {
  const item = itemById(references, line.item_id);
  const quantity = Number(line.quantity || 0);
  const rate = Number(line.quoted_rate || line.rate || 0);
  const gstRate = Number(line.gst_rate === "" || line.gst_rate === undefined ? (item?.gst_rate || 0) : line.gst_rate);
  const taxable = Math.round(quantity * rate * 100) / 100;
  const gstAmount = Math.round((taxable * gstRate / 100) * 100) / 100;
  return {
    ...line,
    item_description: line.item_description || item?.item_name || "",
    brand: line.brand || item?.brand || "",
    model: line.model || item?.model || "",
    hsn_sac: line.hsn_sac || item?.hsn_code || "",
    unit: line.unit || item?.unit || "",
    gst_rate: line.gst_rate === "" || line.gst_rate === undefined ? (item?.gst_rate ?? "") : line.gst_rate,
    taxable_value: taxable,
    gst_amount: gstAmount,
    gross_value: Math.round((taxable + gstAmount) * 100) / 100
  };
}

export function normalizedSupplyOrderItems(lines = [], references) {
  return lines
    .filter(supplyOrderLineHasInput)
    .map((line) => {
      const calculated = calculatedSupplyOrderLine(line, references);
      return {
        item_id: calculated.item_id || null,
        item_description: calculated.item_description,
        brand: calculated.brand,
        model: calculated.model,
        hsn_sac: calculated.hsn_sac,
        quantity: Number(calculated.quantity || 0),
        unit: calculated.unit,
        quoted_rate: Number(calculated.quoted_rate || 0),
        gst_rate: Number(calculated.gst_rate || 0),
        taxable_value: calculated.taxable_value,
        gst_amount: calculated.gst_amount,
        gross_value: calculated.gross_value,
        required_delivery_date: calculated.required_delivery_date || "",
        remarks: calculated.remarks || ""
      };
    });
}

export function supplyOrderItemsFromRecord(record = {}) {
  try {
    const parsed = record.order_items_json ? JSON.parse(record.order_items_json) : [];
    const rows = Array.isArray(parsed) ? parsed.filter((row) => row && (row.id || row.item_id || row.item_description)).map((row) => ({
      _key: `existing-${row.id || Math.random().toString(36).slice(2)}`,
      item_id: row.item_id || "",
      item_description: row.item_description || row.item_name || "",
      brand: row.brand || "",
      model: row.model || "",
      hsn_sac: row.hsn_sac || "",
      quantity: row.quantity ?? "",
      unit: row.unit || "",
      quoted_rate: row.quoted_rate ?? "",
      gst_rate: row.gst_rate ?? "",
      required_delivery_date: row.required_delivery_date || "",
      remarks: row.remarks || ""
    })) : [];
    return rows.length ? rows : [blankSupplyOrderItem()];
  } catch {
    return [blankSupplyOrderItem()];
  }
}

export function supplyOrderItemTotals(lines = [], references) {
  const calculated = lines.map((line) => calculatedSupplyOrderLine(line, references));
  return {
    quantity: calculated.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
    taxable: sumRupees(calculated.map((line) => line.taxable_value)),
    gst: sumRupees(calculated.map((line) => line.gst_amount)),
    gross: sumRupees(calculated.map((line) => line.gross_value))
  };
}

export function statusRequiresSupplyOrderItems(status) {
  return !["", "Draft", "Received"].includes(String(status || "").trim());
}

export function validateSupplyOrderItems(form, lines, references) {
  const normalized = normalizedSupplyOrderItems(lines, references);
  if (statusRequiresSupplyOrderItems(form.order_status) && !normalized.length) {
    throw new Error("At least one order item is required before marking this order as Procurement Pending or beyond.");
  }
  normalized.forEach((line, index) => {
    if (Number(line.quantity || 0) <= 0) throw new Error(`Order item ${index + 1}: quantity must be greater than zero.`);
    if (Number(line.quoted_rate || 0) <= 0) throw new Error(`Order item ${index + 1}: rate must be greater than zero.`);
    const item = itemById(references, line.item_id);
    if (item && String(item.gst_rate ?? "") !== "" && Number(item.gst_rate || 0) !== Number(line.gst_rate || 0) && !String(line.remarks || "").trim()) {
      throw new Error(`Order item ${index + 1}: GST override requires remarks.`);
    }
  });
}

export function focusValidationTarget(error = {}) {
  let target = null;
  if (error.itemIndex !== null && error.itemIndex !== undefined) {
    const row = document.querySelector(`[data-order-item-row="${error.itemIndex}"]`);
    target = row?.querySelector(`[data-line-field="${error.name}"]`) || row;
  }
  if (!target && error.name) {
    const field = document.querySelector(`[data-field-name="${error.name}"]`);
    target = field?.querySelector("input, select, textarea, button") || field;
  }
  if (!target && error.section) {
    target = document.querySelector(`[data-validation-section="${error.section}"]`);
  }
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof target.focus === "function") window.setTimeout(() => target.focus({ preventScroll: true }), 220);
}

export function supplyOrderDocumentReadiness(form, editing, formatCurrency) {
  const emdAmount = Number(form.emd_amount || 0);
  const securityDeposit = Number(form.security_deposit_amount || 0);
  return [
    { label: "Order Copy", value: editing ? "Record saved" : "Attach after save", tone: editing ? "ready" : "pending" },
    { label: "OEM Authorization", value: "Review document upload", tone: "pending" },
    { label: "EMD", value: emdAmount > 0 ? formatCurrency(emdAmount) : "Not applicable", tone: emdAmount > 0 ? "ready" : "neutral" },
    { label: "Security Deposit", value: securityDeposit > 0 ? formatCurrency(securityDeposit) : "Not applicable", tone: securityDeposit > 0 ? "ready" : "neutral" }
  ];
}

export function supplyOrderOperationalReadiness(form, orderItems, references, editing) {
  const hasItems = normalizedSupplyOrderItems(orderItems, references).length > 0;
  const status = String(form.order_status || "Received");
  return [
    { label: "Reservation Status", value: hasItems ? "Ready for reservation" : "Items pending", tone: hasItems ? "ready" : "pending" },
    { label: "Procurement Status", value: status.includes("Procurement") ? status : (editing ? "Review procurement" : "Not started"), tone: status.includes("Procurement") ? "ready" : "pending" },
    { label: "Billing Status", value: status.includes("Bill") || status.includes("Payment") || status === "Closed" ? status : "Not billed", tone: status.includes("Bill") || status.includes("Payment") || status === "Closed" ? "ready" : "pending" }
  ];
}

export function buildSupplyOrderValidationErrors(config, form, orderItems, references, companyContext) {
  const labels = Object.fromEntries(config.fields.map(([name, label]) => [name, label]));
  const errors = [];
  const fieldSection = {
    order_number: "Order Identification",
    supply_type: "Order Identification",
    order_date: "Order Identification",
    gem_order_number: "Order Identification",
    gem_contract_number: "Order Identification",
    order_status: "Order Identification",
    department_id: "Buyer & Department",
    institution_name: "Buyer & Department",
    buyer_name: "Buyer & Department",
    buyer_designation: "Buyer & Department",
    buyer_mobile: "Buyer & Department",
    buyer_email: "Buyer & Department",
    consignee: "Consignee & Delivery",
    consignee_address: "Consignee & Delivery",
    delivery_location: "Consignee & Delivery",
    place_of_supply: "Consignee & Delivery",
    location: "Consignee & Delivery",
    supply_due_date: "Consignee & Delivery",
    delivery_period: "Consignee & Delivery",
    warranty_period: "Consignee & Delivery",
    payment_terms: "Commercial Terms",
    emd_amount: "Commercial Terms",
    security_deposit_amount: "Commercial Terms",
    employee_id: "Internal Control",
    remarks: "Internal Control"
  };
  const add = (name, section, message, itemIndex = null) => errors.push({ name, section, message, itemIndex });
  const requireField = (name, message) => {
    if (!String(form[name] ?? "").trim()) add(name, fieldSection[name] || "Order Identification", message || `${labels[name] || name} is required`);
  };
  const isGemSupply = String(form.supply_type || "GeM") === "GeM";

  if (!companyContext?.company_id) add(null, "Current Company", "Select Current Company before saving this transaction.");
  requireField("order_number");
  requireField("supply_type");
  requireField("order_date");
  if (isGemSupply) {
    requireField("gem_order_number");
    requireField("gem_contract_number");
  }
  requireField("department_id", "Department is required");
  requireField("employee_id", "Employee Assigned is required");

  Object.entries(form).forEach(([key, value]) => {
    if ((key.includes("value") || key.includes("amount") || key.includes("gst") || key.includes("freight") || key.includes("charges") || key.includes("percentage")) && Number(value || 0) < 0) {
      add(key, fieldSection[key] || "Commercial Terms", `${labels[key] || "Amount"} cannot be negative`);
    }
  });

  const normalized = normalizedSupplyOrderItems(orderItems, references);
  if (statusRequiresSupplyOrderItems(form.order_status) && !normalized.length) {
    add("order_items", "Order Items", "Add at least one order item before moving this order beyond Received/Draft.");
  }

  orderItems.forEach((line, index) => {
    if (!supplyOrderLineHasInput(line)) return;
    const calculated = calculatedSupplyOrderLine(line, references);
    if (Number(calculated.quantity || 0) <= 0) add("quantity", "Order Items", `Order item ${index + 1}: quantity must be greater than zero.`, index);
    if (Number(calculated.quoted_rate || 0) <= 0) add("quoted_rate", "Order Items", `Order item ${index + 1}: rate must be greater than zero.`, index);
    if (!String(calculated.hsn_sac || "").trim()) add("hsn_sac", "Order Items", `Order item ${index + 1}: HSN/SAC is missing.`, index);
    if (String(calculated.gst_rate ?? "").trim() === "") add("gst_rate", "Order Items", `Order item ${index + 1}: GST rate is missing.`, index);
    const item = itemById(references, calculated.item_id);
    if (item && String(item.gst_rate ?? "") !== "" && Number(item.gst_rate || 0) !== Number(calculated.gst_rate || 0) && !String(calculated.remarks || "").trim()) {
      add("remarks", "Order Items", `Order item ${index + 1}: GST override requires remarks.`, index);
    }
  });
  return errors;
}

export function nextSupplyOrderNumber(orders = []) {
  const year = new Date().getFullYear();
  const maxSequence = orders.reduce((max, order) => {
    const value = String(order.order_number || "");
    const yearMatch = value.includes(String(year));
    const trailing = value.match(/(\d+)$/);
    const sequence = trailing ? Number(trailing[1]) : 0;
    return yearMatch && sequence > max ? sequence : max;
  }, 0);
  return `GEM-${year}-${String(maxSequence + 1).padStart(3, "0")}`;
}
