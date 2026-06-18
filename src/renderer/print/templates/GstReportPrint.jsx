import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function GstReportPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="GST Report"
      purpose="GST report print from loaded GST register or summary data."
      preview={preview}
      data={data}
      fieldHints={["company", "gst", "period", "from", "to", "input", "output", "tds", "tax"]}
      tableTitle="GST Register / Summary Details"
    />
  );
}

export { GstReportPrint };
