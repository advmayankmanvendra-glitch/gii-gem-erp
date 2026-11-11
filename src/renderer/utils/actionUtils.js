export async function confirmAction(options = {}) {
  if (typeof window !== "undefined" && typeof window.__giiGemConfirm === "function") {
    return window.__giiGemConfirm(options);
  }
  return { confirmed: window.confirm(options.message || "Do you want to continue?"), reason: "" };
}

export function deleteConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "danger",
    title: "Delete Record",
    message: "Are you sure you want to delete this record? This action may affect linked reports.",
    confirmLabel: "Yes, Delete",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

export function postedProtectionOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Posted Record Protected",
    message: "Posted records cannot be deleted directly. Please use reversal or correction workflow.",
    confirmLabel: "OK",
    hideCancel: true,
    moduleName,
    recordId
  };
}

export function postConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Post Transaction",
    message: "Do you want to post this transaction? Once posted, it may be locked from direct editing.",
    confirmLabel: "Yes, Post",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

export function approveConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "warning",
    title: "Approve Transaction",
    message: "Do you want to approve this transaction?",
    confirmLabel: "Yes, Approve",
    cancelLabel: "No, Cancel",
    moduleName,
    recordId
  };
}

export function reversalConfirmOptions(moduleName, recordId = null) {
  return {
    mode: "danger",
    title: "Reverse Posted Transaction",
    message: "Do you want to reverse this posted transaction?",
    confirmLabel: "Yes, Reverse",
    cancelLabel: "No, Cancel",
    requireReason: true,
    reasonLabel: "Reason for reversal",
    reasonPlaceholder: "Enter correction/reversal reason",
    moduleName,
    recordId
  };
}

export function isRecordLocked(record = {}) {
  return ["Posted", "Reversed", "Locked"].includes(record.posting_status) || ["Posted", "Reversed"].includes(record.status) || Number(record.order_locked) === 1;
}
