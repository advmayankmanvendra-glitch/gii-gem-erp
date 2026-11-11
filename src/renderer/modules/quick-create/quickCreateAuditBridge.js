import { getQuickCreateEntity } from "./quickCreateRegistry.js";

export function getQuickCreateAuditEvent(type) {
  const entity = getQuickCreateEntity(type);
  return entity?.auditEvent || `${type}.quick_created`;
}
