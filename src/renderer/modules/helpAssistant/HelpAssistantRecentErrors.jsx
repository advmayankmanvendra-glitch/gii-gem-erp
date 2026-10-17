import React, { useEffect, useState } from "react";

// Tells the user, in plain words, about the errors they hit most recently: what
// failed, where to fix it and the next step. Read-only; reads the Error Console.
function HelpAssistantRecentErrors({ companyContext, onNavigate }) {
  const [errors, setErrors] = useState([]);
  const [stuck, setStuck] = useState(0);

  useEffect(() => {
    let active = true;
    const api = window.giiGemErp;
    if (typeof api?.getErrorConsole !== "function") return undefined;
    api.getErrorConsole({ company_id: companyContext?.company_id })
      .then((state) => {
        if (!active) return;
        setErrors((state?.errors || []).slice(0, 3));
        setStuck((state?.stuckPostings || []).length);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [companyContext?.company_id]);

  if (!errors.length && !stuck) return null;
  return (
    <section className="panel help-assistant-results">
      <h2>What went wrong recently</h2>
      {stuck ? <p>{stuck} document{stuck === 1 ? "" : "s"} failed to post and {stuck === 1 ? "is" : "are"} not in the books yet.</p> : null}
      {errors.map((row) => (
        <article className="help-assistant-result-card" key={row.id}>
          <div style={{ display: "grid", gap: 4 }}>
            <span>{row.area}</span>
            <strong>{row.message}</strong>
            <small>Where to fix: {row.screen}</small>
            <small>Next step: {row.nextAction}</small>
          </div>
        </article>
      ))}
      <button type="button" className="ghost-btn small-btn" onClick={() => onNavigate?.("health_center")}>Open Error Console</button>
    </section>
  );
}

export { HelpAssistantRecentErrors };
