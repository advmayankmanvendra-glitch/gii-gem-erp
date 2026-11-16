# Responses to the 91e2fa1 audits (16 Nov 2026 IST)

Fixed in the next commit:
- Architecture M-1: the table is registered in DG-1. That covers the table entry with columns, foreign keys and indexes, three relationships, the inventory service mapping, postStockReturn reads/writes, migration 039 and the stock_ledger index. KG-4's postStockReturn now lists the table and its rule text describes the record. The graph registry entry count is 75.
- Correctness L-1 / Architecture L-1: the policy text now says V4 and the row-order dependence are closed for returns posted from 16 Nov 2026 on. Older no-voucher returns keep the billing in force when they are backfilled. The init.js comment was corrected.
- Correctness L-2: value_minor is rounded on the running total of billed and of unbilled rows, so each kind adds up to the voucher's GRNI or Trade Payables amount. The test fails with per-row rounding.
- Correctness L-3: new tests cover a record pointing at a receipt no longer in the pool (fails without the filter), a reversed receipt, rows adding up to the GRNI debit, and the backup being taken before the table existed. The `units > 1e-9` guard was removed: take() never yields such units and the CHECK constraint refuses them.
- Security L-1: the audit entry of each posted return lists receipts_used, and each backfill writes its own `stock_return_receipts_backfilled` audit entry.
- Security L-2: a unique index on (stock_return_id, stock_ledger_id), and a trigger that refuses UPDATE. Delete stays possible for the operational reset.
- Security L-3: MIGRATIONS_WITH_BACKUP is the one list. A test fails if a migration after 036 in init.js is missing from it.
- Architecture L-2: init.js now notes that 037 and 038 are used by the accounting programme branch.

Noted, not changed:
- Three returns at a price of a third of a paisa each can clear one paisa more GRNI than was received, because each return is rounded on its own. This predates the table, and the new test documents it.
