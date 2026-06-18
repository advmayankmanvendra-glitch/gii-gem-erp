export const SAFE_MODE_VIEW_KEY = "safe_mode";

export const safeFallbackActions = [
  { label: "Go to Dashboard", target: "dashboard", description: "Return to the normal ERP landing screen." },
  { label: "Open Health Center", target: "health_center", description: "Review diagnostics, checks and support bundle options." },
  { label: "Open Settings", target: "settings", description: "Review backup, restore and local runtime structure." }
];

export const safeModeChecklist = [
  "Read the visible error message before retrying the screen.",
  "Open Health Center and refresh diagnostics.",
  "Export a support bundle if the error repeats.",
  "Return to Dashboard only after saving any notes needed for review."
];
