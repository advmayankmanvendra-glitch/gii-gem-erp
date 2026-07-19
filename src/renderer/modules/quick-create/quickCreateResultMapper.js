import { getQuickCreateEntity } from "./quickCreateRegistry.js";

export function mapQuickCreateResult(type, saved) {
  const entity = getQuickCreateEntity(type);
  if (entity?.resultMapper) return entity.resultMapper(saved);
  return { id: saved?.id, label: saved?.id };
}
