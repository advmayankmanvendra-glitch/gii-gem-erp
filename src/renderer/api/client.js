export const isDesktopRuntime = Boolean(window.giiGemErp);

const blockedPreviewActions = new Set([
  "changePassword",
  "setRecoverySecret",
  "recoveryResetPassword",
  "adminResetPassword",
  "listUsers",
  "assignAccountGroup",
  "createLedgerAccount",
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
  "installUpdate"
]);

// Desktop-only capabilities that screens call directly (without first checking
// that the method exists). In browser preview they reject with a guided
// message instead of failing with "is not a function". Every other method the
// preview does not provide stays undefined, so `if (api.x)` / `api.x?.()`
// capability checks keep working.
const desktopOnlyActions = new Set([
  "checkGoLivePreconditions",
  "previewGoLive",
  "executeGoLive",
  "verifyGoLive",
  "rollbackGoLive",
  "completeGoLive",
  "getGoLiveHistory",
  "getDeploymentReadiness",
  "generateGoLiveCertificate",
  "getCertificateHistory",
  "generateCertificate",
  "previewReset",
  "executeReset",
  "openBackupFolder",
  "setVerificationProfile",
  "switchEnvironment",
  "computeOrderClosure",
  "simulateProfit",
  "markOrderOperationallyClosed",
  "createCracRecord",
  "listCracRecords",
  "getPaymentReadinessReport",
  "getAccountMappingRegistry",
  "getAccountClassifications",
  "getAccountMappingCoverage",
  "saveAlertSettings",
  "previewAlert",
  "sendAlertNow",
  "logout"
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
      if (prop in target) return target[prop];
      if (desktopOnlyActions.has(prop)) return previewBlocked(prop);
      return undefined;
    }
  });
}
