import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function StockReportPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Stock Report"
      purpose="Inventory report print from loaded stock report data."
      preview={preview}
      data={data}
      fieldHints={["company", "warehouse", "item", "period", "from", "to", "valuation", "view"]}
      tableTitle="Stock Movement / Balance Details"
    />
  );
}

export { StockReportPrint };
