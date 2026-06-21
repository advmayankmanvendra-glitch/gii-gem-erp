import React from "react";
import { CreditNotePrint } from "./templates/CreditNotePrint.jsx";
import { DebitNotePrint } from "./templates/DebitNotePrint.jsx";
import { DeliveryChallanPrint } from "./templates/DeliveryChallanPrint.jsx";
import { GstReportPrint } from "./templates/GstReportPrint.jsx";
import { JournalVoucherPrint } from "./templates/JournalVoucherPrint.jsx";
import { PaymentVoucherPrint } from "./templates/PaymentVoucherPrint.jsx";
import { PurchaseVoucherPrint } from "./templates/PurchaseVoucherPrint.jsx";
import { ReceiptVoucherPrint } from "./templates/ReceiptVoucherPrint.jsx";
import { SalesInvoicePrint } from "./templates/SalesInvoicePrint.jsx";
import { StockReportPrint } from "./templates/StockReportPrint.jsx";

const TEMPLATE_COMPONENTS = {
  sales_invoice: SalesInvoicePrint,
  credit_note: CreditNotePrint,
  debit_note: DebitNotePrint,
  delivery_challan: DeliveryChallanPrint,
  receipt_voucher: ReceiptVoucherPrint,
  payment_voucher: PaymentVoucherPrint,
  purchase_voucher: PurchaseVoucherPrint,
  journal_voucher: JournalVoucherPrint,
  stock_report: StockReportPrint,
  gst_report: GstReportPrint
};

function PrintTemplateHost({ templateKey, templateLabel, preview, data }) {
  const Template = TEMPLATE_COMPONENTS[templateKey];
  if (!Template) {
    return (
      <section className="certified-print-template">
        <div className="certified-print-missing">
          <strong>Template unavailable</strong>
          <p>{templateLabel || "Selected template"} is not available for this screen.</p>
        </div>
      </section>
    );
  }
  return <Template preview={preview} data={data} />;
}

export { PrintTemplateHost };
