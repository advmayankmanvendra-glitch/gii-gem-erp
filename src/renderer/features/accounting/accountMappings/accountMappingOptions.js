const ACCOUNT_MAPPING_ROLES = new Set([
  "super_admin",
  "admin",
  "accountant"
]);

function normalizedRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("-", "_");
}

export function canManageAccountMappings(role) {
  return ACCOUNT_MAPPING_ROLES.has(normalizedRole(role));
}

export function defaultNormalBalance(accountType) {
  return ["Liability", "Equity", "Income"].includes(accountType)
    ? "Credit"
    : "Debit";
}

export function governedPostingGroups(
  registry,
  accountType,
  normalBalance,
  effectiveDate
) {
  const date = String(effectiveDate || "").trim();
  const mappedGroupIds = new Set(
    (registry?.statementMappings || [])
      .filter((mapping) => (
        (!date || String(mapping.effective_from || "") <= date)
        && (!date || !mapping.effective_to || String(mapping.effective_to) >= date)
      ))
      .map((mapping) => Number(mapping.account_group_id))
  );

  return (registry?.groups || [])
    .filter((group) => (
      group.status === "active"
      && Number(group.posting_allowed) === 1
      && group.account_type === accountType
      && group.normal_balance === normalBalance
      && mappedGroupIds.has(Number(group.id))
    ))
    .sort((left, right) => String(left.group_name || "").localeCompare(
      String(right.group_name || ""),
      undefined,
      { sensitivity: "base", numeric: true }
    ));
}

export function accountGroupOptions(
  registry,
  accountType,
  normalBalance,
  effectiveDate
) {
  const statementByGroup = new Map();
  (registry?.statementMappings || []).forEach((mapping) => {
    const date = String(effectiveDate || "").trim();
    const isEffective = (
      (!date || String(mapping.effective_from || "") <= date)
      && (!date || !mapping.effective_to || String(mapping.effective_to) >= date)
    );
    if (isEffective && !statementByGroup.has(Number(mapping.account_group_id))) {
      statementByGroup.set(Number(mapping.account_group_id), mapping);
    }
  });

  return governedPostingGroups(
    registry,
    accountType,
    normalBalance,
    effectiveDate
  ).map((group) => {
    const mapping = statementByGroup.get(Number(group.id));
    const statement = mapping?.section_name || mapping?.statement_code || "Financial Statement";
    return [String(group.id), `${group.group_name} - ${statement}`];
  });
}

