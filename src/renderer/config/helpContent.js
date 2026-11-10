const workflowGuide = [
  ["Supply Order", "Create the government order with department, institution, employee and due date."],
  ["Stock Reservation", "Reserve available stock or mark shortage for procurement planning."],
  ["Procurement", "Record supplier purchase bill, GST, freight and loading charges."],
  ["Stock Receipt", "Post received goods into warehouse stock after verification."],
  ["Delivery Challan", "Prepare and confirm dispatch to institution or consignee."],
  ["Stock Issue and COGS", "Issue stock, reduce inventory and create cost of goods sold entry."],
  ["Billing", "Raise government supply invoice and post sales/GST voucher."],
  ["Receivable and Payment", "Track outstanding, deductions, receipt and allocation."],
  ["Profitability", "Review gross margin, GST impact, expenses, incentive and net profit."]
];

const detailedWorkflowGuide = [
  ["Supply Order", "Operations > Supply Orders", "Create the official government order reference, department, institution, employee, due date and status."],
  ["Stock Reservation", "Inventory > Planning & Control > Stock Reservations", "Reserve available stock or mark shortage for procurement requirement."],
  ["Procurement", "Operations > Procurement", "Record supplier purchase bill, GST, freight and order-linked procurement cost."],
  ["GRN", "Inventory > Documents > Goods Receipt Notes", "Verify goods received from supplier before stock is considered available."],
  ["Stock Receipt", "Inventory > Transactions > Stock Inward", "Post accepted quantity into warehouse stock with rate, GST and landed cost."],
  ["Delivery Challan", "Inventory > Documents > Delivery Challans", "Prepare and confirm dispatch to department, institution or consignee."],
  ["Stock Issue", "Inventory > Transactions > Stock Outward", "Issue stock from warehouse against order and reduce available quantity."],
  ["COGS", "Accounting > Books & Ledgers", "Recognize cost of goods sold from posted stock issue where inventory accounting is enabled."],
  ["Billing", "Operations > Billing", "Raise invoice, calculate GST, attach documents and prepare receivable."],
  ["Receivable", "Receivables & Payables > Receivables", "Track department-wise bill outstanding and ageing."],
  ["Payment", "Receivables & Payables > Allocations", "Record receipt, TDS, GST TDS and allocate payment bill-wise."],
  ["Profitability", "Profitability > Order Profitability", "Review billing, purchase cost, GST impact, expenses, incentive and net profit."],
  ["Order Closure", "Operations > Supply Orders", "Close order after supply, billing, receipt, documents and profitability review are complete."]
];

const faqItems = [
  ["Why is a voucher not posting?", "Check Posting Queue for missing financial year, missing party, locked year, unbalanced lines, missing GST values or source record validation errors."],
  ["Where do I see what went wrong?", "Open ERP Health Center > Error Console. Each failed action shows what failed, where it failed, the screen to fix it on and the next step."],
  ["Why is a record locked?", "Posted and reversed records are locked to protect ledgers, GST, receivables, payables, inventory and audit history. Use reversal or correction workflow."],
  ["Why is trial balance not matching?", "Review recent manual journals, reversals, failed postings and opening balances. Trial balance should use posted ledger entries only."],
  ["What is GST impact?", "GST impact is the tax effect visible from purchase, sales and profitability flows. It should be reviewed against posted purchases, invoices and GST ledgers."],
  ["What is profitability?", "Profitability compares billing, procurement or inventory cost, GST impact, order expenses and employee incentive to show net company profit."],
  ["What is stock reservation?", "Stock reservation blocks available stock for a supply order or highlights shortage for procurement planning."],
  ["Why is a payment not allocated?", "Receipt entry alone may not close invoices. Use receipt allocation to connect payment, TDS, GST TDS and other deductions to invoice bills."],
  ["Why is a supplier bill still outstanding?", "Supplier payment may be unallocated, partly allocated, posted to the wrong supplier, or not approved/posted."],
  ["Can I post accounting entries directly from bank import?", "No. Imported bank rows must be reviewed, approved and converted through voucher proposal or matching workflow."],
  ["Does Training Mode affect accounts?", "No. Training Mode displays sample data and guidance only. It does not write live vouchers, stock or accounting data."],
  ["Where should supplier bills be entered?", "Use Procurement for order-linked purchase bills, then complete stock receipt, payable and posting workflow as applicable."],
  ["How do I recover from wrong import?", "Use import preview and error report before saving. For item import batches, use batch delete only when records are unused."]
];

const troubleshootingItems = [
  ["Voucher Posting Issues", "Open Posting Queue, read the blocking reason, fix source data, then retry only safe failed records. Never bypass posting by manual journal unless approved."],
  ["GST Issues", "Confirm GST rate, GST type, invoice date, purchase GST and posted status. GST reports should be reviewed after all related vouchers are posted."],
  ["Inventory Issues", "Review Stock Summary, Stock Ledger, Reservations, GRN and Stock Outward records. Avoid adjustment unless physical verification supports it."],
  ["Bank Reconciliation Issues", "Check duplicate UTR, date, amount, narration and bank account mapping before approving imported bank rows."],
  ["Backup and Restore Issues", "Create a backup before restore, confirm file timestamp, restore, reload the app, then run accounting verification."],
  ["Approval Queue Issues", "Check approval role, missing reason, source record status and locked financial year before approving."],
  ["Financial Year Issues", "Confirm voucher date falls in an open year. Closed years should block posting and direct editing."],
  ["Invoice Not Visible in Receivables", "Confirm invoice is saved, linked to order and department, and posted where receivable reporting requires posted records."],
  ["Payment Not Reducing Outstanding", "Check receipt allocation, TDS, GST TDS and other deductions. Unallocated payments do not fully explain bill-wise outstanding."],
  ["Stock Not Available for Issue", "Check warehouse, item, reserved quantity, accepted GRN quantity and stock ledger balance."],
  ["Error Console", "Open ERP Health Center > Error Console. It lists book integrity checks (trial balance, unbalanced vouchers, negative stock, over-collected invoices, audit trail), documents that failed to post, and every recent failed action with where to fix it and the next step."],
  ["Document Already Posted", "A posted or reversed document cannot be posted again. Open its voucher; to correct it, reverse the voucher and post a fresh entry. A second Post click never changes a posted document."],
  ["Reversing a Voucher", "Only posted vouchers can be reversed, and a reversal cannot itself be reversed. The reversal is dated today, releases receipt and payment allocations and advances, and moves any stock back exactly once. The original stays in its own period."],
  ["Stock Reversal Refused", "A stock inward cannot be reversed if its goods were already issued, because the warehouse would go below zero. Reverse the later issue first, then reverse the inward."],
  ["Bank Line Already Booked", "A bank statement line that matches a receipt or supplier payment already posted shows as Already Booked. It is reconciled and cannot be approved, so the money is never booked twice."],
  ["Receipt Allocation", "A posted receipt settles the invoice named on it, otherwise the oldest open invoices of the order first. Any amount left stays unallocated. TDS, GST TDS and other deductions on the receipt are posted to their own ledgers."],
  ["Advance Limits", "An advance cannot be larger than the unallocated part of its receipt, and the receipt must be posted first. Release an earlier allocation if you need the amount back."],
  ["Balance Sheet Before Year Close", "Until the previous financial year is closed, the balance sheet reads the whole ledger and shows the earlier year's profit as 'Profit of earlier years (year not yet closed)'. Close the year to carry balances forward."],
  ["Restore Refused", "Restore checks the file is a real, undamaged ERP database before touching anything. A refused file leaves the live database unchanged. A safety copy of the live database is kept before every restore."],
  ["Company Reset", "Reset clears one company's transactions only, including its supply orders, installations, procurement plans and posted opening balances. Leads, quotations, negotiations and purchase orders are kept, with their links to the deleted orders cleared. Select the company, type RESET exactly and use an admin account. A pre_reset backup is taken first and the reset is written to the audit log; Rollback restores that backup."],
  ["Session Timed Out", "After 60 minutes without activity the ERP asks you to sign in again. Five wrong passwords lock the account for a while; an admin can reset it."],
  ["Voucher Numbers", "Voucher and invoice numbers continue from the highest number ever issued in the series, so a deleted number is never handed out again."],
  ["Dues and Stock Alerts", "Settings > Alerts shows the pending dues and stock-in-hand summary. Email or WhatsApp sending is off until an admin enters the connection details and turns it on; nothing is ever sent automatically without that."]
];

const knowledgeBaseItems = [
  ["Receivable", "Amount recoverable from a government department or institution against posted invoice and bill-wise allocation."],
  ["Payable", "Amount payable to supplier, employee, expense party or statutory party after purchase, expense or adjustment entry."],
  ["GST Impact", "Effect of input GST, output GST and margin-based GST treatment on order profitability and tax reporting."],
  ["COGS", "Cost of Goods Sold. Inventory cost recognized when stock is issued or consumed for supply."],
  ["Stock Reservation", "Operational hold on stock for a specific supply order before dispatch."],
  ["Procurement Requirement", "Shortage identified from order demand versus available or reserved stock."],
  ["Opening Balance", "Starting account, party or stock balance brought into the system at the beginning of ERP use or financial year."],
  ["Party Ledger", "Ledger-style view for department, supplier or party showing debit, credit and running balance."],
  ["Credit Note", "Voucher used to reduce sales, receivable and GST where applicable, usually due to return, correction or rate difference."],
  ["Debit Note", "Voucher used to reduce supplier payable or increase claim against supplier, usually due to supplier return or rate difference."],
  ["Contra Voucher", "Cash to bank, bank to cash or bank to bank movement without sales or purchase impact."],
  ["Voucher Proposal", "Draft accounting suggestion generated from bank import or operational event before review and approval."],
  ["Year-End Closing", "Controlled process to close financial period, restrict posting and prepare carry-forward balances."],
  ["Posting Queue", "Control view for source records waiting to create accounting impact or showing posting errors."],
  ["Approval Queue", "Control view where authorized users approve or reject sensitive transactions before posting."],
  ["Bill-wise Outstanding", "Invoice-wise receivable/payable position after allocations, deductions and advances."],
  ["GRN", "Goods Receipt Note confirming stock received into warehouse from procurement."],
  ["Delivery Challan", "Dispatch document for supply to department, institution or consignee."],
  ["Audit Log", "System evidence of critical create, edit, delete, post, reverse, import, backup and approval actions."]
];

const keyboardGuideSections = [
  ["General Navigation", [["Enter", "Move to next editable field"], ["Shift + Enter", "Move to previous editable field"], ["Alt + Left Arrow", "Return to previous screen"], ["Backspace", "Return to previous screen when not typing"], ["Browser Back", "Return to previous screen from supported keyboards or mouse buttons"], ["Esc", "Close modal/dropdown or safely exit screen"], ["Alt + Home", "Return to Dashboard"], ["Ctrl + K", "Open Global Search"], ["Ctrl + Shift + K", "Open advanced search where available"], ["F1", "Open Keyboard Shortcut Guide"], ["F11", "Toggle full screen"], ["F12", "User Preferences"]]],
  ["Dashboard", [["Ctrl + 1", "Open Dashboard"], ["Ctrl + R", "Refresh Dashboard"], ["F5", "Refresh current screen"], ["Ctrl + P", "Print current screen"]]],
  ["Masters", [["Ctrl + 2", "Open Masters group"], ["Ctrl + N", "Create new record"], ["Ctrl + E", "Edit selected record"], ["Ctrl + F", "Focus search"], ["F10", "Quick create from supported transaction field"], ["Shift + F10", "Open alternate quick-create action where supported"]]],
  ["Supply Orders", [["F2", "New Order"], ["F3", "Edit Selected Order"], ["F4", "View Selected Order"], ["F6", "Generate Procurement"], ["F7", "Reserve Stock"], ["F8", "Generate Invoice"]]],
  ["Procurement", [["F6", "Generate Procurement from selected order"], ["F10", "Quick create supplier, item or warehouse where supported"], ["Ctrl + S", "Save procurement form"]]],
  ["Inventory", [["Ctrl + 4", "Open Inventory group"], ["F2", "Stock Receipt"], ["F3", "Stock Issue"], ["F4", "Stock Transfer"], ["F5", "Stock Adjustment"], ["Alt + I", "Stock Issue"], ["Alt + G", "Stock Receipt (GRN)"], ["Alt + T", "Warehouse Transfer"], ["Alt + A", "Stock Adjustment"]]],
  ["Billing", [["F8", "Generate Invoice from selected order"], ["F10", "Quick create item, department, institution or bank where supported"], ["Ctrl + S", "Save invoice"], ["Ctrl + P", "Print invoice or report preview"]]],
  ["Receivables", [["Ctrl + 6", "Open Receivables"], ["Alt + R", "Receipt Voucher"], ["Ctrl + F", "Search outstanding"], ["Ctrl + E", "Edit selected permitted record"]]],
  ["Payables", [["Ctrl + 7", "Open Payables"], ["Alt + P", "Payment Voucher"], ["Ctrl + F", "Search payable"], ["Ctrl + E", "Edit selected permitted record"]]],
  ["Accounting", [["Ctrl + 5", "Open Accounting"], ["Alt + R", "Receipt Voucher"], ["Alt + P", "Payment Voucher"], ["Alt + S", "Sales Voucher"], ["Alt + U", "Purchase Voucher"], ["Alt + J", "Journal Voucher"], ["Alt + C", "Contra Voucher"], ["Alt + N", "Credit Note"], ["Alt + D", "Debit Note"]]],
  ["GST", [["Ctrl + 8", "Open GST group"], ["Ctrl + F", "Search tax report"], ["Ctrl + P", "Print tax report"], ["Ctrl + R", "Refresh tax report"]]],
  ["Reports", [["Ctrl + 9", "Open Reports"], ["Ctrl + P", "Print"], ["Ctrl + E", "Export"], ["Ctrl + F", "Search"], ["Ctrl + R", "Refresh"]]],
  ["Financial Control", [["Ctrl + Shift + P", "Production Health Dashboard"], ["Ctrl + Shift + L", "Audit Log"], ["Ctrl + Shift + B", "Create Backup"], ["Ctrl + Shift + R", "Open Restore Backup"]]],
  ["Help and Training", [["F1", "Open shortcut guide"], ["Ctrl + K", "Search ERP"], ["Esc", "Close help dialog"], ["Ctrl + P", "Print or save manual through preview"]]],
  ["Tally Key Layout (optional, switch on in User Preferences, F12)", [["F4", "Contra Voucher"], ["F5", "Payment Voucher"], ["F6", "Receipt Voucher"], ["F7", "Journal Voucher"], ["F8", "Sales Voucher"], ["F9", "Purchase Voucher"], ["Ctrl + F8", "Credit Note"], ["Ctrl + F9", "Debit Note"], ["F2", "Change the date of the entry being made"], ["Alt + C", "Create a master from the party, ledger or item field"], ["Enter", "On the last voucher line, adds a new line"], ["Ctrl + R", "Refresh (F5 opens Payment in this layout)"]]]
];

const erpManualSections = [
  ["Introduction", "GII GeM ERP is an offline Windows ERP for government supply order lifecycle, accounting, inventory, GST, profitability and controls."],
  ["Getting Started", "Create company, employees, departments, suppliers, items, warehouses, expense heads and banks before entering live transactions."],
  ["System Overview", "The ERP is organized into Dashboard, Masters, Operations, Inventory, Accounting, Receivables and Payables, GST and Tax, Financial Control, Reports, Help and Settings."],
  ["Government Supply Workflow", "Follow supply order, stock reservation, procurement, GRN, stock receipt, delivery challan, stock issue, COGS, billing, receivable, payment, profitability and closure."],
  ["Supply Orders", "Capture order number, department, institution, employee, due date, status, documents and order lines where available."],
  ["Procurement", "Record supplier purchase bills, GST, freight, loading charges and item costs against supply orders."],
  ["Inventory", "Use stock inward, outward, reservation, transfer, adjustment, stock ledger and stock summary to verify physical and financial stock position."],
  ["Warehouses", "Maintain store locations and ensure every stock movement uses the correct warehouse."],
  ["Billing", "Create invoice header, item grid, GST values, receivable summary, documents and posting status from the Billing Voucher screen."],
  ["Receipts", "Record customer receipts, UTR, bank, TDS, GST TDS and allocate against invoices."],
  ["Supplier Payments", "Pay suppliers through supplier payment workflow and allocate payments against purchase bills."],
  ["Accounting", "Use business vouchers for routine transactions and advanced journal only for accountant-approved adjustments."],
  ["GST", "Review GST Register, GST Summary, TDS Register and GST TDS reconciliation after source transactions are posted."],
  ["Receivables", "Track department-wise invoice outstanding, ageing, payment allocation and party ledger."],
  ["Payables", "Track supplier bills, supplier payments, allocation, ageing and supplier ledger."],
  ["Profitability", "Review purchase cost, billing, GST impact, expenses, incentives, net profit and ROI after operational postings are complete."],
  ["Financial Controls", "Use posting queue, approval queue, financial year controls, opening balances and audit log to protect books."],
  ["Bank Reconciliation", "Import bank statements, review duplicates, match entries and approve before accounting impact."],
  ["Voucher Proposal Queue", "Review bank-to-voucher suggestions and approve or reject before creating posted accounting entries."],
  ["Reports", "Use financial, GST, outstanding, inventory, profitability and control reports with filters, export and print preview."],
  ["Backup and Restore", "Create backups regularly, restore only after confirmation, and verify accounting after restore."],
  ["Audit Log", "Use audit log to inspect critical actions, posting, reversal, backup, restore, import and approval evidence."],
  ["Keyboard Shortcuts", "Use Enter navigation, F keys, Alt voucher shortcuts and Ctrl shortcuts to work faster without bypassing controls."],
  ["Frequently Asked Questions", "Use FAQ for common doubts around posting, locked records, GST impact, profitability, stock reservation and allocations."],
  ["Troubleshooting", "Use troubleshooting guide before changing data, especially for posting, GST, stock, bank import, backup, approval and financial year issues."]
];

const roleHelpProfiles = [
  ["Operations User", "Focus on supply orders, procurement readiness, billing status, documents and pending workflows."],
  ["Inventory User", "Focus on GRN, stock receipt, stock issue, warehouse transfer, reservation and stock verification."],
  ["Accountant", "Focus on vouchers, ledgers, GST, allocations, trial balance, P&L, balance sheet and bank reconciliation."],
  ["Approver", "Focus on approval queue, posting queue, exception reasons, locked year warnings and safe approvals."],
  ["Auditor", "Focus on audit log, source drilldown, voucher evidence, stock ledger, GST reports and reconciliation views."],
  ["Administrator", "Focus on users, backups, restore controls, settings, master data discipline and permission hygiene."]
];

const guidedLessons = [
  ["Lesson 1 - First Order", "Create or review a sample supply order and identify department, institution, employee, due date and status."],
  ["Lesson 2 - Procurement", "Map supplier purchase bill to order and understand purchase value, GST and landed cost."],
  ["Lesson 3 - Inventory", "Follow stock receipt, warehouse balance, reservation, delivery challan and stock issue."],
  ["Lesson 4 - Billing", "Create invoice lines, validate GST, review receivable snapshot and attach documents."],
  ["Lesson 5 - Receipts", "Record payment, TDS, GST TDS and allocate against invoice."],
  ["Lesson 6 - Accounting Controls", "Review posting queue, voucher register, ledger, trial balance and audit log."]
];

const trainingSample = {
  order: "TRAIN-ORD-001",
  department: "Demo Government Hospital",
  supplier: "Demo Medical Supplier",
  item: "Demo Diagnostic Analyzer",
  procurement: 700000,
  billing: 1000000,
  gstRate: 18,
  expenses: "Authorization 5%, L1 2%, Work Incentive 10%, Transport 25000, Installation 15000",
  receipt: "Advance 200000, second receipt 300000, final receipt with TDS/GST TDS review"
};

export { workflowGuide, detailedWorkflowGuide, faqItems, troubleshootingItems, knowledgeBaseItems, keyboardGuideSections, erpManualSections, roleHelpProfiles, guidedLessons, trainingSample };
