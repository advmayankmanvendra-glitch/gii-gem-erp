import React from "react";

function VerificationResultBox({ title, command, result, note }) {
  return (
    <article className="verification-box">
      <div>
        <h3>{title}</h3>
        <code>{command}</code>
      </div>
      <span className={`status-badge status-${result || "info"}`}>{result || "Manual"}</span>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

export { VerificationResultBox };
