import React, { useEffect, useRef, useState } from "react";

const amount = (value) => Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Money integrity: shows whether the books balance to the paisa, lists older vouchers
// that are off by paise, and posts a clearly labelled rounding adjustment for one.
// The older voucher itself is never changed.
function MoneyIntegrityPanel({ apiClient, context, notify }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(null);
  // Only the newest request may set the report, so a slow answer for the company shown
  // before cannot replace the current one.
  const requestRef = useRef(0);

  const load = async () => {
    if (typeof apiClient?.getMoneyIntegrity !== "function") return;
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const result = await apiClient.getMoneyIntegrity({ company_id: context?.company_id });
      if (request === requestRef.current) setReport(result);
    } catch (error) {
      if (request === requestRef.current) setReport(null);
      notify?.(`Money integrity check could not run: ${error.message}. Refresh the Health Center; if it repeats, export a support bundle.`, "error");
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => { setReport(null); load(); }, [context?.company_id]);

  const adjust = async (row) => {
    const confirmed = window.confirm(`Post a rounding adjustment of ${amount(Math.abs(row.difference))} for ${row.voucher_number}? It is a separate journal to the Rounding Off account, dated ${row.voucher_date}. ${row.voucher_number} itself stays as it is.`);
    if (!confirmed) return;
    setPosting(row.id);
    try {
      const voucher = await apiClient.postRoundingAdjustment({ company_id: context?.company_id, voucher_id: row.id });
      notify?.(`Rounding adjustment ${voucher?.voucher_number || ""} posted for ${row.voucher_number}.`);
      load();
    } catch (error) {
      notify?.(error.message, "error");
    } finally {
      setPosting(null);
    }
  };

  if (typeof apiClient?.getMoneyIntegrity !== "function") return null;
  const tb = report?.trial_balance;
  const vouchers = report?.unbalanced_vouchers || [];
  const mismatches = report?.line_ledger_mismatches || [];
  const mirrors = report?.mirror_mismatches || [];
  const guards = report?.missing_guards || [];
  const maintenance = report?.open_maintenance || [];
  const unexpectedTriggers = report?.unexpected_triggers || [];
  const draftEntries = report?.draft_entries || [];
  const startupFailure = report?.last_startup_check_failure || null;
  const subPaisa = report?.sub_paisa_legacy || [];
  // All Companies View is read-only: an adjustment is posted only with one company selected.
  const canAdjust = Boolean(context?.company_id) && context?.company_scope !== "all";

  const heading = (
    <div className="section-heading">
      <div>
        <p className="eyebrow">every amount to the paisa</p>
        <h2>Money integrity</h2>
      </div>
      <button type="button" className="secondary-btn" onClick={load} disabled={loading}>{loading ? "Checking..." : "Re-check"}</button>
    </div>
  );

  // Until a check has come back, show nothing that could read as "all clear".
  if (!report) {
    return (
      <section className="panel health-section">
        {heading}
        <p>{loading ? "Checking every voucher..." : "Not checked yet. Press Re-check to run the check."}</p>
      </section>
    );
  }

  return (
    <section className="panel health-section">
      {heading}

      <p><strong>{report.ok ? "Books balance to the paisa." : "Something needs attention below."}</strong></p>

      {tb ? <p>Trial balance: debit {amount(tb.debit)}, credit {amount(tb.credit)}, difference {amount(tb.difference)}.</p> : null}

      <h3 className="health-section-subtitle">Vouchers that do not balance ({vouchers.length})</h3>
      {vouchers.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Voucher</th><th>Date</th><th>Type</th><th>Debit</th><th>Credit</th><th>Difference</th><th>What to do</th></tr></thead>
            <tbody>
              {vouchers.map((row) => (
                <tr key={row.id}>
                  <td>{row.voucher_number}</td>
                  <td>{row.voucher_date}</td>
                  <td>{row.voucher_type}</td>
                  <td>{amount(row.debit)}</td>
                  <td>{amount(row.credit)}</td>
                  <td>{amount(row.difference)}</td>
                  <td>
                    {row.adjustable && !canAdjust
                      ? "Select this voucher's company to post a rounding adjustment."
                      : row.adjustable
                      ? <button type="button" className="secondary-btn" disabled={posting === row.id} onClick={() => adjust(row)}>{posting === row.id ? "Posting..." : "Post rounding adjustment"}</button>
                      : row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p>Every posted voucher balances to the paisa.</p>}

      {mismatches.length ? (
        <>
          <h3 className="health-section-subtitle">Vouchers whose ledger entries disagree with their lines ({mismatches.length})</h3>
          <p>These need a support check. Export a support bundle and share it.</p>
          <ul>{mismatches.slice(0, 20).map((row) => <li key={row.id}>{row.voucher_number} ({row.voucher_date})</li>)}</ul>
        </>
      ) : null}

      {mirrors.length ? (
        <>
          <h3 className="health-section-subtitle">Older stored amounts that disagree with their paise value</h3>
          <ul>{mirrors.map((row) => <li key={`${row.table}.${row.column}`}>{row.table}.{row.column}: {row.count} row(s)</li>)}</ul>
        </>
      ) : null}

      {subPaisa.length ? (
        <details>
          <summary>Older amounts saved with a fraction of a paisa ({subPaisa.reduce((sum, row) => sum + row.count, 0)})</summary>
          <p>These were saved by an earlier version. The books use the amount rounded to the paisa; the old rows are left as they are.</p>
          <ul>{subPaisa.map((row) => <li key={`${row.table}.${row.column}`}>{row.table}.{row.column}: {row.count} row(s)</li>)}</ul>
        </details>
      ) : null}

      {guards.length ? <p><strong>Database protection is missing ({guards.length} rule(s)). Restart the app to put it back.</strong></p> : null}
      {maintenance.length ? <p><strong>Database protection is switched off by {maintenance.length} open maintenance window(s). Restart the app to close them.</strong></p> : null}
      {unexpectedTriggers.length ? <p><strong>The database holds {unexpectedTriggers.length} trigger(s) on the accounting tables that the app did not create ({unexpectedTriggers.join(", ")}). Restart the app to remove them, then re-check.</strong></p> : null}
      {draftEntries.length ? <p><strong>{draftEntries.length} unposted voucher(s) hold ledger entries ({draftEntries.slice(0, 5).map((row) => row.voucher_number).join(", ")}). Post or delete them; until then some reports may count their amounts.</strong></p> : null}
      {startupFailure ? <p>Last start-up check ({startupFailure.created_at}) found more unbalanced posted vouchers after the upgrade than before it. The list above shows the vouchers to correct.</p> : null}
    </section>
  );
}

export { MoneyIntegrityPanel };
