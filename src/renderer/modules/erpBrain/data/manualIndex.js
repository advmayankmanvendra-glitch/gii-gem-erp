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
    { heading: "GST Reports", excerpt: "GST register, summary, and filing preparation." },
    { heading: "Bank Reconciliation", excerpt: "Reconciling bank transactions with ERP cash/bank ledger." },
    { heading: "Year-End Closing", excerpt: "Financial year closing process, opening balance carry-forward." },
    { heading: "Import and Export", excerpt: "Data import from Tally, CSV import/export, and bulk operations." },
    { heading: "Backup and Restore", excerpt: "Creating database backups, restore procedures, and data safety." },
    { heading: "Security and Access Control", excerpt: "User roles, permissions, and access management." },
    { heading: "Troubleshooting", excerpt: "Common issues, error messages, and resolution steps." },
    { heading: "Keyboard Shortcuts", excerpt: "Productivity shortcuts for common ERP actions." }
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
  "month-end-checklist": [
    { heading: "Receivable Confirmation", excerpt: "Review bill-wise outstanding, confirm ageing and follow up on overdue." },
    { heading: "Payable Confirmation", excerpt: "Review supplier outstanding, confirm payable ageing and plan payments." },
    { heading: "Bank Reconciliation", excerpt: "Reconcile cash/bank ledger with bank statements." },
    { heading: "Inventory Verification", excerpt: "Verify stock ledger, investigate adjustments, confirm valuation." },
    { heading: "GST Return Preparation", excerpt: "Review GST register, reconcile with invoices, prepare return." },
    { heading: "Trial Balance Review", excerpt: "Verify trial balance, investigate differences, post adjusting entries." },
    { heading: "Profitability Analysis", excerpt: "Review order profitability, margin analysis, and cost summaries." }
  ],
  "troubleshooting-guide": [
    { heading: "Login Issues", excerpt: "Cannot log in, forgotten password, account locked." },
    { heading: "Voucher Not Posting", excerpt: "Debit/credit mismatch, closed financial year, missing approval." },
    { heading: "GST Calculation Errors", excerpt: "Incorrect GST rate, missing HSN, wrong GST type." },
    { heading: "Stock Discrepancy", excerpt: "Physical stock differs from system stock, negative stock, valuation mismatch." },
    { heading: "Report Mismatch", excerpt: "Trial balance does not match, report totals differ from ledger." },
    { heading: "Import Failures", excerpt: "Import validation errors, duplicate detection, mapping issues." },
    { heading: "Backup and Restore", excerpt: "Backup fails, restore fails, database corruption." }
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
