import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function ReceiptVoucherPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Receipt Voucher"
      purpose="Receipt voucher print from loaded payment or voucher data."
      preview={preview}
      data={data}
      fieldHints={["company", "voucher", "date", "department", "party", "bank", "cash", "amount", "tds", "utr", "reference"]}
      tableTitle="Receipt Ledger Details"
    />
  );
}

export { ReceiptVoucherPrint };
