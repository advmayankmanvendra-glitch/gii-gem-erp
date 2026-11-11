# Area: inventory-ops (acf6d02)

## 1. Scope covered

Files read in full: `src/main/services/inventoryService.js`, `operationsService.js`, `operationalPlanningService.js`, `orderClosureService.js`, `cracService.js`, `paymentReadinessService.js`, `dashboardService.js`, `entitySearchService.js`, `src/main/database/crudHelpers.js`, `connection.js`. I also read the relevant parts of `init.js`: the table registry (52-269), automatic GRN and stock issue (861-948), `businessVoucherPayload` (955-1114), the receivable refresh (1472-1528) and the service wiring (1563-1934). From `accountingService.js` I read `reverseVoucher` (350-430), `postGuidedVoucher` and `postReceiptVoucher`. In `main.js` I read the IPC wiring for inventory, CRAC, closure, posting and approval, plus `preload.cjs`.

CRM: `grep -ril crm src/main` returns **nothing**. The CRM-like tables (leads, requirement_queries, quotations, negotiations, purchase_orders, installations) go through the generic CRUD in `crudHelpers.js`, and PO to Work Order conversion goes through `operationalPlanningService.js`. Both were reviewed.

Repro scripts are in `/tmp/claude-0/aud-work/inventory-ops/` (`h.mjs` harness, `r1`…`r13.mjs`). Each one runs on a fresh mkdtemp DB and deletes it afterwards. The verify-script logs are in `runs/*.log`.

### Verify scripts

- **How each run was isolated:** `connection.js:8-27` takes the data root from env `GII_GEM_ERP_DATA_ROOT`. If that is unset, it falls back to `process.cwd()`. Each script ran with cwd `/tmp/claude-0/aud`, a fresh `GII_GEM_ERP_DATA_ROOT` and a fresh `TMPDIR`.
- **No writes to the repo:** after the runs, `find /tmp/claude-0/aud -newer marker` was empty.

| Script | Result | Key lines | Real numbers or shape? | DB/root notes |
|---|---|---|---|---|
| verify-controls.js | PASS 12/0 | locked-year blocks for invoice/procurement/payment/adjustment/manual voucher; import rollback; "Posting and reversal workflow" | Mostly behaviour. The reversal check is `status === 'Reversed'` on a **manual** journal only, with no amounts. The audit check is `count >= 4`. | own mkdtemp, cleaned up |
| verify-voucher-workflows-inventory.js | PASS | `trialBalanceDifference 0`; `inventoryMovementRows 3`, `reservationRows 3` | TB difference is numeric. The rest is shape (`Array.isArray`, `.every(row.inventoryCostSource)`). Nothing checks stock value against GL Inventory or reservation quantities. | own mkdtemp in TMPDIR, **not cleaned up** (leaves a DB folder) |
| verify-phase10-inventory-automation.js | PASS | GRN created, DC confirmed, COGS rows exist, transfer Posted, TB diff 0 | Mostly counts and statuses; TB diff is numeric. No COGS amount, stock value or reservation balance is asserted. | mkdtemp, **not cleaned up** |
| verify-operational-flow.js | PASS | receivable 7080 then 0; `inventoryCostBasis === 3000`; grossMargin 3000; TB 0 | **Real numbers** (receivable, issued cost, outstanding, TB) | mkdtemp, **not cleaned up** |
| verify-operational-stage-crud.js | PASS 28 checks | plan available 5, short 5, estimated 500, then 7/660 after update; no voucher/ledger mutation | Real numbers for plan derivation; CRUD shape for the rest | mkdtemp, cleaned up |
| verify-dashboard-wiring.js | PASS 20/0 | key presence, finite numbers, date filter yields 0 | **Shape only**: no dashboard value is compared with source data. Many checks are string-includes on renderer/preload source. | mkdtemp, cleaned up |
| verify-safe-delete.js | PASS 26/0 | mostly `content.includes(...)` source scans + two FK lookups on empty IDs | Shape / static-text | **Calls `initializeDatabase()` with no root (line 106).** Without the env var it creates and seeds `<cwd>/database/gii_gem_erp.db`, i.e. the repo's own database folder. Isolated here via env. |
| verify-fk-constraints.js | PASS 5/0 | "Detected N item FK relationships"; guard text present | Shape / static-text | **Same: `initializeDatabase()` at line 39 writes into `<cwd>/database` unless the env var is set.** |
| verify-production-readiness-sql.js | "PASS" 14 passed, 0 failed, **1 skipped** | 14 regex scans of source; the only DB test SKIPPED with the message "native module version mismatch", but the real error was `Cannot open database because the directory does not exist` | Static-text only. The one runtime check is silently skipped, and the summary still says PASS. | Hard-codes `path.join(projectRoot,"database","gii_gem_erp.db")` (lines 104, 120, 136) and ignores the env var. In a real checkout it opens the **repo's own live DB** and runs `generateCertificate`/`calculateReadinessScore` against it (file opened read-write). Here that folder does not exist, so nothing was written. |

## 2. Findings

| ID | Sev | Status | file:line | Defect | Impact |
|---|---|---|---|---|---|
| IO-1 | P0 | REPRODUCED | accountingService.js:384-387 (+ AccountingScreen.jsx:72, 406) | The generic "Reverse voucher" on a GRN/COGS/adjustment/return voucher reverses the GL and marks the stock doc `Reversed`, but leaves `stock_ledger`, serials, batches and reservations untouched. The proper `reverseStock*` path is then blocked ("already reversed"). | GL Inventory and stock valuation diverge permanently. Goods stay in stock with no GL value. Reachable from the Accounting screen. |
| IO-2 | P0 | REPRODUCED | accountingService.js:384 path via guided voucher; init.js:861-921 | Reversing a posted **purchase** guided voucher leaves the auto-GRN, its stock and its Inventory/GRNI voucher in place. | Stock and Inventory stay booked for a cancelled bill, and GRNI keeps a phantom credit. |
| IO-3 | P1 | REPRODUCED | inventoryService.js:15, 22, 696 (sign by `transaction_type`) vs 387-480 (new types "Outward Reversal", "Adjustment Reversal", "Return Reversal") | Valuation queries treat any type outside {Inward, Adjustment Increase, Department Return} as an outflow. Inward-direction reversals therefore **subtract** value. | After the reversals, stock value is 200 for 10 units (GL 1000) and 480 for 10 units (true 1000). The next issue is costed at 48/unit, so COGS is wrong. Latent today: `reverseStock*` has no IPC/preload, so only scripts call it. It becomes P0 once wired. |
| IO-4 | P1 | REPRODUCED | inventoryService.js:253-260 vs operationsService.js:46 | Issue posting only decrements reservations whose status is `Reserved`/`Partially Issued`. Auto-reserve writes `Fully Available`/`Partially Reserved`/`Procurement Required`. | Reservations never move on issue (issued 5 → reservation still 8, issued 0). The reserved, reservation-ageing and procurement-required reports are wrong. |
| IO-5 | P1 | REPRODUCED | operationsService.js:42-44 | Auto-reserve uses gross on-hand quantity and ignores other orders' open reservations. | Two orders of 8 against 10 in stock are both "Fully Available" with 8 reserved each, so stock is promised twice. |
| IO-6 | P1 | REPRODUCED | operationsService.js:35, 43-45; inventoryService.js:203 | Re-running auto-reserve (posting any GRN linked to the order, or the UI "auto-reserve" button) cancels open rows and re-reserves the **full** order quantity, ignoring quantity already issued. | Shows a false shortfall of 2 when no further stock is needed. |
| IO-7 | P1 | REPRODUCED | inventoryService.js:546-547 + 570-580 | The dashboard sums `balance_reserved` over all reservations, **including Cancelled**. | Reserved qty shows 4, then 12 after the user clicks auto-reserve twice. This also feeds `dashboardCounts`. |
| IO-8 | P1 | REPRODUCED | inventoryService.js:35-39, 214-215, 273, 332 | Negative-stock and balance checks use the all-time aggregate, regardless of transaction date. Running balance is stored in insert order. | An issue dated 2026-05-01 is accepted against goods received 2026-08-01. Stock ledger shows running 0 when it was really -5, and COGS is posted in a period with no stock. |
| IO-9 | P1 | REPRODUCED | init.js:1013 + 861-865 | Purchase guided voucher with "Inventory + Accounting" but no item/warehouse debits GRNI. `createAutomaticGrnFromPurchaseVoucher` silently returns null, so nothing clears it. | Purchase cost is parked as a debit in a liability account (GRNI +1000); neither Purchase nor Inventory is booked. |
| IO-10 | P1 | REPRODUCED | inventoryService.js:322-325, 353-370 | Supplier-return GL routing uses the **company-wide** GRNI net sign (`>= 0`, including the empty case). It posts Dr Trade Payables with **no linked supplier**. | A return of goods that were never invoiced is booked to Trade Payables while GRNI stays wrong. The supplier ledger and bill-wise payables miss the debit. |
| IO-11 | P1 | REPRODUCED | operationsService.js:228-233 | `posting:post` for payments calls `postReceiptVoucher(db,id,invoiceId)` without deductions. TDS and GST-TDS stored on the payment row are dropped. | Receivable stays open by the TDS amount (4000 of 118000), with no TDS Receivable booked. Reachable via AccountingScreen.jsx:96. (Distinct from the known "first invoice" issue.) |
| IO-12 | P1 | REPRODUCED | orderClosureService.js:186-191 | The closure checklist accepts any non-deleted invoice/payment row: Draft, unposted, ₹1, or Reversed. "No Outstanding Issues" is hard-coded `true`. | An order with a Draft ₹1 payment against a ₹118,000 invoice was marked `operationally_closed = 1`. |
| IO-13 | P1 | REPRODUCED | inventoryService.js:10-12 (items are global, init.js:72-76) | Item opening stock has no company or warehouse. `stockBalance` adds it to every company. | Company 2 issued 5 units of company 1's opening stock: Co2 COGS +5000, Co2 Inventory −5000. This is a wider blast radius of the known "opening stock in every warehouse" issue. |
| IO-14 | P2 | REPRODUCED | paymentReadinessService.js:176, 227 | "Paid" means `amount_received >= billing×(1+gst)`. `amount_received` excludes TDS (init.js:1512). | A fully settled invoice (receivable Closed, balance 0) shows "Pending" and appears in the payment-delayed list. |
| IO-15 | P2 | REPRODUCED | cracService.js:107-113, 95 | Deleting any CRAC resets the order to "Not Required", even when another live Generated CRAC exists. Changing a CRAC to Rejected/Pending never downgrades the order (code-traced). | Order CRAC status no longer matches the CRAC register, which in turn misleads closure and readiness. |
| IO-16 | P2 | REPRODUCED | operationsService.js:62-66; cracService.js:56-68; inventoryService.js:210-215 | No check that the order belongs to `company_id` when creating a delivery challan, CRAC or stock outward. | A company-2 DC against a company-1 order was created; a company-2 CRAC set the company-1 order to Generated. |
| IO-17 | P2 | REPRODUCED | entitySearchService.js:26-38 | `supply_order` search is `companyScoped:false`. | The picker lists other companies' work orders (company 2 sees GEM-2026-001), which feeds IO-16. |
| IO-18 | P2 | REPRODUCED | inventoryService.js:379-488 | `reverseStockOutward`/`reverseStockInward` do not restore serial status, batch balance or reservations. | A reversed serial stays "Issued" and can never be re-issued. Reversing a batch inward leaves `batches.balance_quantity` 4 while stock is 1. |
| IO-19 | P2 | REPRODUCED | inventoryService.js:118-132, 148-163 | Serial register is one serial per document line regardless of quantity. Serial-tracked items can be issued without a serial. | A 10-unit inward created 1 serial row; issuing 2 units without a serial succeeded. Serial register does not match stock ledger. |
| IO-20 | P2 | REPRODUCED | dashboardService.js:52-53 | Dashboard "Amount Received" and "Total Order Value" include Draft/unposted (and reversed) payments and invoices. | +999,999 received and +555,555 billed from drafts. |
| IO-21 | P2 | REPRODUCED | init.js:893, 911 | Auto-GRN stores `rate = payload.rate / accepted_qty` (Receipt Rate 100, qty 8 → 12.5). Value is taken from `purchase_value` for **accepted** quantity only. | GRN rate field is wrong. Damaged units' cost is absorbed into WAC (125/unit instead of 100). |
| IO-22 | P2 | CODE-TRACED | items are master (crudHelpers.js:262-279 has no item lock); inventoryService.js:10-12 | Item `opening_stock`/`opening_value` stay editable after movements and are read live. No GL voucher is ever posted for opening stock (no reference outside inventoryService). | Historical stock and WAC change retroactively. Stock value 90,500 vs GL Inventory 85,500 after setting opening 5000 (r8). |
| IO-23 | P2 | CODE-TRACED | operationsService.js:205-221 | `approveTransaction` has no state check (approves Posted/never-submitted records) and no maker ≠ checker check. | Weakens maker-checker for invoices, procurements, payments and expenses. |
| IO-24 | P2 | CODE-TRACED | operationsService.js:91-113 | Delivery challan lines are not validated against `order_items` (item or quantity balance). | Over-delivery, or delivery of items not on the order, posts COGS against the order. |
| IO-25 | P3 | CODE-TRACED | inventoryService.js:331-346 | A Department Return has no cap against quantity issued to that order/department and is valued at current WAC, not the original issue cost. | Inflated stock and COGS credits are possible. |
| IO-26 | P3 | CODE-TRACED | operationsService.js:41 | Warehouse fallback "first active warehouse" is not company-filtered. | Reservation may point at another company's warehouse. |
| IO-27 | P3 | REPRODUCED (r4) | safeDeleteService via crudHelpers.js:388 | A supply order with item lines can never be deleted (FK from its own `order_items` and `stock_reservations`). | Safe in effect, but a draft order can't be removed; the error message is generic FK text. |

Counts: **P0 2, P1 11, P2 11, P3 3.**

## 3. Details and repro output

**IO-1 / IO-2** (`r1.mjs`, `r9.mjs`)
```
R2 vouchers:reverse on GRN voucher: stock qty item4 5 -> 5 ; GL Inventory 87500 -> 86500 ; stock_inwards status Reversed
reverseStockInward now: Stock inward is already reversed
R9c after reversing purchase voucher: stock qty 8 -> 8 ; Inventory 86500 -> 86500 ; GRNI -102500 -> -103500 ; GRN status Posted ; stock_inward Posted
```
`reverseVoucher` (accountingService.js:384-387) only flips `posting_status` on stock tables. Stock reversal functions are exported (init.js:1884) but have no IPC handler or preload entry. `grep reverseStock src/preload src/renderer` finds nothing, so the Accounting screen's generic Reverse is the only reversal a user can reach.

**IO-3** (`r1.mjs`, `r13.mjs`)
```
after inward 10@100 + outward 4: stock { q: 6, v: 600 } GL Inventory delta 600
after reverseStockOutward: stock { q: 10, v: 200 } GL Inventory delta 1000   (running_value column says 1000)
after decrease-adj+reversal and supplier-return+reversal: qty 10 stock_value 480 rate 48 (true value 1000)
next issue of 5 units costed at COGS = 240 (should be 500)
```
`insertStockLedger` computes `running_value` by quantity direction (line 42), but `stockBalance` and `inventoryStockSummary` compute by type list (15, 22, 696). The two disagree for every reversal type. The known "warehouse transfer value sign bug" has the same root cause.

**IO-4 / IO-5 / IO-6** (`r4.mjs`)
```
R4 overlap: order 2 reserved 8 (available 10), order 3 reserved 8 (available 10)  both 'Fully Available'
after issuing 5 to A: reserved 8, issued 0, balance 8, status 'Fully Available'
R5 after GRN linked to A: old row Cancelled; new row reserved 6, short 2, 'Partially Reserved' (required 8, already issued 5)
```

**IO-7** (`r12.mjs`): `reserved qty after 1 order of 4: 4` → `after re-running auto-reserve twice: 12` (two Cancelled rows still carry balance_reserved 4).

**IO-8** (`r3.mjs`): Outward 2026-05-01 qty 5 was accepted, with an Inward 2026-08-01 qty 5. Ledger to 2026-06-30 shows `['2026-05-01','Outward',0]`.

**IO-9** (`r9.mjs`): `R9a purchase w/o item: GRNI delta 1000 Inventory delta 0`.

**IO-10** (`r12.mjs`): Co2 GRNI is −500 after a GRN, then +500 after an unrelated purchase bill. A supplier return of the un-invoiced goods then posts `Trade Payables Dr 500 (linked_party null) / Inventory Cr 500`, and GRNI stays at +500.

**IO-11** (`r11.mjs`): The payment row has tds 2000 and gst_tds 2000. After `postBusinessTransaction('payment')`: `GL TDS Receivable 0 GST TDS 0`, receivable `{invoice 118000, received 114000, tds 0, balance 4000, Open}`.

**IO-12** (`r10.mjs`): invoice Draft, payment Draft for ₹1. `closure: percentage 100 ready true` → `operationally_closed = 1`.

**IO-13** (`r8.mjs`): `company 2 issued 5 units of company-1 opening stock; Co2 COGS = 5000 Co2 Inventory = -5000`.

**IO-14** (`r11.mjs`): `INV-PR-2 fully settled with TDS: {received 114000, tds 2000, gst_tds 2000, balance 0, Closed} readiness: Pending delayed list: true`.

**IO-15** (`r10.mjs`): `after deleting the stale Pending duplicate, order crac_status = 'Not Required' ... but live Generated CRAC exists: true`.

**IO-16 / IO-17** (`r8.mjs`): `DC created in company 2 against order of company 1`; `CRAC in co2 for co1 order -> order crac_status: Generated`; `entity search supply_order with company_id=2 returns: [ 'C2-SO', 'GEM-2026-001' ]`.

**IO-18 / IO-19** (`r6.mjs`):
```
after reverseStockOutward: serial { status: 'Issued' }
re-issue of reversed serial: Serial number is not available for issue
after reverseStockInward of batch inward: batch { quantity: 4, balance_quantity: 4 } stock qty 1
10 units inward with one serial -> 2 serial rows (1 per document)
serial-tracked item issued without serial: OK (no check)
```

**IO-20** (`r12.mjs`): `amountReceived 350000 -> 1349999 (draft unposted payment) ; totalOrderValue 1000000 -> 1555555`.

**IO-21** (`r9.mjs`): `GRN: accepted 8 stored rate 12.5 landed 1000 ledger rate 125`.

## 4. What looks solid (with evidence)

- **Stock-out guard on the aggregate:** `insertStockLedger` throws on a negative aggregate (line 39). The checks before posting at 215, 273 and 332 also hold. Reversal of a consumed inward is blocked by the same guard.
- **Atomicity:** inventory posting functions wrap the ledger, voucher, status and audit writes in one `db.transaction`. `confirmDeliveryChallan` wraps all lines, and any stock failure rolls back the challan.
- **No double posting:** `ensureStockNotPosted` blocks re-posting stock docs, and posted stock docs are locked for edit/delete (crudHelpers.js:264-266).
- **Adjustment approval:** stock adjustment requires `approval_status='Approved'` (line 270). Caveat: createRecord trusts a supplied status, which is the known defect.
- **Trial balance:** GL vouchers for GRN, COGS, adjustments and returns are balanced. Every verify script with a TB check reports a difference of 0.
- **Procurement plans and PO conversion:** both enforce company match for order and warehouse (operationalPlanningService.js:29-34, 113-116) and run in a transaction. Verified numerically by verify-operational-stage-crud (5/5/500 → 7/660).
- **Safe delete:** soft delete is respected in reports (`COALESCE(is_deleted,0)=0` throughout inventoryService). Safe delete blocks FK-referenced parents (r4).
- **Dashboard scoping:** dashboard counts are company-scoped, or limited to active companies when no company is selected (dashboardService.js:38-40).
- **Verify-script isolation:** env `GII_GEM_ERP_DATA_ROOT` works for all `initializeDatabase()` callers. No repo writes were detected.

## 5. Not covered

- Electron UI click-through; renderer screens beyond grepping for IPC callers.
- Warehouse transfer valuation (known defect), apart from noting its shared root cause with IO-3.
- `seedData.js` demo numbers. The seeded GRNI of −103,500 vs Inventory 85,500 was not investigated.
- Tally stock import into the stock ledger.
- `verify-fsr-2a4.js` / `verify-fsr-2a5a.js`, which call `reverseStock*`. They are not in my run list, and I did not check whether they assert values.
- Concurrency: the app is single-process.
- Money minor-unit shadow columns (`value_minor`): read, but not reconciled against REAL values.
