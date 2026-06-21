import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function DebitNotePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Debit Note"
      purpose="Purchase correction debit note print from loaded procurement correction data."
      preview={preview}
      data={data}
      fieldHints={["company", "debit", "note", "purchase", "date", "supplier", "order", "gst", "reason", "status", "reference"]}
      tableTitle="Debit Note Line Details"
    />
  );
}

export { DebitNotePrint };
