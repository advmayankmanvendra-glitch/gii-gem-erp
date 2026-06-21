import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function CreditNotePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Credit Note"
      purpose="Sales correction credit note print from loaded billing correction data."
      preview={preview}
      data={data}
      fieldHints={["company", "credit", "note", "invoice", "date", "department", "order", "gst", "reason", "status", "reference"]}
      tableTitle="Credit Note Line Details"
    />
  );
}

export { CreditNotePrint };
