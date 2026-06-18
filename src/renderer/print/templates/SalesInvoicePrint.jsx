import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function SalesInvoicePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Sales Invoice"
      purpose="Government supply tax invoice print from loaded billing data."
      preview={preview}
      data={data}
      fieldHints={["company", "invoice", "date", "order", "department", "institution", "consignee", "place", "gst", "status"]}
      tableTitle="Invoice Item Details"
    />
  );
}

export { SalesInvoicePrint };
