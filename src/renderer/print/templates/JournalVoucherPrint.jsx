import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function JournalVoucherPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Journal Voucher"
      purpose="Accounting journal voucher print from loaded voucher data."
      preview={preview}
      data={data}
      fieldHints={["company", "voucher", "date", "type", "reference", "narration", "status", "posted"]}
      tableTitle="Debit and Credit Lines"
    />
  );
}

export { JournalVoucherPrint };
