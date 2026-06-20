import { formatCurrency } from "../../utils/formatters.js";

const REASON_PRESETS = [
  "Physical verification surplus",
  "Physical verification shortage",
  "Damaged stock write-off",
  "Rejected material correction",
  "Warehouse count correction",
  "Opening stock correction",
  "Return/correction after review"
];

const HIGH_VALUE_THRESHOLD = 50000;

function idsMatch(left, right) {
  return String(left || "") === String(right || "");
}

function selectedLabel(rows = [], id, valueKey, labelKey) {
  return rows.find((row) => idsMatch(row[valueKey], id))?.[labelKey] || "Not selected";
}

export function getStockAdjustmentBalance(form, inventoryData) {
  if (!form?.item_id || !form?.warehouse_id) return null;
  return (inventoryData?.stockSummary || []).find((row) => idsMatch(row.item_id || row.id, form.item_id) && idsMatch(row.warehouse_id, form.warehouse_id)) || null;
}

export function buildStockAdjustmentWarnings(form, inventoryData) {
  const warnings = [];
  const quantity = Number(form?.quantity || 0);
  const rate = Number(form?.rate || 0);
  const value = quantity * rate;
  const reason = String(form?.reason || "").trim();
  const balance = getStockAdjustmentBalance(form, inventoryData);
  const closingQuantity = Number(balance?.closing_quantity || 0);
  const isDecrease = String(form?.adjustment_type || "Increase") === "Decrease";

  if (!form?.item_id) warnings.push({ tone: "danger", label: "Item missing", message: "Select the item before saving this correction." });
  if (!form?.warehouse_id) warnings.push({ tone: "danger", label: "Warehouse missing", message: "Select the warehouse where the correction applies." });
  if (quantity <= 0) warnings.push({ tone: "danger", label: "Quantity required", message: "Quantity must be greater than zero." });
  if (!reason) warnings.push({ tone: "danger", label: "Reason required", message: "Enter a correction reason before saving or approval." });
  if (reason && reason.length < 8) warnings.push({ tone: "warning", label: "Reason too short", message: "Use a clear reason such as physical verification, damaged stock or rejected stock." });
  if (value >= HIGH_VALUE_THRESHOLD) warnings.push({ tone: "warning", label: "High value adjustment", message: "Approval is required and remarks should explain the evidence for this stock correction." });
  if (isDecrease && balance && quantity > closingQuantity) warnings.push({ tone: "danger", label: "Negative stock risk", message: `Current closing quantity is ${closingQuantity}. This decrease will be blocked at posting unless stock is available.` });
  if (isDecrease && !balance && form?.item_id && form?.warehouse_id) warnings.push({ tone: "warning", label: "No stock history found", message: "No stock summary row exists for this item and warehouse. Posting will re-check availability." });

  return warnings;
}

export function validateStockAdjustmentDraft(form, inventoryData) {
  const blocking = buildStockAdjustmentWarnings(form, inventoryData).filter((warning) => warning.tone === "danger");
  if (blocking.length) {
    throw new Error(`Stock adjustment needs correction: ${blocking[0].message}`);
  }
}

export function StockAdjustmentControlPanel({ form, references, inventoryData, onReasonSelect, onOpenStockLedger }) {
  const balance = getStockAdjustmentBalance(form, inventoryData);
  const warnings = buildStockAdjustmentWarnings(form, inventoryData);
  const quantity = Number(form?.quantity || 0);
  const rate = Number(form?.rate || 0);
  const estimatedValue = quantity * rate;
  const itemName = selectedLabel(references?.items || [], form?.item_id, "id", "item_name");
  const warehouseName = selectedLabel(references?.warehouses || [], form?.warehouse_id, "id", "warehouse_name");
  const balanceLabel = balance ? `${Number(balance.closing_quantity || 0)} ${balance.unit || ""}`.trim() : "Checked at posting";
  const riskTone = warnings.some((warning) => warning.tone === "danger") ? "danger" : warnings.length ? "warning" : "active";

  return (
    <section className="stock-adjustment-control-panel">
      <div className="stock-adjustment-header">
        <div>
          <span className={`status-pill ${riskTone}`}>Inventory correction control</span>
          <h3>Stock Adjustment Safety Check</h3>
          <p>Use this only for physical verification, damaged/rejected stock, or controlled quantity corrections.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={onOpenStockLedger}>Review Stock Ledger</button>
      </div>

      <div className="stock-adjustment-metrics">
        <div><span>Item</span><strong>{itemName}</strong></div>
        <div><span>Warehouse</span><strong>{warehouseName}</strong></div>
        <div><span>Current Balance</span><strong>{balanceLabel}</strong></div>
        <div><span>Estimated Value</span><strong>{formatCurrency(estimatedValue)}</strong></div>
      </div>

      <div className="stock-adjustment-reasons">
        <strong>Reason shortcuts</strong>
        <div className="button-row compact-buttons">
          {REASON_PRESETS.map((reason) => (
            <button key={reason} type="button" className="ghost-btn tiny-btn" onClick={() => onReasonSelect(reason)}>
              {reason}
            </button>
          ))}
        </div>
      </div>

      <div className="stock-adjustment-warning-list">
        {warnings.length ? warnings.map((warning) => (
          <span key={`${warning.label}-${warning.message}`} className={warning.tone === "danger" ? "warning-line" : "stock-warning-line"}>
            <strong>{warning.label}:</strong> {warning.message}
          </span>
        )) : (
          <span className="ok-line">Ready for approval review. Posting will still perform final stock and lock checks.</span>
        )}
      </div>
    </section>
  );
}
