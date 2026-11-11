# In-house architecture audit: 343ffdd..f5394f5

- Scope: `git diff 343ffdd f5394f5 -- src scripts`. Four files:
  - `src/main/services/updateInstaller.js`: +26 / -11
  - `scripts/audit/ipc-security.test.mjs`: +52
  - `scripts/assistant-natural-query-bank.js`: +2 / -1
  - `src/renderer/knowledge/feature-function-graph.json`: +15
- It answers `audit-343ffdd-architecture.md` L-1 and both informational notes. L-2 (FNC-09 naming) was answered in `responses-343ffdd.md` and is not re-raised.
- Not re-raised (known residuals): F49, F46/F4, F31, G3, C3, FF-1 function-node naming.
- Checks run:
  - `verify-feature-function-graph.js`: 31/31.
  - `verify-voucher-accounting-graph.js`: pass.
  - `verify-audit.js`: 0 FAIL (the FF-1 and KG-4 packs pass).
  - `npm run -s test:integrity`: exit 0.
- Date: 2026-11-11 10:06 IST

## Short answer

- **Minimal, and in the right layer.**
  - The updater change stays inside `updateInstaller.js`. It adds two private helpers (`changedStaging`, `ownedByThisAccount`) and a few lines in `stageInstaller`.
  - The exports used by `main.js` keep their names and signatures: `stageInstaller`, `removeStagedCopy`, `hashFile`, `clearInstallerStaging`, `stagingFolderPath`, `assertInstallerInsideUpdateFolder`, `shortInstallerName`, `guidedError`, `removeStagingTree`.
  - `src/main/main.js` and `src/preload` have an empty diff, so no IPC channel or preload name changed.
- **No business logic in the renderer.** The only renderer change is FF-1 JSON data.
- **Consistent with KG-4/FF-1.**
  - The new edge `FEA-14 → journal` (`feature_creates_voucher`) matches the FEA-14 node (`voucherTypes ["journal"]`, `createsAccountingImpact: true`).
  - It matches KG-4's GRN receipt Journal via `postStockInward`.
  - It uses the sibling edges' `sourceGraph: "KG-4"` and `sourceReference: "voucherTypes array"`.
  - All 16 features with `voucherTypes` now have exactly matching edges, with none extra (checked).
- **Both 343ffdd informational notes are done.**
  - The message is built in one place (`changedStaging`, `:205`) and used at `:152`, `:297` and `:304`.
  - The comment at `:65-71` now says that a link inside is never removed.

| ID | Severity | Where | One line |
|---|---|---|---|
| L-1 | Low | `scripts/verify-feature-function-graph.js` (no check) | Nothing checks that `voucherTypes` and `feature_creates_voucher` edges agree. Deleting the new edge leaves every verifier green |

## L-1 (Low): the gap closed by hand can come back unseen

- 343ffdd architecture L-1 found that FEA-14 was the only feature with `voucherTypes` but no voucher edge. f5394f5 adds the edge but no check. The earlier report suggested a check with "Consider", so this is a follow-up, not a missed fix.
- **Measured.** I removed the new edge in a scratch copy. Every check still passes:
  - `verify-feature-function-graph.js`: 31/31;
  - the relevance run: Final: PASS, 260/268, the same as head;
  - `verify-audit.js`: no FF-1 failures.
- **Failure scenario.** A later FF-1 edit, such as a feature split or an id renumbering, drops or misses an edge. Node fields and edges then disagree again. Today the assistant reads the node field (`answerContractBuilder.js`), so users don't see it. Any edge-walking consumer would again say that a GRN creates no voucher.
- **Fix.** Add one FF-1 check: for every feature, the set of `voucherTypes` equals the set of `to` values on its `feature_creates_voucher` edges. Today this holds for all 16 features, so the check passes as is.

## Info (no finding)

- **Edge placement.** The new edge sits at `feature-function-graph.json:3927`, among FEA-14's `feature_uses_table` edges. The other `feature_creates_voucher` edges form one block sorted by feature (`:4557` onwards, FEA-07, FEA-13, FEA-19…). FEA-14's edge belongs between FEA-13 and FEA-19. Nothing depends on edge order. It only matters for anyone who reads the block for a feature's vouchers.
- **`const changed = changedStaging;` (`:152`)** is now a plain alias. Calling `changedStaging()` directly at `:185` and `:201` would drop a name.
- **`ownedByThisAccount` (`:215`) and `ownStagingFolder` (`:210`)** both guard for win32 and a missing `getuid`. `ownStagingFolder` still needs its own guard so that the mode check is skipped on Windows. The repetition is small and the two helpers read clearly.
- **The tests stay in `ipc-security.test.mjs` and use the existing helpers** (`installWithStubbedLaunch`, `withPatchedOpen`, a `fs.promises.mkdir` patch like the one at `:899`). They add no new harness. What the tests cover is in the correctness report (M-1, L-1).
- **The bank change is data only.** GRN-011 keeps the a11bd45 case under a unique id. GRN-012 follows the existing `buildCase` shape. Its boundary choice is discussed in correctness L-2.
