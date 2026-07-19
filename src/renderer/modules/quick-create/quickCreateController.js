import { isQuickCreateEnabled, getQuickCreateEntity } from "./quickCreateRegistry.js";
import { assertQuickCreateAllowed } from "./quickCreatePermissions.js";
import { findDuplicate } from "./quickCreateDuplicateGuard.js";
import { mapQuickCreateResult } from "./quickCreateResultMapper.js";

export function openQuickCreate(type, role, options = {}) {
  if (!isQuickCreateEnabled(type)) {
    const entity = getQuickCreateEntity(type);
    throw new Error(entity?.denialReason || `${type} quick creation is not available.`);
  }
  assertQuickCreateAllowed(type, role);
  return {
    type,
    field: options.field || null,
    defaults: options.defaults || {}
  };
}

export function checkDuplicate(type, form, records) {
  return findDuplicate(type, form, records);
}

export function processQuickCreateResult(type, saved) {
  return mapQuickCreateResult(type, saved);
}

export { assertQuickCreateAllowed } from "./quickCreatePermissions.js";
