// Shared by the main process and the screens; keep it free of Node and Electron APIs.
import { roundMoney } from "./money.js";

// One invoice line's money, rounded to the paisa exactly as it is saved and posted.
// The billing service and the invoice entry screen both use this, so the preview
// always shows the figures that will be stored.
export function invoiceLineAmounts({ quantity, billingRate, taxableValue, gstRate, gstType = "CGST/SGST" }) {
  const taxable = roundMoney(Number(taxableValue || (Number(quantity || 0) * Number(billingRate || 0)) || 0));
  const rate = Number(gstRate || 0);
  const gstAmount = roundMoney(taxable * rate / 100);
  // The split follows the GST type chosen on the invoice: IGST, CGST only, SGST only, or CGST + SGST half each.
  const single = ["IGST", "CGST", "SGST"].includes(gstType);
  const cgst = gstType === "CGST" ? gstAmount : single ? 0 : roundMoney(gstAmount / 2);
  const sgst = gstType === "SGST" ? gstAmount : single ? 0 : roundMoney(gstAmount - cgst);
  const igst = gstType === "IGST" ? gstAmount : 0;
  return {
    taxable_value: taxable,
    gst_rate: rate,
    cgst,
    sgst,
    igst,
    gst_amount: gstAmount,
    gross_value: roundMoney(taxable + gstAmount)
  };
}
