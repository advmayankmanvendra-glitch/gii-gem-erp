import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function PurchaseVoucherPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Purchase Voucher"
      purpose="Purchase voucher print from loaded procurement or voucher data."
      preview={preview}
      data={data}
      fieldHints={["company", "voucher", "date", "supplier", "purchase", "invoice", "order", "gst", "warehouse", "amount"]}
      tableTitle="Purchase Item Details"
    />
  );
}

export { PurchaseVoucherPrint };
