import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function SalesInvoicePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Sales Invoice"
      purpose="Government supply tax invoice print from loaded billing data."
      preview={preview}
      data={data}
      fieldHints={["company", "gstin", "invoice", "date", "order", "department", "institution", "consignee", "place", "gst", "hsn", "status", "value", "taxable", "cgst", "sgst", "igst", "total", "amount"]}
      tableTitle="Invoice Item Details"
    />
  );
}

export { SalesInvoicePrint };
