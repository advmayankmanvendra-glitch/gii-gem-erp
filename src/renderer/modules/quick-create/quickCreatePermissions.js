import { roleAllowsAction } from "../../components/helpProductivity/index.jsx";
import { isQuickCreateEnabled, getQuickCreateDenialReason, getQuickCreateEntity } from "./quickCreateRegistry.js";

function hasQuickCreatePermission(role, permission) {
  if (permission !== "account_mapping") {
    return roleAllowsAction(role, permission || "new");
  }
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
  return ["super_admin", "admin", "accountant"].includes(normalized);
}

export function canQuickCreate(type, role) {
  const entity = getQuickCreateEntity(type);
  if (!entity) return { allowed: false, reason: `Unknown quick create type: ${type}` };
  if (!entity.enabled) return { allowed: false, reason: entity.denialReason || `${entity.label} quick creation is not enabled.` };
  if (!hasQuickCreatePermission(role, entity.permission)) return { allowed: false, reason: `You do not have permission to create ${entity.label}. Please contact administrator.` };
  return { allowed: true };
}

export function assertQuickCreateAllowed(type, role) {
  const result = canQuickCreate(type, role);
  if (!result.allowed) throw new Error(result.reason);
}
