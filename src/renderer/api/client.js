export const isDesktopRuntime = Boolean(window.giiGemErp);

const blockedPreviewActions = new Set([
  "changePassword",
  "createBankImport",
  "updateBankImportStatus",
  "manualBankEntryMatch",
  "postApprovedBankImport",
  "generateVoucherProposals",
  "updateVoucherProposal",
  "approveVoucherProposal",
  "rejectVoucherProposal",
  "createDraftVoucherFromProposal",
  "postDraftVoucherFromProposal",
  "saveBillingVoucher",
  "postStockInward",
  "postStockOutward",
  "postStockAdjustment",
  "postStockReturn",
  "approveStockAdjustment",
  "autoReserveOrderStock",
  "createDeliveryChallan",
  "confirmDeliveryChallan",
  "createWarehouseTransfer",
  "postWarehouseTransfer",
  "createReceiptAllocation",
  "unallocateReceiptAllocation",
  "reallocateReceiptAllocation",
  "createSupplierPaymentAllocation",
  "unallocateSupplierPaymentAllocation",
  "reallocateSupplierPaymentAllocation",
  "createAdvanceReceipt",
  "createSupplierAdvance",
  "adjustAdvanceReceipt",
  "adjustSupplierAdvance",
  "reverseAdvanceAdjustment",
  "saveCreditTerm",
  "createPartyOpeningBalance",
  "createVoucher",
  "createBusinessVoucher",
  "updateGuidedVoucherStatus",
  "postGuidedVoucher",
  "reverseVoucher",
  "postTransaction",
  "approveTransaction",
  "createFinancialYear",
  "updateFinancialYearStatus",
  "createOpeningBalance",
  "closeFinancialYear",
  "selectTallyXmlFile",
  "selectTallyMigrationFile",
  "previewTallyStockXml",
  "previewTallyMasterMigration",
  "exportMasterData",
  "previewMasterDataUpdate",
  "confirmMasterDataUpdate",
  "getMasterDataCompleteness",
  "getMasterDataToolsHealth",
  "importRecords",
  "rollbackImportBatch",
  "deleteItemImportBatch",
  "deleteUnusedImportedItems",
  "selectDocumentFile",
  "uploadDocument",
  "viewDocument",
  "downloadDocument",
  "deleteDocument",
  "replaceDocument",
  "createRecord",
  "updateRecord",
  "deleteRecord",
  "createBackup",
  "restoreBackup",
  "getUpdateStatus",
  "openUpdateFolder",
  "installUpdate",
  "checkForUpdates",
  "downloadUpdate",
  "quitAndInstall",
  "getAutoUpdateStatus"
]);

const previewDesktopSubscriptions = new Set([
  "onUpdateDownloadProgress"
]);

function previewBlocked(methodName) {
  return async () => {
    throw new Error(`${methodName} requires the Windows desktop app. Browser preview is read-only and is not connected to SQLite.`);
  };
}

export function resolveApi(fallbackApi) {
  if (window.giiGemErp) {
    return { ...window.giiGemErp, __runtime: "desktop-sqlite", __readOnlyPreview: false };
  }
  return new Proxy({ ...fallbackApi, __runtime: "browser-preview", __readOnlyPreview: true }, {
    get(target, prop) {
      if (previewDesktopSubscriptions.has(prop)) return () => () => {};
      if (blockedPreviewActions.has(prop)) return previewBlocked(prop);
      if (typeof target[prop] === "function") return target[prop];
      if (prop in target) return target[prop];
      return async () => { throw new Error(`${String(prop)} is not available in browser preview. Run in the desktop app.`); };
    }
  });
}
