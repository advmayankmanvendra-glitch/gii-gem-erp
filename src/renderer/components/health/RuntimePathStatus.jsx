import React from "react";

function RuntimePathStatus({ pathInfo }) {
  const ok = pathInfo?.exists && pathInfo?.writable !== false;
  return (
    <div className={`runtime-path-row ${ok ? "path-ok" : "path-warn"}`}>
      <div>
        <strong>{pathInfo?.label || pathInfo?.key || "Path"}</strong>
        <p>{pathInfo?.path || "Not available"}</p>
      </div>
      <span className={`status-badge ${ok ? "status-pass" : "status-warn"}`}>
        {ok ? "Ready" : "Review"}
      </span>
    </div>
  );
}

export { RuntimePathStatus };
