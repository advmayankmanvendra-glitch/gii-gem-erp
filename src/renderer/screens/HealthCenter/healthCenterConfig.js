const verificationCommands = [
  {
    title: "Syntax Check",
    command: "npm.cmd run lint:syntax",
    note: "Confirms renderer and main-process source parse cleanly."
  },
  {
    title: "Production Build",
    command: "npm.cmd run build",
    note: "Confirms the packaged renderer can be built."
  },
  {
    title: "Accounting Verification",
    command: "npm.cmd run verify:accounting",
    note: "Confirms vouchers and ledger entries remain balanced."
  },
  {
    title: "Financial Verification",
    command: "npm.cmd run verify:financials",
    note: "Confirms GST and financial report reconciliation checks."
  }
];

const recoveryGuidance = [
  {
    title: "Blank Screen or Renderer Error",
    cause: "A renderer module failed to load or a variable was referenced before being defined.",
    action: "Open logs, capture the latest renderer error, then restart the desktop app after the fix is applied."
  },
  {
    title: "Backup Does Not Appear",
    cause: "The app may be writing to a different runtime folder or the backup folder may be blocked.",
    action: "Open the runtime backup folder from Health Center and verify the active data root."
  },
  {
    title: "Document Upload Missing After Restart",
    cause: "Uploaded files may be stored outside the installed runtime documents folder.",
    action: "Open the documents folder and confirm files are under company/module/year."
  },
  {
    title: "Accounting Verification Fails",
    cause: "A voucher, reversal or ledger entry is out of balance.",
    action: "Stop posting new entries and use voucher register plus audit log to isolate the last changed voucher."
  }
];

const phaseLocks = [
  "Phase 14A - Modularization Safety Baseline",
  "Phase 14B - Renderer Component Boundary Extraction",
  "Phase 14C - Presentation Component Expansion",
  "Phase 14D - Low-Risk Layout Wrapper Adoption",
  "Phase 14E - Low-Risk Report Wrapper Expansion",
  "Phase 14F - Runtime Safety Review",
  "Phase 14G - Packaging Runtime Path Hardening",
  "Phase 14R - Locked through Git"
];

const folderActions = [
  { key: "runtime", label: "Open Runtime Folder" },
  { key: "database", label: "Open Database Folder" },
  { key: "backups", label: "Open Backups Folder" },
  { key: "documents", label: "Open Documents Folder" },
  { key: "logs", label: "Open Logs Folder" },
  { key: "exports", label: "Open Exports Folder" }
];

export { folderActions, phaseLocks, recoveryGuidance, verificationCommands };
