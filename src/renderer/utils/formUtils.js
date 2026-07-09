import { useEffect } from "react";

export function useUnsavedChanges(isDirty) {
  useEffect(() => {
    window.__giiGemHasUnsavedChanges = Boolean(isDirty);
    window.dispatchEvent(new CustomEvent("gii-gem-dirty-state"));
    return () => {
      window.__giiGemHasUnsavedChanges = false;
      window.dispatchEvent(new CustomEvent("gii-gem-dirty-state"));
    };
  }, [isDirty]);
}

function normalizeFormValue(value) {
  if (Array.isArray(value)) return value.map(normalizeFormValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).filter((key) => key !== "_key").sort().map((key) => [key, normalizeFormValue(value[key])]));
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

export function formChanged(current, baseline) {
  return JSON.stringify(normalizeFormValue(current)) !== JSON.stringify(normalizeFormValue(baseline));
}
