// Posting-source registry: every value the app writes to vouchers.source_module (and to
// the stock and cash-bank ledgers' source_module) is classified here, once.
//
//   manual       : a person typed the whole voucher (Manual Voucher screen).
//   guided       : a person keyed it through Guided Vouchers; its voucher_kind decides
//                  whether it is a free journal (HAND_KEYED_GUIDED_KINDS) or a
//                  document-style entry (receipt, payment, sales, purchase, notes).
//   document     : posted from a business document (bill, payment, stock movement).
//   system_dated : written by the app with a date it chooses (opening balances,
//                  reversals, rounding settlements); its date is not keyed by a person.
//
// Audit Watch reads this registry instead of keeping its own lists, and
// scripts/verify-audit-watch.js fails when posting code uses a source_module that is
// not classified here, so a new posting path can never make a check go quiet unseen.

import { ROUNDING_ADJUSTMENT_SOURCE, VOUCHER_REVERSAL_SOURCE } from "./ledgerGuards.js";

export const SOURCE_CLASSES = ["manual", "guided", "document", "system_dated"];

export const POSTING_SOURCES = Object.freeze({
  manual_voucher: "manual",
  guided_vouchers: "guided",
  business_voucher: "guided",
  billing: "document",
  procurement: "document",
  payment: "document",
  supplier_payment: "document",
  expense: "document",
  stock_inwards: "document",
  stock_outwards: "document",
  stock_adjustments: "document",
  stock_returns: "document",
  warehouse_transfers: "document",
  voucher_proposal: "document",
  opening_balance: "system_dated",
  [VOUCHER_REVERSAL_SOURCE]: "system_dated",
  [ROUNDING_ADJUSTMENT_SOURCE]: "system_dated"
});

// Guided voucher kinds whose lines a person chooses freely, like a manual journal.
export const HAND_KEYED_GUIDED_KINDS = Object.freeze(["journal", "journal_voucher", "contra", "contra_voucher"]);
// Guided voucher kinds whose lines the app builds from a document-style form. Every kind
// the posting code handles must be in exactly one of these two lists;
// scripts/verify-audit-watch.js fails otherwise, so a new kind gets a decision.
export const DOCUMENT_STYLE_GUIDED_KINDS = Object.freeze([
  "receipt", "receipt_voucher", "customer_receipt", "advance_receipt",
  "supplier_payment", "payment", "payment_voucher",
  "sales", "sales_voucher", "purchase", "purchase_voucher",
  "expense", "expense_voucher", "commission", "commission_voucher",
  "employee_incentive", "employee_incentive_voucher",
  "credit_note", "debit_note"
]);

export const sourcesOfClass = (sourceClass) => Object.keys(POSTING_SOURCES).filter((source) => POSTING_SOURCES[source] === sourceClass);

// "('a', 'b')" for use inside SQL. The values come from this file only, never from input.
export const sqlList = (values) => `(${values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(", ")})`;
