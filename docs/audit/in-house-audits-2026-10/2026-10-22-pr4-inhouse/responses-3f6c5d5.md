# Responses to the 3f6c5d5 audits (11 Nov 2026 IST)

Fixed in the next commit:
- Correctness L-1: the relevance verifier has a new gate, "Pinned cases (GRN Journal / GRNI) all pass" (GRN-011 to GRN-015). Removing the one-word "GRNI" entry now ends the run with Final: BLOCKED, exit 1 (checked).
- Architecture info: both GRNI entries now use expectedAnswerType "accounting_ref", which matches how they are answered and marks the one-word entry as deliberate.

Correction to responses-084a72c.md: "any question containing GRNI" overstates it. Short GRNI questions match FEA-14 strongly. Questions that name another feature more strongly ("GRNI and purchase invoice", "GRNI for supplier ABC") still go to that feature, as they did before. "GRNIs" and "GRNI's" are not matched, which is not a regression.
