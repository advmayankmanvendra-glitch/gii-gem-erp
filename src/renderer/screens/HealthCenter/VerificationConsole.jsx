import React, { useEffect, useState } from "react";
import { verificationCommands } from "./healthCenterConfig.js";
import { VerificationCommandCard } from "./VerificationCommandCard.jsx";
import { VerificationHistoryPanel } from "./VerificationHistoryPanel.jsx";

function VerificationConsole({ apiClient, context, notify }) {
  const [consoleState, setConsoleState] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadConsoleState = async () => {
    if (!apiClient?.getVerificationConsoleState) {
      setConsoleState({
        executionMode: "manual-terminal-only",
        safety: {
          shellExecutionAllowed: false,
          message: "Verification console API is not available in this runtime. Run commands manually from PowerShell."
        },
        commands: verificationCommands.map((item) => ({ ...item, result: "manual", lastKnown: "" })),
        history: []
      });
      return;
    }
    try {
      const result = await apiClient.getVerificationConsoleState();
      setConsoleState(result);
    } catch (error) {
      notify?.(error.message || "Verification console could not load", "error");
    }
  };

  const recordSnapshot = async () => {
    if (!apiClient?.recordVerificationSnapshot) {
      notify?.("Health snapshot storage requires the Windows desktop app.", "warning");
      return;
    }
    setBusy(true);
    try {
      const result = await apiClient.recordVerificationSnapshot(context);
      setConsoleState(result);
      notify?.("Health verification snapshot recorded", "success");
    } catch (error) {
      notify?.(error.message || "Health snapshot could not be recorded", "error");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadConsoleState();
  }, []);

  const commands = consoleState?.commands?.length ? consoleState.commands : verificationCommands.map((item) => ({ ...item, result: "manual" }));

  return (
    <section className="panel health-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">manual verification</p>
          <h2>Verification Console</h2>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-btn" onClick={loadConsoleState}>Refresh</button>
          <button type="button" className="primary-btn" onClick={recordSnapshot} disabled={busy}>{busy ? "Recording..." : "Record Health Snapshot"}</button>
        </div>
      </div>
      <p className="muted">
        {consoleState?.safety?.message || "These commands remain terminal-controlled. The Health Center shows the checklist but does not execute shell commands from the UI."}
      </p>
      <div className="verification-console-layout">
        <div className="verification-grid">
          {commands.map((item) => <VerificationCommandCard key={item.command} command={item} notify={notify} />)}
        </div>
        <VerificationHistoryPanel history={consoleState?.history || []} />
      </div>
    </section>
  );
}

export { VerificationConsole };
