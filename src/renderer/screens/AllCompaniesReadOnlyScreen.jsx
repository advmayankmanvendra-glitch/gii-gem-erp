import React from "react";

export function AllCompaniesReadOnlyScreen({ companies = [], onSwitchCompany }) {
  return (
    <section className="panel all-company-readonly">
      <div>
        <span className="status-pill warning">Read-only group view</span>
        <h2>All Companies View</h2>
        <p>Operational, accounting, inventory and import screens require one selected company so transactions cannot be saved or posted into the wrong books.</p>
      </div>
      <div className="template-meta-grid">
        <div><strong>Companies Available</strong><p>{companies.length}</p></div>
        <div><strong>Allowed Here</strong><p>Dashboard, Company Master, Settings and Help</p></div>
        <div><strong>Blocked Here</strong><p>Transactions, vouchers, imports and company-specific reports</p></div>
      </div>
      <div className="button-row">
        <button type="button" className="primary-btn" onClick={onSwitchCompany} disabled={!companies.length}>Switch To Single Company</button>
      </div>
    </section>
  );
}
