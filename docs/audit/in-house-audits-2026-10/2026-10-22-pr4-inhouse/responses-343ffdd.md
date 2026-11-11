# Responses to the 343ffdd audits (11 Nov 2026 IST)

Fixed in f5394f5: correctness M-1, L-1 and L-2; security L-1 and L-2; architecture L-1; both informational notes (one shared message, comment updated).

Answered, not changed:
- Architecture L-2 (FNC-09 is named `recordGoodsReceipt`, which is not a code function): FF-1 function nodes are capability names, not code symbols. Siblings such as FNC-01 `createSalesInvoice` and FNC-05 `createJournal` don't exist in `src/main` either. The code function is recorded on the feature (`postingFunctions: ["postStockInward"]`) and in the FNC-09 description. A rename would break the naming convention for one node only, so it is left for the KG-4 v1.1 / FF-1 naming pass.
