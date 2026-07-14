# GII GeM ERP — Training Workbook

**Version:** 1.0  
**Audience:** New Users  
**Platform:** Windows Desktop  
**Prerequisites:** Windows 10+, the GII GeM ERP application installed, admin credentials

---

## Exercise 1: Install and Launch the Application

**Objective:** Install GII GeM ERP on your Windows machine and verify the application starts correctly.

**Prerequisites:**
- Windows 10 or later (64-bit)
- 4 GB RAM, 500 MB free disk space
- Administrator rights for installation

**Steps:**

1. Locate the installer file `GII-GeM-ERP-Setup-<version>-x64.exe` provided by your administrator.
2. Double-click the installer. If Windows SmartScreen appears, click **More Info** then **Run Anyway**.
3. In the setup wizard:
   - Choose installation directory (default: `C:\Program Files\GII GeM ERP`)
   - Check **Create Desktop Shortcut**
   - Click **Install**
4. Wait for installation to complete, then click **Finish**.
5. Launch GII GeM ERP from the desktop shortcut or Start Menu.
6. You will see the **Login** screen.
7. Enter the default credentials provided by your administrator (e.g., Username: `admin`, Password: `admin123`).
8. Click **Login**.

**Expected Result:** The application opens to the Company Selection screen (if multiple companies exist) or directly to the Dashboard. The dashboard shows cards with real-time KPIs.

**Check Your Understanding:**

1. What is the default login credential for first-time access? (Ask your administrator; typically admin/admin123)
2. Why might the installer show a SmartScreen warning? (The installer is not yet code-signed; it is safe to run anyway)
3. What screen appears after successful login? (Company Selection, then Dashboard)

**Notes:** If the application fails to launch, verify your system meets the minimum requirements. Check `%APPDATA%\GII GeM ERP\logs` for error logs.

---

## Exercise 2: Configure Company Profile

**Objective:** Set up your company's legal and financial profile that appears on all invoices, reports, and statutory documents.

**Prerequisites:**
- Completed Exercise 1
- Your company's GSTIN, PAN, registered address, and bank account details

**Steps:**

1. Log in and select your company (or create a new company).
2. Navigate to **Settings > Company Profile**.
3. In the Company Profile form, fill in:
   - **Company Name:** Your registered business name
   - **GSTIN:** 15-character GST registration number
   - **PAN:** 10-character PAN
   - **Registered Address:** Full address
   - **City, State, Pin Code:** As per GST registration
   - **Contact:** Phone and email
   - **Logo:** Upload company logo (recommended size: 200x200 px)
4. Click **Save**.
5. Navigate to **Masters > Banks** and click **+ New Bank**.
6. Enter bank details:
   - **Bank Name**
   - **Account Number**
   - **IFSC Code**
   - **Branch**
7. Click **Save**.
8. Navigate to **Settings > GST Configuration** and verify the default GST rates (5%, 12%, 18%, 28%) are correct.

**Expected Result:** Company profile is saved. Your company name and GSTIN appear on the dashboard header. Bank account is listed in the Banks master.

**Check Your Understanding:**

1. What information appears on every GST invoice from this company? (Company name, GSTIN, PAN, address, logo)
2. Why is the bank account set up in Masters important? (It is used for receipt and payment transactions)
3. What happens if the GSTIN is incorrect? (Invoices will be non-compliant; the department may reject them)

**Notes:** Company profile changes apply to all future transactions. Existing invoices are not retroactively updated. Ensure GSTIN and PAN match registration certificates exactly.

---

## Exercise 3: Create Master Records (Item, Customer, Supplier, Employee)

**Objective:** Create the four foundational master records required before any transaction can be recorded.

**Prerequisites:**
- Completed Exercise 2
- HSN/SAC codes for your products
- Department (customer) details including GSTIN
- Supplier details including GSTIN and PAN
- Employee details including PAN and bank account

**Steps:**

### Part A — Create an Item

1. Navigate to **Masters > Items**.
2. Click **+ New Item**.
3. Fill in:
   - **Item Name:** "Office Chair – Executive"
   - **HSN/SAC Code:** 940330 (or applicable)
   - **Unit of Measure:** Nos
   - **GST Rate:** 18%
   - **Rate (Selling Price):** 8500.00
4. Click **Save**.
5. Create a second item: **Item Name:** "LED Monitor 24 inch", **HSN:** 852852, **UOM:** Nos, **GST Rate:** 18%, **Rate:** 14500.00.
6. Create a third item: **Item Name:** "Laptop Computer", **HSN:** 847130, **UOM:** Nos, **GST Rate:** 18%, **Rate:** 55000.00.

### Part B — Create a Department (Customer)

1. Navigate to **Masters > Departments**.
2. Click **+ New Department**.
3. Fill in:
   - **Department Name:** "Education Department"
   - **GSTIN:** 29ABCDE1234F1Z5 (hypothetical)
   - **Address:** "Secretariat, Hyderabad"
   - **Contact:** "Chief Engineer"
   - **Phone / Email**
4. Click **Save**.

### Part C — Create a Supplier

1. Navigate to **Masters > Suppliers**.
2. Click **+ New Supplier**.
3. Fill in:
   - **Supplier Name:** "Tech Supplies Pvt Ltd"
   - **GSTIN:** 37FGHIJ5678K1Z3 (hypothetical)
   - **PAN:** ABCDE1234F
   - **Address:** "Mumbai, Maharashtra"
   - **Payment Terms:** 30 days
4. Click **Save**.

### Part D — Create an Employee

1. Navigate to **Masters > Employees**.
2. Click **+ New Employee**.
3. Fill in:
   - **Employee Name:** "Rajesh Kumar"
   - **Department:** Your department
   - **Designation:** "Project Manager"
   - **PAN:** FGHIJ5678K
   - **Bank Account / IFSC**
4. Click **Save**.

**Expected Result:** Three items, one department, one supplier, and one employee appear in their respective master lists. Each record is editable via the Edit button.

**Check Your Understanding:**

1. Can you create a supply order without first creating items? (No — items must exist before they can be added to an order)
2. What is the purpose of the HSN/SAC code on an item? (It determines GST rate and is required on GST invoices)
3. Why must the supplier's PAN be recorded? (For TDS deduction and statutory reporting)

**Notes:** Master records can be imported in bulk from CSV via **Utilities > Import > Import Masters (CSV)**. Download the template from the Import screen.

---

## Exercise 4: Create a Supply Order with 3 Line Items

**Objective:** Record a government supply order from the Education Department for three items.

**Prerequisites:**
- Items, Department, Employee created in Exercise 3
- A scanned copy of the government purchase order (PO) ready as a PDF

**Steps:**

1. Navigate to **Operations > Orders > Supply Orders**.
2. Click **+ New Order**.
3. Fill in the header:
   - **Order Number:** "EDU/2026-27/001"
   - **Department:** Education Department
   - **Institution:** "Zilla Parishad High School"
   - **Order Date:** Today's date
   - **Employee:** Rajesh Kumar (or the employee you created)
   - **Delivery Date:** 30 days from today
4. Add 3 line items:
   - **Row 1:** Item: Office Chair – Executive, Qty: 50, Rate: 8500.00
   - **Row 2:** Item: LED Monitor 24 inch, Qty: 20, Rate: 14500.00
   - **Row 3:** Item: Laptop Computer, Qty: 10, Rate: 55000.00
5. Click **Save**. The order is created in **Draft** status.
6. Click the **Documents** tab and attach the scanned PO PDF.
7. Change order status from Draft to **Active** (or use the status dropdown).

**Expected Result:** The supply order appears in the Supply Orders register with status "Active". Total order value: ₹1,265,000.00 (50×8500 + 20×14500 + 10×55000). The attached document appears in the Documents tab.

**Check Your Understanding:**

1. What is the significance of the Draft status? (The order has no accounting impact and can still be edited)
2. What happens if you enter the wrong department? (Billing and receivables will be linked to the wrong entity — use Edit to correct or create a new order)
3. Can you add more items to this order after saving? (Yes, as long as it is in Draft or Active status)

**Notes:** The order number should match the government PO reference for traceability during audits. Attaching the scanned PO is a readiness requirement for billing. Status changes are user-defined; configure the allowed statuses in Settings.

---

## Exercise 5: Generate a GST Invoice

**Objective:** Create and post a GST invoice for part delivery against the supply order.

**Prerequisites:**
- The supply order from Exercise 4 in Active status
- Procurement completed and stock available (or use Direct Stock Inward)
- Delivery challan prepared

**Steps:**

1. Navigate to **Operations > Billing > New Invoice**.
2. Click **+ New Invoice**.
3. Select the supply order: "EDU/2026-27/001".
4. Items pre-fill from the order. For this exercise, deliver partial quantities:
   - Office Chair – Executive: Qty 20
   - LED Monitor 24 inch: Qty 10
   - Laptop Computer: Qty 5
5. Verify auto-calculated values:
   - Taxable values: Chair ₹1,70,000; Monitor ₹1,45,000; Laptop ₹2,75,000
   - SGST @ 9% and CGST @ 9% on each line
   - Total Invoice Value: ₹6,96,200.00
6. Save as **Draft**.
7. Review the Readiness Panel — ensure no red indicators remain.
8. Click **Post** to create accounting entries.

**Expected Result:** Invoice status changes to **Posted**. A Sales Voucher is created. Receivable entry appears under Receivables & Payables. Output GST appears in GST Register.

**Check Your Understanding:**

1. What accounting entry is created when you Post an invoice? (Debit: Department Receivable, Credit: Sales Account, Credit: Output GST — SGST + CGST)
2. Can you edit a Posted invoice? (No — you must create a Credit Note or Debit Note to correct it)
3. What is the Readiness Panel checking? (Whether procurement, stock issue, CRAC, and required documents are complete before posting)

**Notes:** Posting is irreversible without a reversal. Always verify quantities and rates before posting. The GST invoice number is auto-generated from the voucher series configured in Settings.

---

## Exercise 6: Record a Payment with TDS

**Objective:** Record a payment received from the Education Department with TDS and GST TDS deductions.

**Prerequisites:**
- Posted invoice from Exercise 5
- Payment details: cheque/UTR number, date, amount

**Steps:**

1. Navigate to **Operations > Collections > Department Receipts**.
2. Click **+ New Receipt**.
3. Select the department: **Education Department**.
4. Enter the receipt details:
   - **Date:** Today's date
   - **Mode:** NEFT / RTGS
   - **Reference Number:** "NEFT-EDU-001"
   - **Gross Amount:** ₹6,96,200.00
   - **TDS Deducted @ 2%:** ₹13,924.00
   - **GST TDS Deducted** (if applicable): ₹0
   - **Net Amount Received:** ₹6,82,276.00
5. Save the receipt.
6. Navigate to the **Allocation** tab.
7. Select the invoice from Exercise 5 and allocate the full ₹6,96,200.00 (gross).
8. Click **Allocate**.

**Expected Result:** Receipt is saved and allocated. The invoice status changes to **Paid**. TDS Receivable of ₹13,924.00 appears in TDS Register. The department's outstanding is reduced to zero.

**Check Your Understanding:**

1. Why does TDS deducted become a receivable? (The company can claim TDS as a credit against its own income tax liability)
2. What happens if you do not allocate the receipt? (The receipt remains unallocated; the invoice stays unpaid in ageing reports)
3. How is the net amount different from the gross amount? (Net = Gross − TDS − GST TDS − Other Deductions)

**Notes:** TDS rates depend on the type of deduction and PAN validity. The system uses the configured TDS rate from Settings > TDS Configuration. Always verify TDS calculation against the actual government deduction.

---

## Exercise 7: View the Dashboard and Key Reports

**Objective:** Navigate the dashboard in all three modes and generate key financial and operational reports.

**Prerequisites:**
- Data created in Exercises 3 through 6

**Steps:**

1. Click **Dashboard** in the sidebar.
2. Toggle between the three modes using the top-right selector:
   - **Executive Mode** — view revenue KPIs, net profit, pending orders value
   - **Operations Mode** — view GRN pending, unbilled stock, procurement alerts
   - **Accounts Mode** — view receivables, payables, bank balance, ageing
3. Click a dashboard card (e.g., "Orders Pending") to drill into the detail.
4. Navigate to **Reports > Management Reports > Executive Summary**.
5. Set the date range to cover the current month.
6. Click **Generate**.
7. Navigate to **Accounting > Financial Statements > Trial Balance**.
8. Verify the Trial Balance is balanced (total debits = total credits).
9. Navigate to **GST & Tax > GST Register**.
10. Verify the Posted invoice's output GST appears.
11. Navigate to **Reports > Profitability Reports > Order Profitability Report**.
12. Select the supply order and generate the report.

**Expected Result:**
- Dashboard shows current data in each mode
- Executive Summary report displays revenue, costs, and profit
- Trial Balance balances to zero difference
- GST Register shows the invoice's SGST and CGST
- Order Profitability Report shows revenue, costs, and margin for the order

**Check Your Understanding:**

1. What does the Executive mode show that Accounts mode does not? (ROI, billing targets, top departments — high-level KPIs vs detailed financial status)
2. Why must the Trial Balance always balance? (Double-entry accounting ensures every debit has a corresponding credit)
3. What determines whether an order is profitable? (Revenue minus procurement cost, expenses, and allocated overheads)

**Notes:** Dashboard cards are customizable — click the pencil icon to hide or rearrange. Reports can be exported to Excel or PDF using the Export button on each report screen.

---

## Exercise 8: Export Data to Excel

**Objective:** Export master data and a report to Excel for offline analysis.

**Prerequisites:**
- Data created in previous exercises

**Steps:**

### Part A — Export Masters

1. Navigate to **Masters > Items**.
2. Click the **Export** button (top-right, usually an icon with downward arrow).
3. Choose format: **Excel (.xlsx)**.
4. Save the file to your desktop.
5. Open the exported file in Excel and verify the columns: Item Name, HSN Code, UOM, GST Rate, Rate.

### Part B — Export Report

1. Navigate to **Reports > Management Reports > Executive Summary**.
2. Set the date range and click **Generate**.
3. Click **Export > Excel**.
4. Save the file and open it in Excel.

### Part C — Export Using Utilities

1. Navigate to **Utilities > Export > Export to Excel**.
2. Select entity type: **Supply Orders**.
3. Choose date range and click **Export**.
4. Save and verify the exported data.

**Expected Result:** Each export produces a valid `.xlsx` file openable in Excel. All columns and data match what appears on screen.

**Check Your Understanding:**

1. Can you export data while filters are applied? (Yes — export respects current filters)
2. What formats are available for export? (Excel .xlsx and PDF for reports)
3. Does exporting affect the live data? (No — export is a read-only operation)

**Notes:** Large exports (10,000+ rows) may take a few seconds. The export uses the xlsx library and generates standard Office Open XML format. If the export button is not visible, check your user permissions.

---

## Exercise 9: Create a Database Backup

**Objective:** Create a manual database backup and verify the backup file exists.

**Prerequisites:**
- Data created in previous exercises
- Access to Settings > Backup & Restore

**Steps:**

### Method A — Using the Application UI

1. Navigate to **Settings > Backup & Restore**.
2. Click **Create Backup**.
3. Wait for confirmation: "Backup created successfully".
4. Note the backup filename shown (format: `gii_gem_erp_<timestamp>.db`).

### Method B — Using Command Line (for administrators)

1. Open PowerShell as Administrator.
2. Navigate to the ERP project directory:
   ```
   cd "C:\Program Files\GII GeM ERP\resources"
   ```
3. Run the backup command:
   ```
   node -e "const { createBackup } = require('./src/main/services/backup.js'); console.log(JSON.stringify(createBackup(), null, 2));"
   ```
4. Verify the backup file is created:
   ```
   Get-ChildItem -Path ".\backups\*.db" | Select-Object Name, Length, LastWriteTime
   ```

### Verify the Backup

1. In the Backup & Restore screen, the backup appears in the list.
2. Note the file size (non-zero).
3. (Optional) To test restore, select the backup and click **Restore**, then restart the app.

**Expected Result:** A backup file with a timestamped name appears in the backup list. The file size is greater than zero bytes.

**Check Your Understanding:**

1. Where are backup files stored? (In the `backups/` directory under the application data folder)
2. Can the application be running while a backup is created? (Yes — `createLiveBackup` uses SQLite's online backup API for a consistent snapshot)
3. What should you do before a major schema change? (Create a full backup and verify it)

**Notes:** Schedule regular backups based on transaction volume. The backup file is a complete copy of the SQLite database and can be restored on any compatible GII GeM ERP instance. Store backups off-device for disaster recovery.

---

## Exercise 10: Run the Verification Suite

**Objective:** Execute the verification scripts to confirm system health and data integrity.

**Prerequisites:**
- Data created in previous exercises
- PowerShell or Command Prompt access to the application directory
- Node.js and npm available in PATH

**Steps:**

1. Open **PowerShell** as Administrator.
2. Navigate to the application directory:
   ```
   cd "C:\Users\TM Savera\Documents\Codex\2026-06-09\build-a-new-crm\outputs\gii-gem-erp"
   ```
   (Replace with your actual project or installation path.)
3. Run syntax check:
   ```
   npm.cmd run lint:syntax
   ```
   Expected: Exit code 0, no error output.
4. Build the renderer:
   ```
   npm.cmd run build
   ```
   Expected: Vite builds successfully, output in `dist/`.
5. Run accounting verification:
   ```
   npm.cmd run verify:accounting
   ```
   Expected: Summary shows pass count > 0, fail count = 0.
6. Run financial verification:
   ```
   npm.cmd run verify:financials
   ```
   Expected: Summary shows pass count > 0, fail count = 0.
7. Run controls verification:
   ```
   npm.cmd run verify:controls
   ```
8. Run voucher-inventory verification:
   ```
   npm.cmd run verify:voucher-inventory
   ```
9. Run operational flow verification:
   ```
   npm.cmd run verify:flow
   ```
10. Review the output for each step. If any step reports failures, note the failing check name.

**Expected Result:** All five verification commands complete with 0 failures. The summary output for each shows `pass` status. The Trial Balance remains balanced, GST values reconcile, and inventory matches physical counts.

**Check Your Understanding:**

1. Why must verification scripts be run sequentially and not in parallel? (They access the same SQLite database; parallel execution can cause read/write conflicts or inconsistent snapshots)
2. What does `verify:accounting` check? (That all posted vouchers are balanced and no orphan ledger entries exist)
3. What should you do if `verify:financials` fails? (Stop work, identify the failing check (GST mismatch, receivable discrepancy, etc.), fix the root cause, re-run verification from the failed step)

**Notes:** Run the full verification suite before every deployment. The AGENTS.md file in the project root documents the permanent verification commands as mandatory. If you modify posting logic, inventory code, or accounting formulas, always re-run all verification steps.

---

## Quick Reference Card

| Exercise | Area | Key Screen |
|---|---|---|
| 1 | Install & Launch | Login → Dashboard |
| 2 | Company Profile | Settings > Company Profile |
| 3 | Master Records | Masters > Items / Departments / Suppliers / Employees |
| 4 | Supply Order | Operations > Orders > Supply Orders |
| 5 | GST Invoice | Operations > Billing |
| 6 | Payment with TDS | Operations > Collections > Department Receipts |
| 7 | Dashboard & Reports | Dashboard / Reports / Accounting |
| 8 | Export to Excel | Reports (Export button) / Utilities > Export |
| 9 | Database Backup | Settings > Backup & Restore |
| 10 | Verification Suite | PowerShell: `npm.cmd run verify:*` |

---

## Troubleshooting Quick Guide

| Issue | Likely Cause | Solution |
|---|---|---|
| Login fails | Wrong credentials | Reset password via Settings > User Management |
| Dashboard shows zeroes | No transactions posted | Complete Exercises 4-6 |
| Post button is greyed out | Missing required data | Check Readiness Panel |
| Export produces empty file | No data in date range | Widen date range |
| Backup fails | Insufficient disk space | Free disk space or change backup location |
| Verification fails | Data integrity issue | Review error details, restore from backup if needed |
