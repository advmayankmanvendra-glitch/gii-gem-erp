# GII GeM ERP — Daily Operations Checklist

> Role-based operational checklists ensuring daily, weekly, and monthly tasks are completed across all ERP modules.
> Version: 1.0 | Last Updated: July 2026

---

## 1. Operations Manager

### Daily

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 1.1 | Review pending supply orders | Dashboard > Operations Mode > Orders Drilldown | List of orders not marked "Supply Completed" appears | Escalate to procurement team; check item procurement status |
| 1.2 | Check GRN status — pending receipts | Inventory > Documents > GRN > filter "Draft" | No procurement should have goods pending receipt beyond 48 hours | Follow up with warehouse for physical receipt confirmation |
| 1.3 | Verify CRAC received for delivered orders | Operations > CRAC > CRAC Tracker | Delivered orders have "Generated" CRAC status | Contact department issuing authority; re-send delivery documents |
| 1.4 | Review pending billing | Operations > Billing > filter "Draft" or "Pending Approval" | No invoice older than 7 days should remain unposted | Check delivery completeness; ensure CRAC is generated; post invoice |
| 1.5 | Review pending payments | Receivables & Payables > Receivables > filter "Open" | All invoices past due date have collection action | Initiate payment follow-up with department; check TDS deductions |

### Weekly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 1.6 | Review order closure readiness | Operations > Order Closure > Closure Pending | Orders with >80% closure checklist progress | Push for document uploads, final billing, and payment allocation |
| 1.7 | Verify stock issue vs billing match | Reports > Stock Issue vs Billing | No issued stock remains unbilled beyond 7 days | Create invoice for issued stock; check CRAC status |
| 1.8 | Review procurement pipeline | Operations > Procurement > filter "Draft" | No procurement request older than 14 days | Cancel if no longer required; expedite if still needed |

### Monthly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 1.9 | Review order profitability | Profitability > Order Profitability | Each closed order shows positive net margin | Flag negative-margin orders for management review |
| 1.10 | Review operational closure status | Operations > Order Closure > Closure Report | All completed orders marked operationally closed | Initiate closure process for eligible orders |
| 1.11 | Run operations report pack | Reports > Operations > Summary | Exports complete for month-end review | Check report filters; verify data completeness |

---

## 2. Accountant

### Daily

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 2.1 | Verify Day Book | Accounting > Day Book | All transactions from previous business day appear with correct totals | Reconcile missing entries; check pending vouchers |
| 2.2 | Post pending vouchers | Accounting > Voucher Register > filter "Draft" or "Pending Approval" | Zero draft vouchers remaining by end of day | Review each draft; correct data gaps; post or escalate |
| 2.3 | Review GST register (quick check) | GST & Tax > GST Register | Input GST and Output GST updated for day's transactions | Check voucher posting status; verify GST rates on invoices |
| 2.4 | Reconcile bank — new entries | Accounting > Bank Reconciliation > Pending | No un-reconciled entries older than 3 days | Match with physical bank statement; flag for investigation |

### Weekly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 2.5 | Review receivable ageing | Receivables & Payables > Receivable Ageing | No uncollected amount > 90 days without action | Flag for management; initiate legal/notice process |
| 2.6 | Review payable ageing | Receivables & Payables > Payable Ageing | All supplier dues within agreed credit terms | Hold payments for disputed items; clear due payments |
| 2.7 | Verify TDS register | GST & Tax > TDS Register | TDS deducted matches invoice amounts | Correct TDS entries; re-post allocation if needed |
| 2.8 | Verify posting control report | Accounting > Posting Control | No voucher with posting errors | Investigate each error; fix source data or re-post |

### Monthly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 2.9 | Run Trial Balance | Financial Control > Trial Balance | Total Debits = Total Credits | Identify out-of-balance accounts; post correcting journal |
| 2.10 | Generate P&L Statement | Financial Control > Profit & Loss | Net Profit/Loss calculated correctly | Verify income/expense accounts; check for missing entries |
| 2.11 | Generate Balance Sheet | Financial Control > Balance Sheet | Assets = Liabilities + Equity | Investigate discrepancy; check suspense accounts |
| 2.12 | Reconcile GST returns | GST & Tax > GST Register > Export GSTR-2B | Output GST matches GSTR-1; Input GST matches GSTR-2B | Identify mismatches; file corrections in next return period |
| 2.13 | Backup database | Utilities > Backup > Create Backup | Backup file created with timestamp | Check backup destination disk space; retry |

---

## 3. Inventory Manager

### Daily

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 3.1 | Review stock movements (inward) | Inventory > Stock Ledger > filter "Inward" (today) | All GRN-posted items reflected in stock ledger | Check GRN posting; verify stock inward transaction posted |
| 3.2 | Review stock movements (outward) | Inventory > Stock Ledger > filter "Outward" (today) | All issued stock deducted correctly | Verify stock outward voucher posted; check COGS accuracy |
| 3.3 | Check low stock alerts | Dashboard > Operations Mode > Stock Alerts (if available) or Inventory > Stock Summary > filter reorder level | No item below reorder level without procurement action | Initiate procurement request; raise purchase requisition |
| 3.4 | Verify stock adjustments | Inventory > Adjustments > today's entries | All adjustment entries have supporting reason code | Reject unsupported adjustments; re-post with correct reason |

### Weekly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 3.5 | Review stock reservations | Inventory > Stock Reservations > filter "Active" | Reserved stock within acceptable horizon (max 30 days) | Release stale reservations; reallocate to newer orders |
| 3.6 | Verify stock valuation | Inventory > Stock Summary > Valuation | Valuation method (FIFO/Weighted Average) applied consistently | Check stock ledger entries; verify landed cost allocation |
| 3.7 | Plan replenishment | Inventory > Planning > Procurement Requirements | Shortage items identified for next procurement cycle | Generate purchase requisition; send to procurement team |
| 3.8 | Review pending GRN | Inventory > GRN > filter "Draft" | No GRN older than 7 days | Follow up with receiving team; confirm goods physically received |

### Monthly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 3.9 | Run Stock Summary Report | Inventory > Reports > Stock Summary | Quantities and values match physical count | Initiate cycle count for discrepant items |
| 3.10 | Verify dead stock / non-moving items | Inventory > Stock Ledger > filter no movement > 90 days | Identify items for write-off or return | Raise retirement/adjustment note; management approval needed |
| 3.11 | Reconcile stock ledger with GL | Inventory > GL Integration Check | Stock account balance = stock ledger total value | Post adjusting journal entry; verify costing method |

---

## 4. System Administrator

### Daily

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 4.1 | Check database backup status | Utilities > Backup > Last Backup Status | Last backup less than 24 hours old | Run backup immediately; check disk space; verify backup integrity |
| 4.2 | Review audit log for anomalies | Accounting > Audit Log > filter "Today" | No unexpected delete/reversal/post activity | Investigate flagged entries; verify user identity |
| 4.3 | Verify system health | Health Center > System Health | All health checks pass (DB, disk, memory, IPC) | Review Health Center diagnostics; escalate hardware issues |

### Weekly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 4.4 | Review logs directory | `logs/` folder in ERP data directory | No log file > 100 MB; no error spikes | Rotate/archive large logs; investigate recurring errors |
| 4.5 | Verify export/import functionality | Test export from any report; test import on sample data | Files export correctly; import validates without crash | Clear temp directories; restart app; rebuild if needed |
| 4.6 | Check disk space | Health Center > Storage | Free space > 20% of total disk | Archive old backups; delete temp files; expand storage |

### Monthly

| # | Action | Where in ERP | Expected Outcome | If Issue Found |
|---|---|---|---|---|
| 4.7 | Run production readiness check | Production Readiness > Health Check | All readiness gates pass | Address failed gates; re-run after fixes |
| 4.8 | Archive old backups | `backups/` folder; move backups older than 90 days to cold storage | Backup folder contains only recent backups | Compress and move aged backups; update archive log |
| 4.9 | Review user access and roles | Settings > User Management | Active users have correct roles; no orphan accounts | Disable inactive accounts; verify role permissions |
| 4.10 | Verify environment configuration | Settings > Environment Manager | Config matches production baseline | Restore from baseline backup; apply approved changes only |
| 4.11 | Run Go-Live checklist validation | Deployment > Go-Live Checklist | All items green | Address checklist failures; schedule maintenance window |

---

## 5. Exception Handling Quick Reference

| Scenario | First Action | Second Action | Escalate To |
|---|---|---|---|
| Voucher posting fails | Check Posting Control Report | Fix source data (invoice/procurement) | Accountant |
| CRAC rejected by department | Verify delivery documents uploaded | Contact department issuing authority | Operations Manager |
| Bank reconciliation mismatch | Compare ERP bank book with bank statement | Post adjusting journal if needed | Accountant |
| Stock negative | Investigate stock outward without inward | Correct stock entries; verify GRN | Inventory Manager |
| Backup fails | Check disk space; retry with compaction | Check WAL file size; run checkpoint | System Administrator |
| Trial Balance not balanced | Check unposted vouchers; verify period | Run period-end closing; check journal entries | Accountant + System Administrator |
| GST mismatch (Input vs Output) | Verify GST rates on invoices/procurement | Reconcile with GSTR-2B / GSTR-1 | Accountant |

---

*End of Daily Operations Checklist*
