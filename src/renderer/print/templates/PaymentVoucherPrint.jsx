import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function PaymentVoucherPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Payment Voucher"
      purpose="Supplier or party payment voucher print from loaded voucher data."
      preview={preview}
      data={data}
      fieldHints={["company", "voucher", "date", "supplier", "party", "bank", "cash", "amount", "utr", "reference"]}
      tableTitle="Payment Ledger Details"
    />
  );
}

export { PaymentVoucherPrint };
