# Responses to the 084a72c audits (11 Nov 2026 IST)

Fixed in the next commit:
- Correctness M-1: new test. During the copy open, the staging folder is moved out of the data folder and a link to it is left behind, so only the after-open folder check can catch it. The test fails when that check is removed (mutation-checked).
- Correctness L-1: FEA-14 gets a one-word natural question, "GRNI". Any question containing GRNI now matches FEA-14 strongly and gets the GRN Journal answer with the accounting notice. Probed: Explain GRNI, GRNI balance, How do I clear GRNI?, Reverse GRNI, GRNI aging, GRNI in the workflow, GRNI report, Show GRNI report, What does GRNI mean? All are high confidence and name Goods Received Not Invoiced. New bank cases: GRN-014 and GRN-015.
- Correctness info 1: the inert "goods received not invoiced" alias was removed. The spelled-out question is answered through the classifier rule (GRN-013 still passes).

Answered, not changed:
- Correctness info 2 (no test for the missing-folder mapping): it fails closed, and no finding asked for a test.
- Security info (the launch does not re-check the folder): this is the accepted residual, because it needs write access to update-staging.
- Security info (folderUnchanged swallows all errors): it refuses the update, and the guided "restart" message is the intended one.
- Architecture info (GRNI wording in both the classifier and FF-1): GRN-012 to GRN-015 cover both paths.
