// The screens use the same paise arithmetic as the backend, so a total shown
// before saving is exactly the total that is saved and posted.
export { paise, rupees, roundMoney, sumRupees, addRupees, subtractRupees, rupeesEqual } from "../../main/domain/money.js";
export { invoiceLineAmounts } from "../../main/domain/invoiceMath.js";
