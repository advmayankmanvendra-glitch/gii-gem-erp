import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

/** Renders a GRN certified print from the loaded goods receipt data. */
function GrnPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Goods Receipt Note"
      purpose="Goods receipt note for procurement, warehouse receipt and supplier bill verification."
      preview={preview}
      data={data}
      fieldHints={["company", "grn", "receipt", "supplier", "purchase", "invoice", "order", "warehouse", "date", "status"]}
      secondaryFieldHints={["quantity", "accepted", "damaged", "rate", "taxable", "gst", "gross", "freight", "loading"]}
      tableTitle="Received Item Details"
      copyType="Warehouse Copy"
      declaration="This GRN print is based on loaded receipt data and does not independently post stock or accounting entries."
      signatureLabels={["Received By", "Warehouse Checked By", "Authorized By"]}
    />
  );
}

/** Renders an internal billing working sheet from loaded invoice data. */
function InvoiceWorkingSheetPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Invoice Working Sheet"
      purpose="Internal billing calculation sheet for taxable value, GST, receivable and order validation review."
      preview={preview}
      data={data}
      fieldHints={["company", "invoice", "order", "department", "institution", "consignee", "status", "posting"]}
      secondaryFieldHints={["taxable", "cgst", "sgst", "igst", "gst", "gross", "received", "outstanding"]}
      tableTitle="Invoice Working Lines"
      copyType="Internal Working Sheet"
      declaration="This internal working sheet is for review only and is not a statutory invoice copy."
      signatureLabels={["Prepared By", "Billing Review", "Accounts Review"]}
    />
  );
}

/** Renders a document checklist print from loaded order or invoice document data. */
function DocumentChecklistPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Document Checklist"
      purpose="Operational document readiness print for order, invoice, delivery and payment evidence."
      preview={preview}
      data={data}
      fieldHints={["company", "order", "invoice", "department", "document", "status", "missing", "available"]}
      secondaryFieldHints={["supply", "challan", "installation", "crac", "authorization", "payment", "remarks"]}
      tableTitle="Document Readiness Details"
      copyType="Internal Control Sheet"
      declaration="Document readiness should be reviewed before billing, collection follow-up or order closure."
      signatureLabels={["Prepared By", "Operations Review", "Document Control"]}
    />
  );
}

/** Renders a profitability sheet print from loaded order profitability data. */
function ProfitabilitySheetPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Profitability Sheet"
      purpose="Internal order profitability print for billing, purchase, expense, GST impact and net profit review."
      preview={preview}
      data={data}
      fieldHints={["company", "order", "department", "billing", "purchase", "expense", "gst", "profit", "roi"]}
      secondaryFieldHints={["margin", "authorization", "l1", "work incentive", "transport", "installation", "net"]}
      tableTitle="Profitability Components"
      copyType="Internal Review Sheet"
      declaration="Profitability values should be reconciled with posted transactions before management review."
      signatureLabels={["Prepared By", "Accounts Review", "Management Review"]}
    />
  );
}

export { DocumentChecklistPrint, GrnPrint, InvoiceWorkingSheetPrint, ProfitabilitySheetPrint };
