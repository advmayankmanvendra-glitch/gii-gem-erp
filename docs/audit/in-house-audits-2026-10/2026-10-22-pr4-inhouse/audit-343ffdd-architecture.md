# In-house architecture audit: a11bd45..343ffdd

- Scope: `git diff a11bd45 343ffdd -- src scripts`. Four files changed:
  - `src/main/services/updateInstaller.js`: +54 / -11
  - `scripts/audit/ipc-security.test.mjs`: +54 / -3
  - `scripts/assistant-natural-query-bank.js`: +1
  - `src/renderer/knowledge/feature-function-graph.json`: +6 / -4
- Not re-raised (known residuals): F49, F46/F4, F31, G3, C3.
- Checks run:
  - `verify-feature-function-graph.js`: 31/31.
  - `verify-voucher-accounting-graph.js`: pass.
  - `verify-audit.js`: FF-1 and KG-4 packs pass.
  - `npm run -s test:integrity`: exit 0.
- Date: 2026-11-11 09:47 IST

## Short answer

- **Minimal, and in the right layer.** The updater change stays inside `updateInstaller.js`. The exports used by `main.js` (`stageInstaller`, `removeStagedCopy`, `hashFile`, `clearInstallerStaging`) keep their names and signatures. `main.js` and `src/preload` are untouched (empty diff), so no IPC channel or preload name changed. `removeOwnCopy` is a private helper shared by the failure path and `removeStagedCopy`, which removes duplicated clean-up code.
- **No business logic in the renderer.** The only renderer change is FF-1 JSON data.
- **FF-1 now agrees with KG-4 on the GRN facts:** `voucherTypes: ["journal"]` matches the KG-4 `voucherTypeId` and the other FF-1 entries' casing, and `postStockInward` matches KG-4 (`voucher-accounting-graph.json:666`, "Journal (GRN receipt)") and the code (`init.js:1060`). Two graph-internal gaps are left in FF-1 itself (L-1, L-2).

| ID | Severity | Where | One line |
|---|---|---|---|
| L-1 | Low | `feature-function-graph.json` `correlationEdges` | FEA-14 is the only feature with `voucherTypes` but no `feature_creates_voucher` edge |
| L-2 | Low | `feature-function-graph.json:785` vs `:3029` | FEA-14's `postingFunctions` now names `postStockInward`, but its own function node FNC-09 is still `recordGoodsReceipt`, which does not exist in the code |

## L-1: FEA-14 has a voucher type but no voucher edge

- I checked all 16 FF-1 features that list `voucherTypes`. Every one has a matching `feature_creates_voucher` edge, except FEA-14, which has `["journal"]` and no edge.
- FEA-14's edges are only `FNC-09`, its safety boundary, and three tables. FEA-13, by contrast, has `FEA-13 → purchase feature_creates_voucher`.
- **Failure scenario.** A consumer that walks the edges, such as a future relationship tracer or the "Voucher types involved" path built on edges rather than node fields, would still say a GRN creates no voucher. That is exactly the fact this PR series corrected. Today the assistant reads the node field (`answerContractBuilder.js:109`), so users do not see the gap yet.
- **Fix.** Add `{ "from": "FEA-14", "to": "journal", "relationshipType": "feature_creates_voucher", "strength": "primary", "sourceGraph": "FF-1", "sourceReference": "KG-4 postingFunction: postStockInward", "safeForAnswering": true }`. Consider an FF1 check that every `voucherTypes` entry has an edge.

## L-2: FEA-14's posting function and its function node disagree

- `featureNodes[FEA-14].postingFunctions` is now `["postStockInward"]` (`:785`).
- The feature's own node, `FNC-09` (`:3028-3031`, linked by `feature_has_function`), keeps `canonicalName: "recordGoodsReceipt"`. Its description now says "The posting function is postStockInward".
- `recordGoodsReceipt` does not exist anywhere in `src/main`.
- So FEA-14 is the only feature whose `postingFunctions` entry matches none of its own function nodes. FEA-24's `createExpenseVoucher` has the same looseness, but it has no node at all.
- **Failure scenario.** A lookup from `postingFunctions` to `functionNodes` (by canonical name) finds nothing for GRN. A lookup from FNC-09 to KG-4 (by function name) also finds nothing. The two graphs then trace GRN to different functions.
- **Fix.** Rename FNC-09's `canonicalName` to `postStockInward` (keeping `recordGoodsReceipt` as an alias if anything references it). Or record the mapping in FNC-09's `sourceReferences`.

## Informational (no finding)

- `updateInstaller.js:289` repeats the "update-staging folder changed" message that `changed()` builds at `:151`. `changed()` is local to `ensureStagingFolder`. Moving it to module scope would keep the two copies from drifting.
- The comment at `:65-70` ("A link at the top is only unlinked; below the top it is left alone") now refers only to the folder argument itself. A link inside any folder is left alone (`:90-92`). Consider rewording it.
- The new tests stay in `ipc-security.test.mjs` and use the existing helpers (`installWithStubbedLaunch`, `withPatchedOpen`). They add no new harness. Whether they cover the change is in correctness M-1.
