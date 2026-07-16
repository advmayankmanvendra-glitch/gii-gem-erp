const manualIndex = {
  "user-operations-manual": [
    { heading: "Introduction to GII GeM ERP", excerpt: "Overview of the ERP system for Government e-Marketplace supply operations." },
    { heading: "System Requirements", excerpt: "Hardware and software requirements for running the ERP application." },
    { heading: "Getting Started", excerpt: "First-time setup, login, and company configuration." },
    { heading: "Dashboard Overview", excerpt: "Understanding the main dashboard, widgets, and quick actions." },
    { heading: "Masters Setup", excerpt: "Creating and managing master records: companies, banks, warehouses, departments, suppliers, items." },
    { heading: "Chart of Accounts", excerpt: "Managing accounts hierarchy, groups, and ledger creation." },
    { heading: "Supply Order Management", excerpt: "Creating, editing, and managing supply orders / work orders." },
    { heading: "Procurement and Purchase", excerpt: "Procurement planning, supplier purchase orders, and goods receipt." },
    { heading: "Inventory Management", excerpt: "Stock inward, outward, adjustments, transfers, reservations, and low stock alerts." },
    { heading: "Billing and Invoicing", excerpt: "Sales invoice creation, GST invoice, credit notes, and billing workflows." },
    { heading: "Receivables and Payments", excerpt: "Customer receipt allocation, payment collection, and receivable ageing." },
    { heading: "Payables and Supplier Payments", excerpt: "Supplier payment processing, allocation, and payable ageing." },
    { heading: "Voucher Management", excerpt: "Manual vouchers, journal entries, contra entries, and guided vouchers." },
    { heading: "Accounting and Financial Reports", excerpt: "Trial Balance, Profit & Loss, Balance Sheet, and financial statements." },
    { heading: "Balance Sheet Assets and Liabilities", excerpt: "The Balance Sheet shows assets, liabilities, and equity as the financial position of the company at a point in time." },
    { heading: "GST Reports", excerpt: "GST register, summary, and filing preparation." },
    { heading: "Bank Reconciliation", excerpt: "Reconciling bank transactions with ERP cash/bank ledger." },
    { heading: "Year-End Closing", excerpt: "Financial year closing process, opening balance carry-forward." },
    { heading: "Import and Export", excerpt: "Data import from Tally, CSV import/export, and bulk operations." },
    { heading: "Backup and Restore", excerpt: "Creating database backups, restore procedures, and data safety." },
    { heading: "Security and Access Control", excerpt: "User roles, permissions, and access management." },
    { heading: "Troubleshooting", excerpt: "Common issues, error messages, and resolution steps." },
    { heading: "Keyboard Shortcuts", excerpt: "Productivity shortcuts for common ERP actions." },
    { heading: "Work Order / Supply Order Operational Root", excerpt: "Work Order / Supply Order is the operational root of the government supply lifecycle. It starts the traceable order flow and does not post ledger entries by itself." },
    { heading: "Customer Acceptance / CRAC", excerpt: "Customer acceptance is recorded through CRAC, the Consignee Receipt and Acceptance Certificate. It follows installation and supports invoice readiness in the approved workflow." }
  ],
  "quick-start-guide": [
    { heading: "Installation", excerpt: "Download, install, and launch the ERP application." },
    { heading: "First Login", excerpt: "Default credentials, company selection, and initial setup wizard." },
    { heading: "Create Your First Supply Order", excerpt: "Step-by-step guide to creating a supply order with items." },
    { heading: "Process Procurement", excerpt: "Converting supply orders to procurements and raising purchase orders." },
    { heading: "Receive Goods", excerpt: "Recording goods receipt and updating inventory." },
    { heading: "Generate Invoice", excerpt: "Creating sales invoice and GST invoice from delivery." },
    { heading: "Record Receipt", excerpt: "Allocating customer receipt against outstanding invoices." }
  ],
  "training-workbook": [
    { heading: "Module 1: System Navigation", excerpt: "Understanding the sidebar, screens, and navigation patterns." },
    { heading: "Module 2: Masters and Configuration", excerpt: "Setting up companies, masters, and accounts." },
    { heading: "Module 3: Supply Chain Operations", excerpt: "End-to-end supply order to closure workflow." },
    { heading: "Module 4: Inventory and Warehouse", excerpt: "Stock management, reservations, and adjustments." },
    { heading: "Module 5: Accounting and Vouchers", excerpt: "Voucher posting, ledger management, and trial balance." },
    { heading: "Module 6: GST and Taxation", excerpt: "GST invoice, input/output GST, and return filing." },
    { heading: "Module 7: Reports and Dashboards", excerpt: "Financial reports, operational dashboards, and analysis." },
    { heading: "Module 8: Period-End Procedures", excerpt: "Month-end closing, year-end closing, and audits." }
  ],
  "daily-operations-checklist": [
    { heading: "Morning Checklist", excerpt: "Verify current company, check pending supply orders, review low stock items." },
    { heading: "During the Day", excerpt: "Process goods receipt, create invoices, allocate receipts, review exceptions." },
    { heading: "End of Day", excerpt: "Verify trial balance, check pending approvals, backup database." }
  ],
  "daily-operations-detailed": [
    { heading: "Daily Operations Checklist", excerpt: "Daily operations checklist: verify current company at login, check pending supply orders, review low stock items, process goods receipt for received shipments, create invoices for completed deliveries, allocate receipts against outstanding invoices, review exceptions and mismatches, and verify trial balance at end of day." },
    { heading: "Check Pending Vouchers", excerpt: "To check pending vouchers: navigate to the voucher dashboard to see all voucher types including business voucher, guided voucher, journal, contra, receipt, payment, sales, purchase, credit note, and debit note. Look for vouchers with draft status or pending approval status and take necessary action." },
    { heading: "Verify Receivable and Payable Outstanding", excerpt: "For receivable and payable checks: review bill-wise outstanding from department receivables, confirm ageing analysis, follow up on overdue receivables, review supplier payable outstanding, confirm payable ageing, and plan supplier payments accordingly." }
  ],
  "month-end-checklist": [
    { heading: "Receivable Confirmation", excerpt: "Review bill-wise outstanding, confirm ageing and follow up on overdue." },
    { heading: "Payable Confirmation", excerpt: "Review supplier outstanding, confirm payable ageing and plan payments." },
    { heading: "Bank Reconciliation", excerpt: "Reconcile cash/bank ledger with bank statements." },
    { heading: "Inventory Verification", excerpt: "Verify stock ledger, investigate adjustments, confirm valuation." },
    { heading: "GST Return Preparation", excerpt: "Review GST register, reconcile with invoices, prepare return." },
    { heading: "Trial Balance Review", excerpt: "Verify trial balance, investigate differences, post adjusting entries." },
    { heading: "Profitability Analysis", excerpt: "Review order profitability, margin analysis, and cost summaries." }
  ],
  "month-end-closing-detailed": [
    { heading: "How to Complete Month-End Closing", excerpt: "To complete month-end closing: 1. Review and confirm all receivable outstanding with ageing analysis. 2. Review supplier payable outstanding and plan payments. 3. Reconcile bank statements with ERP cash/bank ledger. 4. Verify stock ledger and investigate adjustments and valuation. 5. Review GST register and reconcile with invoices for GST return preparation. 6. Review trial balance and post adjusting entries. 7. Analyze order profitability and review margin analysis." },
    { heading: "Month End Checklist Detailed", excerpt: "Complete month-end checklist: receivable confirmation with ageing review, payable confirmation, bank reconciliation, inventory verification and stock ledger check, GST return preparation by reconciling register with invoices, trial balance review for debit credit equality, profitability analysis with margin review, and financial year locking after closure." },
    { heading: "How to Review GST Before Month Close", excerpt: "To review GST before month-end close: open GST reports and check the GST register for all posted transactions. Reconcile output GST liability with sales invoices. Reconcile input tax credit with purchase bills. Verify HSN and SAC codes on all items. Check for mismatches between invoice data and GST register. Prepare GSTR-1 and GSTR-3B return data." },
    { heading: "What Accountant Should Check Monthly", excerpt: "Accountant monthly checklist: verify trial balance totals and debit credit equality, confirm all vouchers are posted and no drafts remain, review receivable ageing and follow up on overdue, check pending supplier bills and payable ageing, reconcile bank accounts with ERP ledger, verify GST reports match invoice data, review profitability by work order, and prepare management reports for review." },
    { heading: "How to Verify Reports Before Closing", excerpt: "To verify reports before month-end closing: check trial balance report for debit credit equality and investigate any difference. Review profit and loss statement for unusual entries or missing expenses. Verify balance sheet totals and confirm assets equal liabilities plus equity. Cross-check GST reports with invoice data to ensure no mismatch. Run audit trail reports to verify all transactions are posted correctly." },
    { heading: "Year End Process", excerpt: "Year-end process: financial year locking locks a financial year after closure and prevents posting to locked periods. This is an administrative action after completing all year-end procedures including final trial balance verification, profit and loss closing, balance sheet finalization, GST return filing, TDS return filing, and audit completion. After locking, opening balances are carried forward to the next financial year." },
    { heading: "What is Financial Year Closing", excerpt: "Financial year closing involves: finalizing all transactions for the year, running trial balance verification, posting adjusting entries if needed, generating final profit and loss and balance sheet reports, filing final GST and TDS returns, completing audit procedures, and then performing financial year locking which prevents any further posting to the closed period." },
    { heading: "How to Prepare Closing Balances", excerpt: "To prepare closing balances: after all transactions for the year are posted, run the trial balance report and verify all ledger balances. Post any adjusting entries needed for accruals, prepayments, or corrections. Verify that total debits equal total credits. The closing balances become the opening balances for the next financial year after year-end processing is complete." }
  ],
  "troubleshooting-guide": [
    { heading: "Login Issues", excerpt: "Cannot log in, forgotten password, account locked." },
    { heading: "Voucher Not Posting", excerpt: "Voucher posting failure: debit credit mismatch, closed financial year, missing approval, incomplete voucher fields, financial period locked, or insufficient permissions." },
    { heading: "Report Blank or No Data", excerpt: "Report shows no data: no transactions posted for selected period, incorrect date range filter, company selection mismatch, financial year not set correctly, or data not yet processed." },
    { heading: "GST Calculation Errors", excerpt: "Incorrect GST rate, missing HSN, wrong GST type." },
    { heading: "Stock Discrepancy", excerpt: "Stock value wrong: physical stock differs from system stock, negative stock due to missing inward entry, valuation mismatch from incorrect rate, or missing adjustment entries." },
    { heading: "Report Mismatch", excerpt: "Trial balance does not match, report totals differ from ledger." },
    { heading: "Import Failures", excerpt: "Import validation errors, duplicate detection, mapping issues." },
    { heading: "Backup and Restore", excerpt: "Backup fails, restore fails, database corruption." },
    { heading: "Dashboard Not Loading", excerpt: "Dashboard blank or not loading: possible causes include database connection issue, missing required data, or rendering error. Try refreshing the application, checking the database connection, and verifying that all required master data is set up." },
    { heading: "GST Not Showing in Reports", excerpt: "GST data not appearing in reports: possible causes include transactions not yet posted, incorrect GST rate or type on invoices, HSN or SAC code missing, or GST return period not aligned with transaction period." },
    { heading: "Purchase Bill or Invoice Fails", excerpt: "Purchase bill or sales invoice creation fails: possible causes include missing mandatory fields, invalid supplier or customer reference, incorrect item or rate data, GST validation errors, or financial period issues." },
    { heading: "Screen Blank or Not Loading", excerpt: "Screen appears blank or does not load: possible causes include routing error, missing component, data loading failure, permissions issue, or session timeout. Try navigating to the screen again, refreshing the application, or checking the console for errors." },
    { heading: "Export Not Working", excerpt: "Export fails to generate output: possible causes include no data available to export, selected format not supported, file write permission issue, or export process timeout. Verify data exists and try again with a different format." },
    { heading: "Feedback Submit Failing", excerpt: "Feedback submission fails: possible causes include network connectivity issue, form validation error, or server-side processing failure. Verify all required fields are filled and try again." }
  ],
  "import-export-detailed": [
    { heading: "How Import Export Works", excerpt: "Import and export in ERP: you can import master data from Tally ERP via XML export files. Import creates master records and vouchers but does not post ledger entries directly. Imported vouchers require review before posting. Export data to spreadsheet or CSV format for offline analysis. Export is a read-only operation that does not modify ERP data." },
    { heading: "How to Import Masters", excerpt: "To import masters: use the import module to load master records including companies, departments, suppliers, items, banks, warehouses, employees, and expense heads from CSV files or Tally XML format. The import module validates data and shows preview before committing." },
    { heading: "What is Tally Migration", excerpt: "Tally migration imports master data and transactions from Tally ERP via XML export files. It creates master records and vouchers in the ERP system. Imported vouchers may require review before posting. The migration process includes validation, duplicate detection, and mapping verification." },
    { heading: "How to Migrate from Tally", excerpt: "To migrate from Tally: 1. Export all masters from Tally in XML format including company, ledger, stock items, and voucher types. 2. Verify GSTIN, HSN and SAC codes, and ledger mappings before import. 3. Use the import module to load data with preview validation. 4. Review created records and fix any errors. 5. Do not import directly into live tables without validation. 6. Use staging preview first." },
    { heading: "What is Import Preview", excerpt: "Import preview allows you to review data before committing changes. It shows validation errors, duplicate detection, mapping issues, and row-wise errors before the import is executed. This prevents unsafe imports and ensures data integrity." },
    { heading: "How to Export Data", excerpt: "To export data: use the spreadsheet export feature to export reports, lists, and transactions to spreadsheet or CSV format for offline analysis. Export is a read-only operation and does not modify any ERP data. You can export financial reports, inventory data, GST registers, and transaction lists." },
    { heading: "Migration Checklist", excerpt: "Migration checklist: 1. Export all masters from source system. 2. Verify GSTIN, HSN, SAC codes, and ledger mappings. 3. Run import preview to check for errors. 4. Review created records and validate totals. 5. Confirm company and financial year settings are correct. 6. Do not import into live tables without validation." },
    { heading: "How to Import Opening Balances", excerpt: "To import opening balances: use the opening balance feature to record opening balances for ledger accounts at the start of a financial year. This posts to ledger as opening entries. Opening balance is a one-time entry per financial year and must be completed before processing current period transactions." },
    { heading: "Pre-Import Checklist", excerpt: "Before importing: 1. Verify source data is complete and accurate. 2. Check GSTIN and HSN or SAC codes are correct. 3. Confirm company and financial year are set correctly in the ERP. 4. Use import preview to validate all records. 5. Review warnings and errors before confirming the import. 6. Ensure no duplicate records will be created." },
    { heading: "Troubleshoot Missing Source", excerpt: "When troubleshooting missing source or data not found: check that the correct company and financial year are selected, verify the data source module is active, ensure all required masters are set up, confirm data has been imported or entered correctly, and try refreshing the application or re-indexing the search." }
  ],
  "command-execution-guide": [
    { heading: "Database Initialization", excerpt: "Commands for initializing and resetting the database." },
    { heading: "Verification Commands", excerpt: "Running verification scripts for accounting, financials, controls, and graphs." },
    { heading: "Build and Package", excerpt: "Building the application for development and production." },
    { heading: "Test Data Commands", excerpt: "Generating test data for development and testing." }
  ],
  "feature-status-matrix": [
    { heading: "Core Features", excerpt: "Status of supply order, procurement, inventory, billing, accounting modules." },
    { heading: "Graph Intelligence", excerpt: "Status of Enterprise Intelligence Layer graphs (BRAIN-1, KG-1, RG-1, DG-1, WG-1, KG-4)." },
    { heading: "Production Readiness", excerpt: "Feature maturity, known gaps, and production readiness classification." }
  ],
  "knowledge-gap-report": [
    { heading: "Known Knowledge Gaps", excerpt: "Documented gaps in ERP knowledge sources and manual coverage." },
    { heading: "Resolution Plan", excerpt: "Planned phases to address knowledge gaps." }
  ],
  "manual-generation-report": [
    { heading: "Manual Generation Summary", excerpt: "Overview of manual generation process, sources, and quality metrics." },
    { heading: "Section Coverage", excerpt: "Coverage analysis of manual sections against ERP feature set." }
  ]
};

export default manualIndex;
