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
  "uploadDocument",
  "createRecord",
  "updateRecord",
  "deleteRecord",
  "createBackup",
  "restoreBackup",
  "getUpdateStatus",
  "openUpdateFolder",
  "installUpdate"
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
      if (blockedPreviewActions.has(prop)) return previewBlocked(prop);
      return target[prop];
    }
  });
}
