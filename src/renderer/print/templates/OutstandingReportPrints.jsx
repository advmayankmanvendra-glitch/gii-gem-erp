import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

/** Renders an outstanding receivable certified print from loaded receivable data. */
function OutstandingReceivablePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Outstanding Receivable Statement"
      purpose="Department/customer outstanding statement for bill-wise receivable and ageing review."
      preview={preview}
      data={data}
      fieldHints={["company", "department", "customer", "party", "invoice", "period", "from", "to", "outstanding"]}
      secondaryFieldHints={["invoice value", "received", "tds", "gst tds", "deduction", "ageing", "overdue", "balance"]}
      tableTitle="Bill-wise Receivable Details"
      copyType="Receivable Statement"
      declaration="This receivable statement should reconcile with party ledger before external sharing."
      signatureLabels={["Prepared By", "Receivable Review", "Authorized Signatory"]}
    />
  );
}

/** Renders an outstanding payable certified print from loaded payable data. */
function OutstandingPayablePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Outstanding Payable Statement"
      purpose="Supplier outstanding statement for bill-wise payable and ageing review."
      preview={preview}
      data={data}
      fieldHints={["company", "supplier", "party", "purchase", "invoice", "period", "from", "to", "outstanding"]}
      secondaryFieldHints={["bill value", "paid", "balance", "ageing", "overdue", "due date", "allocation"]}
      tableTitle="Bill-wise Payable Details"
      copyType="Payable Statement"
      declaration="This payable statement should reconcile with supplier ledger before payment authorization."
      signatureLabels={["Prepared By", "Payable Review", "Authorized Signatory"]}
    />
  );
}

export { OutstandingPayablePrint, OutstandingReceivablePrint };
