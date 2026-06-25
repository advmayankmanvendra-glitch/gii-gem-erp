import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function StockReportPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Stock Summary / Inventory Report"
      purpose="Inventory stock summary, ledger or valuation report print from loaded stock data."
      preview={preview}
      data={data}
      fieldHints={["company", "warehouse", "item", "period", "from", "to", "valuation", "view", "closing"]}
      secondaryFieldHints={["inward", "outward", "closing", "quantity", "value", "rate", "reserved", "low stock"]}
      tableTitle="Stock Movement / Balance Details"
      copyType="Inventory Report"
      declaration="This stock report is generated from loaded inventory report data and should be reconciled with stock ledger for certification."
      signatureLabels={["Prepared By", "Inventory Review", "Authorized Signatory"]}
    />
  );
}

export { StockReportPrint };
