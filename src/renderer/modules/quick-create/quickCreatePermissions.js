import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { isQuickCreateEnabled, getQuickCreateDenialReason, getQuickCreateEntity } from "./quickCreateRegistry.js";

export function canQuickCreate(type, role) {
  const entity = getQuickCreateEntity(type);
  if (!entity) return { allowed: false, reason: `Unknown quick create type: ${type}` };
  if (!entity.enabled) return { allowed: false, reason: entity.denialReason || `${entity.label} quick creation is not enabled.` };
  if (!roleAllowsAction(role, entity.permission || "new")) return { allowed: false, reason: `You do not have permission to create ${entity.label}. Please contact administrator.` };
  return { allowed: true };
}

export function assertQuickCreateAllowed(type, role) {
  const result = canQuickCreate(type, role);
  if (!result.allowed) throw new Error(result.reason);
}
