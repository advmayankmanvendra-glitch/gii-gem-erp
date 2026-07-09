import { useMemo } from "react";
import { ValidationGuidanceBanner } from "../../../components/panels/SmallComponents.jsx";
import { SupplyOrderItemsGrid } from "./SupplyOrderItemsGrid.jsx";
import { SupplyOrderReadinessPanel } from "./SupplyOrderReadinessPanel.jsx";
import { supplyOrderItemTotals, focusValidationTarget, supplyOrderDocumentReadiness, supplyOrderOperationalReadiness } from "./supplyOrderHelpers.js";

export function SupplyOrderEntryForm({ config, form, orderItems, setOrderItems, references, validationErrors = [], onFieldChange, editing, onSubmit, onClear, TransactionField, formatCurrency, formatNumber, SupplyOrderFieldSection, SupplyOrderSummaryCard }) {
  const isGemSupply = String(form.supply_type || "GeM") === "GeM";
  const totals = supplyOrderItemTotals(orderItems, references);
  const errorMap = useMemo(() => Object.fromEntries(validationErrors.filter((error) => error.name).map((error) => [error.name, error])), [validationErrors]);
  const sectionHasError = (section) => validationErrors.some((error) => error.section === section);
  const field = (name) => {
    const definition = config.fields.find(([fieldName]) => fieldName === name);
    if (!definition) return null;
    const [, label, type] = definition;
    return (
      <TransactionField
        key={name}
        name={name}
        label={label}
        type={type}
        value={form[name] ?? ""}
        references={references}
        error={errorMap[name]?.message}
        onChange={(value) => onFieldChange(name, value)}
      />
    );
  };

  return (
    <form id="supply-order-entry-form" className="entry-form-inner supply-order-entry-form" data-entry-form="true" onSubmit={onSubmit}>
      <div className="panel-head">
        <div>
          <h2>{editing ? "Edit Supply Order" : "Add Supply Order"}</h2>
          <span>Order-first entry with item-wise commercial and delivery controls.</span>
        </div>
        {editing && <button type="button" className="ghost-btn" onClick={onClear}>Clear</button>}
      </div>

      {validationErrors.length ? <ValidationGuidanceBanner errors={validationErrors} onFocusError={focusValidationTarget} /> : null}

      <section className={`supply-order-section ${sectionHasError("Order Identification") ? "section-has-error" : ""}`} data-validation-section="Order Identification">
        <div className="section-header">
          <div>
            <h2>Order Identification</h2>
            <span>Core order references and status.</span>
          </div>
        </div>
        <div className="form-grid supply-order-id-grid">
          {field("order_number")}
          {field("supply_type")}
          {field("order_date")}
          {isGemSupply && field("gem_order_number")}
          {isGemSupply && field("gem_contract_number")}
          {field("order_status")}
        </div>
      </section>

      <SupplyOrderItemsGrid
        items={orderItems}
        setItems={setOrderItems}
        references={references}
        orderStatus={form.order_status}
        validationErrors={validationErrors}
        formatCurrency={formatCurrency}
        formatNumber={formatNumber}
      />

      <div className="supply-order-two-column">
        <div className="supply-order-left-column">
          <SupplyOrderFieldSection title="Buyer & Department" note="Buyer contacts and department ownership for follow-up." hasError={sectionHasError("Buyer & Department")}>
            <div className="form-grid">
              {field("department_id")}
              {field("institution_name")}
              {field("buyer_name")}
              {field("buyer_designation")}
              {field("buyer_mobile")}
              {field("buyer_email")}
            </div>
          </SupplyOrderFieldSection>

          <SupplyOrderFieldSection title="Consignee & Delivery" note="Delivery contact, location and service commitments." hasError={sectionHasError("Consignee & Delivery")}>
            <div className="form-grid">
              {field("consignee")}
              {field("consignee_address")}
              {field("delivery_location")}
              {field("place_of_supply")}
              {field("location")}
              {field("supply_due_date")}
              {field("delivery_period")}
              {field("warranty_period")}
            </div>
          </SupplyOrderFieldSection>

          <SupplyOrderFieldSection title="Commercial Terms" note="Payment, EMD and security deposit details." hasError={sectionHasError("Commercial Terms")}>
            <div className="form-grid">
              {field("payment_terms")}
              {field("emd_amount")}
              {field("security_deposit_amount")}
            </div>
          </SupplyOrderFieldSection>

          <SupplyOrderFieldSection title="Internal Control" note="Owner, internal remarks and accountability." hasError={sectionHasError("Internal Control")}>
            <div className="form-grid">
              {field("employee_id")}
              {field("remarks")}
            </div>
          </SupplyOrderFieldSection>
        </div>

        <aside className="supply-order-right-column">
          <div className="supply-order-sticky">
            <SupplyOrderSummaryCard totals={totals} form={form} orderItems={orderItems} references={references} />
            <SupplyOrderReadinessPanel title="Document Readiness" rows={supplyOrderDocumentReadiness(form, editing, formatCurrency)} />
            <SupplyOrderReadinessPanel title="Operational Readiness" rows={supplyOrderOperationalReadiness(form, orderItems, references, editing)} />
          </div>
        </aside>
      </div>

      <div className="supply-order-actionbar">
        {validationErrors.length ? <ValidationGuidanceBanner errors={validationErrors} compact onFocusError={focusValidationTarget} /> : null}
        <button className="primary-btn">{editing ? "Update Supply Order" : "Save Supply Order"}</button>
      </div>
    </form>
  );
}
