# Responses to the f5394f5 audits (11 Nov 2026 IST)

Fixed in the next commit:
- Correctness M-1: two new tests. One swaps the folder before the copy is opened, the other only for the open. Each fails when the check it targets is removed (mutation-checked, as is the owner test).
- Correctness L-1: the owner test fakes the owner through `fs.promises.lstat`, so it runs without root. It is reported as skipped where there are no POSIX owners.
- Correctness L-2 and L-3: GRNI and "goods received not invoiced" are classed as accounting questions, so they get the accounting notice. The spelled-out name is an FEA-14 alias. New cases GRN-012 (moved to accounting) and GRN-013.
- Correctness info: the folder checks treat a missing folder as "changed", so the guided message stays the same. The no-op `truncate(0)` was removed and the comment now says nothing is written.
- Architecture L-1: new FF1-32 check that each feature's voucherTypes match its feature_creates_voucher edges. It fails when the FEA-14 edge is removed.
- Architecture info: the redundant `changed` alias was removed.

Answered, not changed:
- Security info (the staging folder's identity is taken by path once): exploiting it needs write access to update-staging, which is the accepted residual. Closing it fully needs openat-style directory handles, which Node lacks.
- Architecture info (where the edge sits in the list): order has no meaning in correlationEdges. It is left beside the other FEA-14 edges.
