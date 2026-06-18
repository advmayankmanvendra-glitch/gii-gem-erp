export function cleanRendererErrorMessage(error) {
  return String(error?.message || error || "Renderer action could not be completed.")
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/i, "")
    .replace(/^Unhandled error:\s*/i, "")
    .replace(/^SqliteError:\s*/i, "Database error: ")
    .trim();
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function safeFunction(value) {
  return typeof value === "function" ? value : () => {};
}

export function rendererErrorSummary(error, info = {}) {
  return {
    message: cleanRendererErrorMessage(error),
    stack: String(error?.stack || "").slice(0, 4000),
    componentStack: String(info?.componentStack || "").slice(0, 4000)
  };
}
