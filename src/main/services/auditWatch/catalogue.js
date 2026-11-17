// Audit Watch check catalogue (AW-0).
//
// Audit Watch is a read-only exception finder: fixed, explainable checks over one
// company's books that list what an internal auditor or CA should look at. It never
// posts, edits or reverses anything, and no data leaves the machine.
//
// This file is the single source of truth for WHAT each check is: its area, the
// tables and columns it reads, its default limits and its plain-English wording.
// Each check also carries:
//   version  : raised whenever the check's logic changes, so a stored review of an
//              older finding can be set aside (AW-2);
//   scope    : "company" (reads one company's books) or "installation" (users and the
//              audit trail, shared by every company on the computer);
//   helpers  : shared read functions the check calls besides its own queries;
//   coverage : for checks that depend on how entries are keyed, what they look at;
//   waitsFor : for a check waiting on ACC, what will show it can run (a table, or a
//              name in the code); the verifier fails once it appears.
// The test suite traces the SQL each check actually runs and fails when `reads`
// leaves out a table or column, or names a table the check never opens.
// The queries that run the checks live beside it (AW-1). The AG-1 audit graph's
// detectiveControls section is generated from this file
// (node scripts/build-audit-watch-graph.js) and scripts/verify-audit-watch.js fails
// when the two disagree, when a check reads a column the database does not have,
// or when a check has no section in the Audit Watch guide (KG-5).
//
// Wording rule: a finding is an exception to look at, never an accusation. No
// check text says "fraud".

export const AUDIT_WATCH_VERSION = "1.0.0";

// Areas follow the six internal-audit areas. Payroll (area 5) waits for a payroll module.
export const AREAS = [
  { id: "procurement", label: "Purchases and payables" },
  { id: "sales", label: "Sales and receivables" },
  { id: "inventory", label: "Stock" },
  { id: "ledger", label: "Ledger and closing" },
  { id: "it", label: "Users and access" }
];

export const SEVERITIES = ["high", "medium", "low"];

// now        : the data exists today and the check runs.
// after_acc  : needs the ACC accounting branch (P-01..P-20) merged first; listed, not run.
export const READINESS = ["now", "after_acc"];

// Which roles see which areas (owner-approved plan, 17 Nov 2026 IST). Data entry
// operators and viewers do not see Audit Watch: a finding may be about their own work.
export const AREA_VISIBILITY = {
  super_admin: ["procurement", "sales", "inventory", "ledger", "it"],
  admin: ["procurement", "sales", "inventory", "ledger", "it"],
  accountant: ["procurement", "sales", "inventory", "ledger"],
  manager: ["procurement", "sales", "inventory"],
  data_entry_operator: [],
  viewer: []
};

const days = (value, label) => ({ default: value, unit: "days", label });
const percent = (value, label) => ({ default: value, unit: "percent", label });
const rupees = (value, label) => ({ default: value, unit: "rupees", label });
const count = (value, label) => ({ default: value, unit: "count", label });
const clock = (value, label) => ({ default: value, unit: "time", label });

export const CHECKS = [
  // ---------------------------------------------------------------- Purchases
  {
    id: "AW-P01",
    area: "procurement",
    title: "Same supplier bill entered twice",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      procurements: ["company_id", "id", "is_deleted", "posting_status", "purchase_date", "purchase_gst", "purchase_invoice_number", "purchase_value", "supplier_id"],
      suppliers: ["supplier_name"]
    },
    limits: { windowDays: days(7, "Same amount counts as a repeat within this many days") },
    meaning: "Two purchase bills from one supplier carry the same bill number in the same financial year (ignoring spaces, dashes, slashes, dots and case), or the same amount within a few days. Reversed bills do not count, and placeholders such as NA or 0 are not treated as bill numbers. The supplier could be paid twice for one supply.",
    nextStep: "Open both bills and compare them with the supplier's bill copy. Delete the duplicate if it was keyed twice."
  },
  {
    id: "AW-P02",
    area: "procurement",
    title: "Same supplier paid twice",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      supplier_payments: ["amount_paid", "company_id", "id", "is_deleted", "payment_date", "payment_mode", "posting_status", "supplier_id", "utr_number"],
      suppliers: ["supplier_name"]
    },
    limits: { windowDays: days(7, "Same amount counts as a repeat within this many days") },
    meaning: "Two supplier payments carry the same UTR, or the same supplier was paid the same amount within a few days. Reversed payments do not count, and short placeholders such as NA or CASH are not treated as UTRs.",
    nextStep: "Check the bank statement. If the money left twice, ask the supplier for a refund or adjust the next bill."
  },
  {
    id: "AW-P03",
    area: "procurement",
    title: "Supplier paid soon after its bank account changed",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      audit_log: ["action", "created_at", "id", "new_value", "old_value", "record_id", "table_name", "user_id"],
      supplier_payments: ["amount_paid", "company_id", "id", "is_deleted", "payment_date", "posting_status", "supplier_id"],
      suppliers: ["supplier_name"]
    },
    limits: { windowDays: days(15, "Flag payments made within this many days of the change") },
    meaning: "A supplier's bank account number, IFSC, bank name or UPI id was changed and the supplier was paid soon after. A changed account is the usual route for misdirected payments.",
    nextStep: "Confirm the new account with the supplier by phone on a number already on file, not one from the change request."
  },
  {
    id: "AW-P04",
    area: "procurement",
    title: "Supplier paid more than billed",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      procurements: ["company_id", "id", "is_deleted", "posting_status", "purchase_date", "purchase_gst", "purchase_invoice_number", "purchase_value", "supplier_id"],
      suppliers: ["supplier_name"],
      supplier_payment_allocations: ["allocated_amount", "is_deleted", "procurement_id"],
      advance_adjustments: ["adjusted_amount", "adjustment_type", "is_deleted", "procurement_id", "status"],
      procurement_items: ["gross_value", "is_deleted", "procurement_id"]
    },
    limits: { toleranceRupees: rupees(1, "Ignore differences up to this amount") },
    meaning: "Payments and advances set against a purchase bill add up to more than the bill. The extra is either an advance that belongs to another bill, or an overpayment.",
    nextStep: "Move the extra to the right bill or record it as an advance; ask for a refund of any overpayment."
  },
  {
    id: "AW-P05",
    area: "procurement",
    title: "Purchases split to stay under a limit",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      procurements: ["company_id", "id", "is_deleted", "posting_status", "purchase_date", "purchase_invoice_number", "purchase_value", "supplier_id"],
      suppliers: ["supplier_name"]
    },
    limits: {
      approvalLimitRupees: rupees(100000, "The company's purchase approval limit"),
      nearLimitPercent: percent(80, "A bill counts as near the limit from this share of it"),
      windowDays: days(7, "Bills within this many days count together"),
      minimumBills: count(2, "Flag this many near-limit bills or more")
    },
    meaning: "Several bills from one supplier within a week each sit just under the approval limit, while together they are over it.",
    nextStep: "Ask who approved the purchases and whether one order was split. Set the limit to the company's real approval limit."
  },
  {
    id: "AW-P06",
    area: "procurement",
    title: "Unusual purchase rate",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      procurement_items: ["company_id", "id", "is_deleted", "item_id", "procurement_id", "purchase_rate"],
      procurements: ["is_deleted", "posting_status", "purchase_date", "supplier_id"],
      items: ["item_name"],
      suppliers: ["supplier_name"]
    },
    limits: {
      abovePercent: percent(25, "Flag rates this far above the item's median"),
      lookbackDays: days(365, "Median taken over this many days"),
      minimumPurchases: count(3, "Need at least this many earlier purchases of the item")
    },
    meaning: "An item was bought well above the median rate the company paid for it over the past year.",
    nextStep: "Check for a genuine reason (urgent order, different model, price rise) and keep the note with the bill."
  },
  {
    id: "AW-P07",
    area: "procurement",
    title: "One bank account shared by two parties",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      suppliers: ["id", "is_deleted", "supplier_account_number", "supplier_bank_ifsc_code", "supplier_name"],
      procurements: ["company_id", "is_deleted", "supplier_id"],
      supplier_payments: ["company_id", "is_deleted", "supplier_id"],
      employees: ["account_number", "employee_name", "id", "ifsc", "is_deleted"]
    },
    limits: {},
    meaning: "Two suppliers, or a supplier and an employee, have the same bank account number and IFSC. Money paid to one may reach the other.",
    nextStep: "Ask both parties for a cancelled cheque or bank letter and correct the master that is wrong."
  },
  {
    id: "AW-P08",
    area: "procurement",
    title: "Payment to a supplier with no GSTIN or marked inactive",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      supplier_payments: ["amount_paid", "company_id", "id", "is_deleted", "payment_date", "posting_status", "supplier_id"],
      suppliers: ["gstin", "id", "is_deleted", "status", "supplier_name"]
    },
    limits: { minimumRupees: rupees(50000, "Flag payments from this amount") },
    meaning: "A sizeable payment went to a supplier that has no GSTIN on file or is marked inactive. Input GST cannot be claimed without the GSTIN, and an inactive supplier should not be receiving money.",
    nextStep: "Collect the GSTIN or confirm the supplier is unregistered; reactivate the supplier only if the payment is genuine."
  },
  {
    id: "AW-P09",
    area: "procurement",
    title: "Purchase order, goods receipt and bill do not agree",
    severity: "high",
    readiness: "after_acc",
    version: 1,
    scope: "company",
    // Purchase-order lines are what a three-way match compares; ACC P-01 adds them.
    waitsFor: { tables: ["purchase_order_items"] },
    reads: {
      purchase_orders: ["id", "company_id", "supplier_id", "total_value"],
      purchase_order_items: ["purchase_order_id", "item_id", "quantity", "rate"],
      goods_receipts: ["id", "company_id", "supplier_id", "procurement_id"]
    },
    limits: { tolerancePercent: percent(2, "Allowed difference between the three documents") },
    meaning: "The quantity or value on the supplier bill differs from the purchase order or the goods actually received (three-way match).",
    nextStep: "Waits for the purchase-order work (ACC P-01) to reach the main build."
  },

  // ---------------------------------------------------------------- Sales
  {
    id: "AW-S01",
    area: "sales",
    title: "Sold below cost or well below the quoted rate",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      invoice_items: ["billing_id", "billing_rate", "company_id", "id", "is_deleted", "order_item_id", "quantity"],
      invoices: ["invoice_date", "invoice_number", "is_deleted", "posting_status"],
      order_items: ["is_deleted", "item_description", "quoted_rate"],
      procurement_items: ["is_deleted", "landed_cost", "order_item_id", "procurement_id", "purchase_rate", "quantity"],
      procurements: ["posting_status"]
    },
    limits: { belowQuotePercent: percent(10, "Flag billing this far below the quoted rate") },
    meaning: "An item was billed below what it cost to buy and deliver, or well below the rate quoted on the order.",
    nextStep: "Check the order terms and any approved discount; correct the bill if the rate was keyed wrongly."
  },
  {
    id: "AW-S02",
    area: "sales",
    title: "Credit note dated after the bill's period",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    coverage: ["guided credit notes"],
    reads: {
      guided_vouchers: ["company_id", "id", "is_deleted", "payload_json", "status", "voucher_date", "voucher_kind"],
      invoices: ["company_id", "invoice_date", "invoice_number", "is_deleted"]
    },
    limits: {},
    meaning: "A credit note reduces a sales bill from an earlier month or financial year. Late credit notes move income between periods and need GST return care.",
    nextStep: "Confirm the reason and that the credit note is reported in the right GST return."
  },
  {
    id: "AW-S03",
    area: "sales",
    title: "Bill keyed late or dated before delivery",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      invoices: ["company_id", "created_at", "id", "invoice_date", "invoice_number", "is_deleted", "order_id", "posting_status"],
      delivery_challans: ["dispatch_date", "is_deleted", "order_id", "status"]
    },
    limits: { lateDays: days(7, "Flag bills keyed this many days after their date") },
    meaning: "A sales bill was entered well after its bill date (backdating), or carries a date before the goods were dispatched (cut-off).",
    nextStep: "Check the dates against the GeM portal and the challan. Income must fall in the period the goods were supplied."
  },
  {
    id: "AW-S04",
    area: "sales",
    title: "Receivable overdue past its credit terms",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      receivables: ["balance_outstanding", "billing_id", "company_id", "department_id", "due_date", "id", "invoice_date", "invoice_number", "is_deleted", "status"],
      government_departments: ["department_name"],
      credit_terms: ["default_credit_days", "grace_period", "is_deleted", "status"]
    },
    limits: { defaultCreditDays: days(30, "Credit days when a bill has no due date and no terms are set for the buyer"), graceDays: days(15, "Flag bills more than this many days past their due date") },
    meaning: "A sales bill is still unpaid well after its due date. The due date already includes the buyer's credit days and grace period.",
    nextStep: "Follow up with the department; check for a pending CRAC or deduction that is holding the payment."
  },
  {
    id: "AW-S05",
    area: "sales",
    title: "GeM contract billed twice or billed above the order",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      invoices: ["company_id", "gem_contract_number", "id", "invoice_date", "invoice_number", "is_deleted", "order_id", "posting_status"],
      invoice_items: ["billing_id", "is_deleted", "order_item_id", "quantity"],
      order_items: ["company_id", "id", "is_deleted", "item_description", "order_id", "quantity"],
      supply_orders: ["order_number"]
    },
    limits: {},
    meaning: "The same GeM contract number appears on bills for two different orders, or more quantity was billed than the order contains.",
    nextStep: "Compare with the GeM contract. Cancel the extra bill or raise a credit note."
  },
  {
    id: "AW-S06",
    area: "sales",
    title: "More received than billed",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      receivables: ["amount_received", "billing_id", "gst_tds_deducted", "id", "invoice_amount", "invoice_date", "invoice_number", "is_deleted", "other_deductions", "status", "tds_deducted"]
    },
    limits: { toleranceRupees: rupees(1, "Ignore differences up to this amount") },
    meaning: "Receipts and deductions against a bill add up to more than the bill. Either a receipt went to the wrong bill or a refund is due.",
    nextStep: "Reallocate the receipt to the right bill, or record the refund due to the buyer."
  },
  {
    id: "AW-S07",
    area: "sales",
    title: "Large deduction by the buyer",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: { receivables: ["billing_id", "id", "invoice_amount", "invoice_date", "invoice_number", "is_deleted", "other_deductions", "status"] },
    limits: { abovePercent: percent(5, "Flag other deductions above this share of the bill") },
    meaning: "The buyer kept back a large amount as 'other deductions' (not TDS or GST TDS), such as a penalty or short payment.",
    nextStep: "Get the department's deduction letter. Claim it back if it is wrong, or book it to the right expense."
  },

  // ---------------------------------------------------------------- Stock
  {
    id: "AW-I01",
    area: "inventory",
    title: "Negative stock",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    helpers: ["stockBalance"],
    reads: {
      stock_ledger: ["company_id", "document_number", "id", "inward_quantity", "is_deleted", "item_id", "outward_quantity", "transaction_date", "warehouse_id"],
      items: ["default_warehouse_id", "id", "item_name", "opening_stock"],
      warehouses: ["warehouse_name"]
    },
    limits: {},
    meaning: "The stock register shows less than zero of an item in a warehouse. The posting guards should stop this, so a hit means stock went out before it was received or a guard was bypassed.",
    nextStep: "Find the inward entry that is missing or late and record it with its real date."
  },
  {
    id: "AW-I02",
    area: "inventory",
    title: "Slow-moving stock",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    helpers: ["stockBalance"],
    reads: {
      stock_ledger: ["company_id", "inward_quantity", "is_deleted", "item_id", "outward_quantity", "transaction_date", "warehouse_id"],
      items: ["created_at", "default_warehouse_id", "id", "is_deleted", "item_name", "opening_stock"],
      warehouses: ["id", "status", "warehouse_name"]
    },
    limits: { idleDays: days(180, "Flag items with stock and no movement for this many days") },
    meaning: "An item has stock on hand but has not moved for months, including opening stock that has never moved. Money is tied up and the stock may be obsolete.",
    nextStep: "Plan to use, return or sell the stock; consider writing down its value at year end."
  },
  {
    id: "AW-I03",
    area: "inventory",
    title: "Large or frequent stock adjustments",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      stock_adjustments: ["adjustment_date", "adjustment_type", "company_id", "id", "is_deleted", "item_id", "posting_status", "quantity", "rate", "reason"],
      items: ["item_name"],
      stock_ledger: ["is_deleted", "source_id", "source_module", "value", "value_minor"]
    },
    limits: {
      minimumRupees: rupees(25000, "Flag one adjustment from this value"),
      repeatCount: count(3, "Flag an item adjusted this many times"),
      windowDays: days(30, "Repeats counted within this many days")
    },
    meaning: "Stock was adjusted by a large value (the value actually posted, which for a write-off keyed without a rate is the average cost), or the same item was adjusted again and again. Adjustments change stock without a supplier or buyer document.",
    nextStep: "Check the reason and the physical count sheet for each adjustment."
  },
  {
    id: "AW-I04",
    area: "inventory",
    title: "Many damaged returns from one supplier",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      stock_returns: ["company_id", "condition_status", "id", "is_deleted", "posting_status", "quantity", "return_date", "supplier_id"],
      suppliers: ["supplier_name"]
    },
    limits: { minimumReturns: count(3, "Flag a supplier with this many damaged returns"), lookbackDays: days(180, "Counted over this many days") },
    meaning: "A supplier's goods keep coming back damaged or defective.",
    nextStep: "Review the supplier's quality and claim credit notes for every damaged return."
  },
  {
    id: "AW-I05",
    area: "inventory",
    title: "Serial number used twice",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      serial_numbers: ["id", "is_deleted", "item_id", "serial_number", "status"],
      items: ["item_name"]
    },
    limits: {},
    meaning: "The same serial number of an item is recorded more than once. One physical unit cannot be bought or delivered twice.",
    nextStep: "Check the unit's label and correct the wrong entry."
  },
  {
    id: "AW-I06",
    area: "inventory",
    title: "Expired batch still in stock",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      batches: ["balance_quantity", "batch_number", "expiry_date", "id", "is_deleted", "item_id"],
      items: ["item_name"]
    },
    limits: {},
    meaning: "A batch past its expiry date still shows quantity on hand.",
    nextStep: "Remove expired stock from saleable stock and record the write-off."
  },
  {
    id: "AW-I07",
    area: "inventory",
    title: "Bought more than the order needs, or billed more than delivered",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      procurement_items: ["is_deleted", "order_item_id", "procurement_id", "quantity"],
      order_items: ["company_id", "id", "is_deleted", "item_description", "order_id", "quantity"],
      supply_orders: ["id", "order_number"],
      procurements: ["is_deleted", "posting_status", "purchase_date"],
      invoice_items: ["billing_id", "company_id", "is_deleted", "item_id", "quantity"],
      invoices: ["invoice_date", "is_deleted", "order_id", "posting_status"],
      delivery_challan_items: ["delivery_challan_id", "item_id", "quantity"],
      delivery_challans: ["company_id", "id", "is_deleted", "order_id", "status"],
      items: ["item_name"]
    },
    limits: { tolerancePercent: percent(0, "Allowed excess over the order") },
    meaning: "More was purchased against an order line than the order asks for, or more was billed on an order than was delivered on confirmed delivery challans. Orders that use no delivery challan are not compared.",
    nextStep: "Find where the extra stock went, or hold the bill until delivery is complete."
  },

  // ---------------------------------------------------------------- Ledger
  {
    id: "AW-G01",
    area: "ledger",
    title: "Hand-made journal to a sensitive ledger",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    coverage: ["manual vouchers", "guided journals and contras"],
    reads: {
      vouchers: ["id", "is_deleted", "narration", "source_id", "source_module", "status", "voucher_date", "voucher_number", "voucher_type"],
      voucher_lines: ["account_id", "debit_minor", "is_deleted"],
      accounts: ["account_name", "id"],
      guided_vouchers: ["voucher_kind"],
      account_group_assignments: ["account_group_id", "status"],
      account_groups: ["group_code"]
    },
    limits: { minimumRupees: rupees(10000, "Flag journals from this amount") },
    meaning: "A journal typed by hand (a manual voucher, or a journal or contra keyed through Guided Vouchers) moves money in cash or bank, capital, GST or a suspense ledger, judged by each ledger's account group. These ledgers normally move only through receipts, payments and bills.",
    nextStep: "Read the narration and supporting paper; make sure a second person approved it."
  },
  {
    id: "AW-G02",
    area: "ledger",
    title: "Entry on a Sunday or outside office hours",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      vouchers: ["created_at", "id", "is_deleted", "source_module", "status", "voucher_date", "voucher_number", "voucher_type"],
      voucher_lines: ["debit_minor", "is_deleted"]
    },
    limits: { officeStart: clock("09:00", "Office opens (IST)"), officeEnd: clock("20:00", "Office closes (IST)") },
    meaning: "A voucher is dated on a Sunday, or was keyed outside office hours. Not wrong in itself, but entries made when nobody is watching deserve a second look.",
    nextStep: "Confirm who made the entry and why it could not wait."
  },
  {
    id: "AW-G03",
    area: "ledger",
    title: "Round-sum journal",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    coverage: ["manual vouchers", "guided journals and contras"],
    reads: {
      vouchers: ["id", "is_deleted", "narration", "source_id", "source_module", "status", "voucher_date", "voucher_number", "voucher_type"],
      voucher_lines: ["debit_minor", "is_deleted"],
      guided_vouchers: ["voucher_kind"]
    },
    limits: { minimumRupees: rupees(100000, "Flag from this amount"), roundTo: rupees(10000, "Amount is an exact multiple of this") },
    meaning: "A large journal is an exact round figure. Real transactions rarely land on round sums; estimates and plugs often do.",
    nextStep: "Ask for the calculation behind the figure."
  },
  {
    id: "AW-G04",
    area: "ledger",
    title: "Suspense or clearing balance left open",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      ledger_entries: ["account_id", "credit_minor", "debit_minor", "entry_date", "is_deleted", "voucher_id"],
      accounts: ["account_name", "company_id", "id"],
      vouchers: ["is_deleted", "status"],
      account_group_assignments: ["account_group_id", "status"],
      account_groups: ["group_code"]
    },
    limits: { openDays: days(30, "Flag balances older than this") },
    meaning: "A suspense or clearing ledger (such as Opening Balance Suspense or Goods Received Not Invoiced) still holds a balance from more than a month ago. These ledgers should empty out.",
    nextStep: "Clear each old item to its proper ledger."
  },
  {
    id: "AW-G05",
    area: "ledger",
    title: "Backdated voucher",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    coverage: ["manual vouchers", "guided vouchers", "any voucher posted into a closed year"],
    reads: {
      vouchers: ["created_at", "financial_year_id", "id", "is_deleted", "source_id", "source_module", "status", "voucher_date", "voucher_number", "voucher_type"],
      guided_vouchers: ["created_at"],
      financial_years: ["closed_at", "financial_year_name", "status"]
    },
    limits: { lateDays: days(7, "Flag vouchers dated this many days before they were keyed") },
    meaning: "A voucher whose date a person chose carries a date well before the day it was keyed, or any voucher was entered into a year after it was closed. Backdating can push income or expense into a period that was already reported. Bills and payments that take their document's date are not counted; late sales bills are AW-S03's.",
    nextStep: "Confirm the real transaction date and that reports already filed are not affected."
  },
  {
    id: "AW-G06",
    area: "ledger",
    title: "Many reversals, or reversal of an old voucher",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      vouchers: ["id", "is_deleted", "reversal_date", "reversed_by", "status", "voucher_date", "voucher_number", "voucher_type"],
      users: ["username"]
    },
    limits: { oldDays: days(60, "A reversal this long after the voucher date is late"), repeatCount: count(5, "Flag a user with this many reversals"), windowDays: days(30, "Reversals counted within this many days") },
    meaning: "A voucher was reversed long after its date, or one user reversed many vouchers in a short time.",
    nextStep: "Check each reason; repeated reversals point to a training gap or a process being worked around."
  },
  {
    id: "AW-G07",
    area: "ledger",
    title: "Bank line left unmatched",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      bank_statement_entries: ["amount", "bank_id", "company_id", "credit", "debit", "id", "is_deleted", "match_status", "narration", "posted_bank_book_id", "review_status", "transaction_date", "voucher_id"],
      banks: ["bank_name"],
      vouchers: ["is_deleted", "status"]
    },
    limits: { openDays: days(15, "Flag lines unmatched for this many days") },
    meaning: "A line from an imported bank statement is not in the books: it was neither matched, booked through a voucher proposal, nor reconciled. A suggested match nobody confirmed still counts as open.",
    nextStep: "Match it in Bank Reconciliation, or record the missing receipt, payment or bank charge."
  },
  {
    id: "AW-G08",
    area: "ledger",
    title: "First digits do not follow the usual pattern",
    severity: "low",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      vouchers: ["id", "is_deleted", "source_module", "status", "voucher_date"],
      voucher_lines: ["account_id", "credit_minor", "debit_minor", "is_deleted"],
      accounts: ["account_name", "id"]
    },
    limits: { minimumRows: count(300, "Run only on ledgers with this many entries"), tolerance: percent(15, "Flag when the first-digit spread differs by more than this (MAD x 1000)") },
    meaning: "In natural business amounts, about 30% start with 1 and fewer start with each higher digit (Benford's law). A ledger whose amounts break that pattern may have invented or repeated figures.",
    nextStep: "Look at the digits that are over-represented and sample those entries."
  },
  {
    id: "AW-G09",
    area: "ledger",
    title: "Cash in hand below zero",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      ledger_entries: ["account_id", "credit_minor", "debit_minor", "entry_date", "is_deleted", "voucher_id"],
      accounts: ["account_name", "company_id", "id", "opening_balance", "opening_balance_minor"],
      vouchers: ["is_deleted", "status"],
      account_group_assignments: ["account_group_id", "status"],
      account_groups: ["group_code"]
    },
    limits: {},
    meaning: "On some day a cash-in-hand ledger (any ledger in the cash group other than a bank) shows more paid out than ever came in. Physical cash cannot go negative, so a receipt is missing or a payment is wrong.",
    nextStep: "Find the cash receipt that should come before the payment and record it with its real date."
  },
  {
    id: "AW-G10",
    area: "ledger",
    title: "Book integrity",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    helpers: ["bookIntegrityChecks"],
    reads: {
      ledger_entries: ["credit_minor", "debit_minor", "is_deleted", "voucher_id"],
      vouchers: ["company_id", "id", "is_deleted", "status"],
      audit_log: ["event_hash", "id"]
    },
    limits: {},
    meaning: "The existing book checks: the trial balance ties, every voucher balances, no posting is stuck, and the audit trail's hash chain is unbroken. Negative stock and over-collected bills are shown by AW-I01 and AW-S06 instead, so they are not counted twice.",
    nextStep: "Open Error Console for the details."
  },

  // ---------------------------------------------------------------- Users and access
  {
    id: "AW-T01",
    area: "it",
    title: "Admin account unused for a long time",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "installation",
    reads: { users: ["created_at", "display_name", "id", "last_login_at", "role", "status", "username"] },
    limits: { idleDays: days(90, "Flag admin accounts unused for this many days") },
    meaning: "An active admin or super admin account has not logged in for months. Unused powerful accounts are easy to misuse.",
    nextStep: "Disable the account, or confirm who still needs it."
  },
  {
    id: "AW-T02",
    area: "it",
    title: "Repeated failed logins or locked account",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "installation",
    reads: { users: ["failed_login_count", "id", "locked_until", "role", "username"] },
    limits: { failedLogins: count(3, "Flag accounts with this many failed attempts") },
    meaning: "Someone keeps entering the wrong password for an account, or the account is locked.",
    nextStep: "Ask the user whether it was them. Reset the password if not."
  },
  {
    id: "AW-T03",
    area: "it",
    title: "Maker and approver are the same person",
    severity: "high",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      guided_vouchers: ["approved_by", "company_id", "created_by", "id", "is_deleted", "status", "submitted_by", "voucher_date", "voucher_kind"],
      users: ["username"],
      audit_log: ["action", "record_id", "table_name", "user_id"],
      approval_queue: ["approval_status", "approved_at", "checker_id", "company_id", "created_at", "id", "is_deleted", "maker_id", "module_name", "record_id"]
    },
    limits: {},
    meaning: "One user both prepared (keyed or submitted) and approved the same voucher or record, so the second check never happened.",
    nextStep: "Have another user review it. If the company runs with one user, record that decision."
  },
  {
    id: "AW-T04",
    area: "it",
    title: "Sensitive master change",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "company",
    reads: {
      audit_log: ["action", "company_id", "created_at", "id", "new_value", "old_value", "record_id", "table_name", "user_id"],
      users: ["username"]
    },
    limits: { lookbackDays: days(30, "Show changes from this many days") },
    meaning: "Bank details or an employee's incentive percentage were changed, one record at a time or in bulk through Master Data Tools. A user's role raised to admin is also shown once the app records role changes; it does not record them yet.",
    nextStep: "Confirm each change was requested and approved."
  },
  {
    id: "AW-T05",
    area: "it",
    title: "Audit trail gap",
    severity: "medium",
    readiness: "now",
    version: 1,
    scope: "installation",
    reads: { audit_log: ["action", "company_id", "created_at", "id", "table_name", "user_id"] },
    limits: { lookbackDays: days(30, "Look at actions from this many days") },
    meaning: "Changes to records were logged without the user who made them, so they cannot be traced to a person.",
    nextStep: "Tell the developers; the screen or import that wrote these rows must record the user."
  },
  {
    id: "AW-T06",
    area: "it",
    title: "Accounting policy setting changed",
    severity: "medium",
    readiness: "after_acc",
    version: 1,
    scope: "company",
    // ACC P-18 adds the single-user mode setting this check watches.
    waitsFor: { codeMarker: "single_user_mode" },
    reads: { audit_log: ["id", "action", "table_name", "created_at"] },
    limits: {},
    meaning: "A company-level accounting policy (such as maker-checker or single-user mode) was changed.",
    nextStep: "Waits for the accounting policy settings (ACC P-18) to reach the main build."
  }
];

export function checkById(id) {
  return CHECKS.find((check) => check.id === id) || null;
}

export function areasForRole(role) {
  return AREA_VISIBILITY[String(role || "").toLowerCase()] || [];
}
