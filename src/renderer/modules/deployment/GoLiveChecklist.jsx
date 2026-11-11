import React from "react";

const DEFAULT_ITEMS = [
  { key: "companies", label: "Companies Configured" },
  { key: "financialYear", label: "Financial Year Open" },
  { key: "chartOfAccounts", label: "Chart of Accounts Complete" },
  { key: "masters", label: "Masters Complete" },
  { key: "verification", label: "Verification Passed" },
  { key: "backup", label: "Backup Available" },
  { key: "deploymentProfile", label: "Deployment Profile Correct" },
  { key: "trialBalance", label: "Trial Balance Balanced" },
  { key: "inventory", label: "Inventory Balanced" },
  { key: "gst", label: "GST Balanced" },
  { key: "healthCenter", label: "Health Center Passed" }
];

function GoLiveChecklist({ readiness }) {
  if (!readiness) {
    return <p className="muted">Run readiness assessment to populate checklist.</p>;
  }

  const items = DEFAULT_ITEMS.map(item => {
    let passed = false;
    if (item.key === "companies") passed = readiness.categories?.foundation?.checks?.find(c => c.key === "companies")?.passed || false;
    else if (item.key === "financialYear") passed = readiness.categories?.foundation?.checks?.find(c => c.key === "financialYears")?.passed || false;
    else if (item.key === "chartOfAccounts") passed = readiness.categories?.foundation?.checks?.find(c => c.key === "chartOfAccounts")?.passed || false;
    else if (item.key === "masters") {
      const cat = readiness.categories?.foundation?.checks || [];
      passed = cat.filter(c => ["banks", "warehouses", "items", "suppliers", "departments", "employees"].includes(c.key)).every(c => c.passed);
    } else if (item.key === "verification") passed = readiness.categories?.accounting?.score?.score >= 80;
    else if (item.key === "backup") passed = readiness.categories?.deployment?.checks?.find(c => c.key === "backupAvailable")?.passed || false;
    else if (item.key === "deploymentProfile") passed = readiness.categories?.deployment?.checks?.find(c => c.key === "environmentConfigured")?.passed || false;
    else if (item.key === "trialBalance") passed = readiness.categories?.accounting?.checks?.find(c => c.key === "trialBalance")?.passed || false;
    else if (item.key === "inventory") passed = readiness.categories?.inventory?.score?.score >= 80;
    else if (item.key === "gst") passed = readiness.categories?.gst?.score?.score >= 80;
    else if (item.key === "healthCenter") passed = readiness.categories?.technical?.score?.score >= 80;
    return { ...item, passed };
  });

  const passedCount = items.filter(i => i.passed).length;

  return (
    <section className="panel" style={{ padding: "var(--spacing-md)" }}>
      <h3 style={{ margin: "0 0 var(--spacing-sm)", fontSize: "1rem" }}>Go-Live Checklist</h3>
      <p className="muted" style={{ marginBottom: 8 }}>{passedCount} of {items.length} items passed</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 6 }}>
        {items.map(item => (
          <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid var(--color-line)" }}>
            <span style={{ color: item.passed ? "#155724" : "#721c24", fontWeight: 700 }}>{item.passed ? "✓" : "✗"}</span>
            <span style={{ fontSize: "0.85rem" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export { GoLiveChecklist, DEFAULT_ITEMS };