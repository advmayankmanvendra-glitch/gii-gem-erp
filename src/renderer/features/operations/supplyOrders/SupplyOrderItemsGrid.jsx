import { useState } from "react";
import { MetricLine } from "../../../components/forms/index.jsx";
import { blankSupplyOrderItem, supplyOrderItemTotals, normalizedSupplyOrderItems, calculatedSupplyOrderLine, itemById, statusRequiresSupplyOrderItems } from "./supplyOrderHelpers.js";
import { sortOptions, sortRecordsBy } from "../../../utils/optionSorting.js";

export function SupplyOrderItemsGrid({ items, setItems, references, orderStatus, validationErrors = [], formatCurrency, formatNumber }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemOptions = sortRecordsBy(references?.items || [], (item) => item.item_name);
  const totals = supplyOrderItemTotals(items, references);
  const hasItems = normalizedSupplyOrderItems(items, references).length > 0;
  const missingTax = items.some((line) => ["item_id", "item_description", "brand", "model", "hsn_sac", "quantity", "unit", "quoted_rate", "gst_rate", "required_delivery_date", "remarks"].some((key) => String(line[key] ?? "").trim()) && (!String(calculatedSupplyOrderLine(line, references).hsn_sac || "").trim() || String(calculatedSupplyOrderLine(line, references).gst_rate ?? "").trim() === ""));
  const sectionErrors = validationErrors.filter((error) => error.section === "Order Items");
  const itemErrorFor = (index, name) => sectionErrors.find((error) => error.itemIndex === index && (!error.name || error.name === name));

  function updateLine(index, patch) {
    setItems((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const next = { ...line, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "item_id")) {
        const item = itemById(references, patch.item_id);
        return {
          ...next,
          item_description: item?.item_name || next.item_description || "",
          brand: item?.brand || next.brand || "",
          model: item?.model || next.model || "",
          hsn_sac: item?.hsn_code || next.hsn_sac || "",
          unit: item?.unit || next.unit || "",
          gst_rate: item?.gst_rate ?? next.gst_rate ?? ""
        };
      }
      return next;
    }));
  }

  function addLine() {
    setItems((current) => [...current, blankSupplyOrderItem()]);
    setSelectedIndex(items.length);
  }

  function removeLine() {
    setItems((current) => current.length <= 1 ? [blankSupplyOrderItem()] : current.filter((_, index) => index !== selectedIndex));
    setSelectedIndex(0);
  }

  function editLine() {
    const element = document.querySelector(`[data-order-item-row="${selectedIndex}"] input, [data-order-item-row="${selectedIndex}"] select`);
    element?.focus();
  }

  return (
    <section className={`order-items-section ${sectionErrors.length ? "section-has-error" : ""}`} data-validation-section="Order Items">
      <div className="section-header">
        <div>
          <h2>Order Items</h2>
          <span>Item-wise commercial details for procurement, reservation, billing and profitability.</span>
        </div>
        <div className="button-row">
          <button type="button" className="ghost-btn" onClick={addLine}>Add Item</button>
          <button type="button" className="ghost-btn" onClick={editLine}>Edit Item</button>
          <button type="button" className="ghost-btn danger-text" onClick={removeLine}>Remove Item</button>
        </div>
      </div>
      {!hasItems && statusRequiresSupplyOrderItems(orderStatus) && <div className="warning-banner"><strong>Items required</strong><span>Add at least one item before moving this order beyond Received/Draft.</span></div>}
      {!hasItems && !statusRequiresSupplyOrderItems(orderStatus) && <div className="info-banner"><strong>Draft allowed</strong><span>This order can stay Received/Draft until item details are available.</span></div>}
      {missingTax && <div className="warning-banner"><strong>HSN/GST warning</strong><span>One or more item lines are missing HSN/SAC or GST details.</span></div>}
      <div className="table-wrap order-items-table-wrap">
        <table className="order-items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Brand</th>
              <th>Model</th>
              <th>HSN/SAC</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Rate</th>
              <th>GST %</th>
              <th>Taxable</th>
              <th>GST</th>
              <th>Gross</th>
              <th>Required Delivery</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line, index) => {
              const calculated = calculatedSupplyOrderLine(line, references);
              return (
                <tr key={line._key || index} data-order-item-row={index} className={`${selectedIndex === index ? "selected-row" : ""} ${sectionErrors.some((error) => error.itemIndex === index) ? "row-has-error" : ""}`} onClick={() => setSelectedIndex(index)}>
                  <td>
                    <select value={line.item_id || ""} data-line-field="item_id" aria-invalid={Boolean(itemErrorFor(index, "item_id"))} onChange={(event) => updateLine(index, { item_id: event.target.value })}>
                      <option value="">Select item</option>
                      {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.item_name}</option>)}
                    </select>
                  </td>
                  <td><input value={calculated.item_description || ""} data-line-field="item_description" aria-invalid={Boolean(itemErrorFor(index, "item_description"))} onChange={(event) => updateLine(index, { item_description: event.target.value })} /></td>
                  <td>
                    <select value={calculated.brand || ""} data-line-field="brand" onChange={(event) => updateLine(index, { brand: event.target.value })}>
                      <option value="">Select</option>
                      {sortOptions([...new Set(itemOptions.map((i) => i.brand).filter(Boolean))]).map((brand) => <option key={brand} value={brand}>{brand}</option>)}
                    </select>
                  </td>
                  <td><input value={calculated.model || ""} data-line-field="model" onChange={(event) => updateLine(index, { model: event.target.value })} /></td>
                  <td><input value={calculated.hsn_sac || ""} data-line-field="hsn_sac" aria-invalid={Boolean(itemErrorFor(index, "hsn_sac"))} onChange={(event) => updateLine(index, { hsn_sac: event.target.value })} /></td>
                  <td><input type="number" min="0" step="0.01" value={line.quantity ?? ""} data-line-field="quantity" aria-invalid={Boolean(itemErrorFor(index, "quantity"))} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                  <td><input value={calculated.unit || ""} data-line-field="unit" onChange={(event) => updateLine(index, { unit: event.target.value })} /></td>
                  <td><input type="number" min="0" step="0.01" value={line.quoted_rate ?? ""} data-line-field="quoted_rate" aria-invalid={Boolean(itemErrorFor(index, "quoted_rate"))} onChange={(event) => updateLine(index, { quoted_rate: event.target.value })} /></td>
                  <td><input type="number" min="0" step="0.01" value={calculated.gst_rate ?? ""} data-line-field="gst_rate" aria-invalid={Boolean(itemErrorFor(index, "gst_rate"))} onChange={(event) => updateLine(index, { gst_rate: event.target.value })} /></td>
                  <td>{formatCurrency(calculated.taxable_value)}</td>
                  <td>{formatCurrency(calculated.gst_amount)}</td>
                  <td>{formatCurrency(calculated.gross_value)}</td>
                  <td><input type="date" value={line.required_delivery_date || ""} data-line-field="required_delivery_date" onChange={(event) => updateLine(index, { required_delivery_date: event.target.value })} /></td>
                  <td><input value={line.remarks || ""} data-line-field="remarks" aria-invalid={Boolean(itemErrorFor(index, "remarks"))} onChange={(event) => updateLine(index, { remarks: event.target.value })} placeholder="Required for GST override" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="order-total-grid">
        <MetricLine label="Total Quantity" value={formatNumber(totals.quantity)} />
        <MetricLine label="Taxable Value" value={formatCurrency(totals.taxable)} />
        <MetricLine label="GST Amount" value={formatCurrency(totals.gst)} />
        <MetricLine label="Gross Order Value" value={formatCurrency(totals.gross)} />
      </div>
    </section>
  );
}
