import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function SalesInvoicePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="GST Invoice / Tax Invoice"
      purpose="Government supply GST invoice print from loaded billing data."
      preview={preview}
      data={data}
      fieldHints={["company", "gstin", "invoice", "date", "order", "department", "institution", "consignee", "place", "gst", "hsn", "status", "value", "taxable", "cgst", "sgst", "igst", "total", "amount"]}
      secondaryFieldHints={["received", "tds", "gst tds", "advance", "outstanding", "posting", "voucher"]}
      tableTitle="Invoice Item Details"
      copyType="Customer Copy"
      declaration="Certified GST invoice generated from loaded billing data. Verify invoice number, GST values and party details before official issue."
      signatureLabels={["Prepared By", "Checked By", "Authorized Signatory"]}
    />
  );
}

export { SalesInvoicePrint };
