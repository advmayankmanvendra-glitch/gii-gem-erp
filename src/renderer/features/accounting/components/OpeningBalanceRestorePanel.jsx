import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "../../../utils/formatters.js";
import { confirmAction } from "../../../utils/actionUtils.js";

// Brings a company's opening balances back from a backup after a reset (owner's rule,
// 16 Nov 2026 IST). With no backup, openings are entered by hand instead.
function cleanError(err) {
  return String(err?.message || err).replace(/^Error invoking remote method '[^']+':\s*(\w*Error:\s*)?/, "");
}

export function OpeningBalanceRestorePanel({ api, companyId, companyName = "", defaultBackup = "", notify, onRestored }) {
  const [backups, setBackups] = useState([]);
  const [backup, setBackup] = useState(defaultBackup || "");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const requestRef = useRef(0);
  const available = Boolean(api?.previewOpeningBalanceRestore && api?.restoreOpeningBalancesFromBackup);

  useEffect(() => {
    if (!available) return;
    let alive = true;
    Promise.resolve(api.listBackups?.()).then((list) => {
      if (!alive) return;
      const names = Array.isArray(list) ? list.map((row) => (typeof row === "string" ? row : row?.fileName || row?.name)).filter(Boolean) : [];
      setBackups(names);
      setBackup((current) => current || defaultBackup || names.find((name) => name.startsWith("pre_reset_")) || names[0] || "");
    }).catch(() => { /* the list is optional; the default backup still works */ });
    return () => { alive = false; };
  }, [api, available, defaultBackup]);

  // A new choice cancels any check or restore still running for the old one.
  useEffect(() => { setPreview(null); setError(""); setDone(null); setBusy(false); requestRef.current += 1; }, [backup, companyId]);

  if (!available) return null;

  async function runPreview() {
    if (!companyId || !backup) return;
    const ticket = ++requestRef.current;
    setBusy(true); setError(""); setDone(null);
    try {
      const result = await api.previewOpeningBalanceRestore({ company_id: companyId, backup });
      if (ticket === requestRef.current) setPreview(result);
    } catch (err) {
      if (ticket === requestRef.current) { setPreview(null); setError(cleanError(err)); }
    } finally {
      if (ticket === requestRef.current) setBusy(false);
    }
  }

  async function runRestore() {
    if (!preview?.canRestore || preview.company?.id !== companyId || preview.backup !== backup) return;
    const checked = preview;
    const confirmed = await confirmAction({
      mode: "warning",
      title: "Restore Opening Balances",
      message: `Post ${checked.ready} opening balance(s) for ${checked.company?.name} from ${checked.backup}? Debit ${formatCurrency(checked.totals.debit)}, credit ${formatCurrency(checked.totals.credit)}. Each one becomes a new posted opening voucher (the totals are the opening side; each voucher balances against Capital or Opening Balance Suspense). Opening vouchers cannot be reversed: to undo, restore the safety backup that is taken first, from Backup & Restore.`,
      confirmLabel: "Yes, Restore",
      cancelLabel: "No, Cancel",
      moduleName: "opening_balances"
    });
    if (!confirmed?.confirmed) return;
    const ticket = ++requestRef.current;
    setBusy(true); setError("");
    try {
      const result = await api.restoreOpeningBalancesFromBackup({
        company_id: companyId,
        backup,
        expected: { fingerprint: checked.fingerprint, ready: checked.ready, totals: checked.totals }
      });
      // A finished restore is always reported, even if the screen moved on meanwhile.
      notify?.(`${result.restored} opening balance(s) restored for ${checked.company?.name} from ${result.backup}`);
      onRestored?.(result);
      if (ticket !== requestRef.current) return;
      setDone(result);
      setPreview(null);
    } catch (err) {
      if (ticket === requestRef.current) setError(cleanError(err));
    } finally {
      if (ticket === requestRef.current) setBusy(false);
    }
  }

  const options = backups.includes(backup) || !backup ? backups : [backup, ...backups];

  return (
    <div className="opening-restore-panel" style={{ marginTop: 12 }}>
      <h4>Bring back opening balances</h4>
      <p className="muted">
        A reset clears opening balances. If you have a backup from before the reset, restore them from it here.
        Each one is posted again as a new opening voucher; nothing else in the books changes. This differs from
        Rollback from Backup, which puts the whole database (every company) back as it was and needs a restart. With no backup, enter them by hand: Add Opening on the Opening Balances screen, or Party Opening Balances for parties.
      </p>
      {!companyId ? <p className="muted">Select a company first.</p> : (
        <>
          <label className="field" style={{ display: "block", maxWidth: "100%" }}>
            <span>Backup</span>
            <select value={backup} onChange={(event) => setBackup(event.target.value)} disabled={busy} style={{ maxWidth: "100%" }}>
              {!backup && <option value="">Choose a backup</option>}
              {options.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="secondary-btn" onClick={runPreview} disabled={busy || !backup}>
              {busy && !preview ? "Checking..." : "Check backup"}
            </button>
            {preview && (
              <button type="button" className="primary-btn" onClick={runRestore} disabled={busy || !preview.canRestore} data-action-key="opening_balances.restore_from_backup">
                {busy ? "Restoring..." : `Restore ${preview.ready} opening balance(s)`}
              </button>
            )}
          </div>
        </>
      )}
      {error && <p className="reset-error" style={{ marginTop: 8 }}>{error}</p>}
      {preview && (
        <div style={{ marginTop: 8 }}>
          <p>
            {companyName || preview.company?.name}: {preview.ready} ready, {preview.skipped} skipped.
            Debit {formatCurrency(preview.totals.debit)}, credit {formatCurrency(preview.totals.credit)}.
          </p>
          {!preview.canRestore && preview.blockers.length > 0 && <p className="muted">Nothing can be restored until these are fixed:</p>}
          {preview.blockers.length > 0 && (
            <ul className="reset-error" style={{ paddingLeft: 20 }}>
              {preview.blockers.map((text, index) => <li key={index}>{text}</li>)}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <div className="table-scroll" style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Account</th><th>Year</th><th>Debit</th><th>Credit</th><th>Status</th></tr></thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.sourceId}>
                      <td>{row.accountName || "-"}{row.kind === "party" ? ` (${row.partyName || `${row.partyType} #${row.partyId}`})` : ""}</td>
                      <td>{row.financialYear || "-"}</td>
                      <td>{formatCurrency(row.debit)}</td>
                      <td>{formatCurrency(row.credit)}</td>
                      <td>{row.problem || "ready"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.rows.length === 0 && <p className="muted">The backup has no opening balances for this company.</p>}
        </div>
      )}
      {done && (
        <p className="reset-success" style={{ marginTop: 8 }}>
          Restored {done.restored} opening balance(s){done.skipped ? `, skipped ${done.skipped}` : ""}. A safety backup was taken first: {done.safetyBackup}.
        </p>
      )}
    </div>
  );
}
