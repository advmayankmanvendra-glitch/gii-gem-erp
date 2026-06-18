import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

function DeliveryChallanPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Delivery Challan"
      purpose="Dispatch and delivery reference from loaded order or stock issue data."
      preview={preview}
      data={data}
      fieldHints={["company", "challan", "date", "order", "department", "institution", "consignee", "warehouse", "location"]}
      tableTitle="Delivered Item Details"
    />
  );
}

export { DeliveryChallanPrint };
