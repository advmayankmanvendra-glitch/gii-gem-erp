import { DEFAULT_REPORTING_PROFILE } from "../database/accountMappingRegistry.js";

function requiredCompanyId(value) {
  const companyId = Number(value || 0);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("Company is required for account mapping");
  }
  return companyId;
}

function normalizedDate(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Account mapping date must use YYYY-MM-DD");
  }
  return date;
}

export function createAccountMappingService() {
  function getAccountMappingRegistry(db, filters = {}) {
    const profileCode = String(filters.reporting_profile_code || DEFAULT_REPORTING_PROFILE.code);
    const profileVersion = String(filters.reporting_profile_version || DEFAULT_REPORTING_PROFILE.version);
    return {
      reportingProfile: {
        code: profileCode,
        version: profileVersion
      },
      groups: db.prepare(`
        SELECT
          g.*,
          parent.group_code parent_group_code,
          parent.group_name parent_group_name
        FROM account_groups g
        LEFT JOIN account_groups parent ON parent.id = g.parent_group_id
        WHERE g.status = 'active'
        ORDER BY g.display_order, g.group_code
      `).all(),
      statementMappings: db.prepare(`
        SELECT
          m.*,
          g.group_code,
          g.group_name,
          g.account_type,
          g.normal_balance
        FROM financial_statement_mappings m
        JOIN account_groups g ON g.id = m.account_group_id
        WHERE m.reporting_profile_code = ?
          AND m.reporting_profile_version = ?
          AND m.status = 'active'
        ORDER BY m.statement_code, m.display_order, g.group_code
      `).all(profileCode, profileVersion)
    };
  }

  function getAccountClassifications(db, filters = {}) {
    const companyId = requiredCompanyId(filters.company_id);
    const asOfDate = normalizedDate(filters.as_of_date || "2999-12-31");
    const profileCode = String(filters.reporting_profile_code || DEFAULT_REPORTING_PROFILE.code);
    const profileVersion = String(filters.reporting_profile_version || DEFAULT_REPORTING_PROFILE.version);

    return db.prepare(`
      SELECT
        a.id account_id,
        a.company_id,
        a.account_code,
        a.account_name,
        a.account_type,
        a.normal_balance,
        assignment.id assignment_id,
        assignment.effective_from assignment_effective_from,
        assignment.effective_to assignment_effective_to,
        assignment.provenance mapping_provenance,
        g.id account_group_id,
        g.group_code,
        g.group_name,
        g.parent_group_id,
        parent.group_code parent_group_code,
        parent.group_name parent_group_name,
        m.statement_code,
        m.section_code,
        m.section_name,
        m.subsection_code,
        m.subsection_name,
        m.current_non_current,
        m.presentation_sign,
        m.display_order statement_display_order,
        CASE
          WHEN assignment.id IS NULL THEN 'UNMAPPED'
          WHEN g.id IS NULL OR m.id IS NULL THEN 'MAPPING_INCOMPLETE'
          WHEN a.account_type <> g.account_type THEN 'TYPE_MISMATCH'
          WHEN a.normal_balance <> g.normal_balance THEN 'BALANCE_MISMATCH'
          ELSE 'MAPPED'
        END mapping_status
      FROM accounts a
      LEFT JOIN account_group_assignments assignment
        ON assignment.id = (
          SELECT candidate.id
          FROM account_group_assignments candidate
          WHERE candidate.company_id = a.company_id
            AND candidate.account_id = a.id
            AND candidate.status = 'active'
            AND candidate.effective_from <= @as_of_date
            AND (candidate.effective_to IS NULL OR candidate.effective_to >= @as_of_date)
          ORDER BY candidate.effective_from DESC, candidate.id DESC
          LIMIT 1
        )
      LEFT JOIN account_groups g
        ON g.id = assignment.account_group_id
        AND g.status = 'active'
      LEFT JOIN account_groups parent
        ON parent.id = g.parent_group_id
      LEFT JOIN financial_statement_mappings m
        ON m.id = (
          SELECT candidate.id
          FROM financial_statement_mappings candidate
          WHERE candidate.account_group_id = g.id
            AND candidate.reporting_profile_code = @profile_code
            AND candidate.reporting_profile_version = @profile_version
            AND candidate.status = 'active'
            AND candidate.effective_from <= @as_of_date
            AND (candidate.effective_to IS NULL OR candidate.effective_to >= @as_of_date)
          ORDER BY candidate.effective_from DESC, candidate.id DESC
          LIMIT 1
        )
      WHERE a.company_id = @company_id
        AND COALESCE(a.is_deleted, 0) = 0
      ORDER BY a.account_code, a.id
    `).all({
      company_id: companyId,
      as_of_date: asOfDate,
      profile_code: profileCode,
      profile_version: profileVersion
    });
  }

  function getAccountMappingCoverage(db, filters = {}) {
    const rows = getAccountClassifications(db, filters);
    const counts = rows.reduce((summary, row) => {
      summary.total += 1;
      const key = row.mapping_status;
      summary[key] = (summary[key] || 0) + 1;
      return summary;
    }, {
      total: 0,
      MAPPED: 0,
      UNMAPPED: 0,
      MAPPING_INCOMPLETE: 0,
      TYPE_MISMATCH: 0,
      BALANCE_MISMATCH: 0
    });

    return {
      company_id: requiredCompanyId(filters.company_id),
      as_of_date: normalizedDate(filters.as_of_date || "2999-12-31"),
      reporting_profile_code: String(filters.reporting_profile_code || DEFAULT_REPORTING_PROFILE.code),
      reporting_profile_version: String(filters.reporting_profile_version || DEFAULT_REPORTING_PROFILE.version),
      ...counts,
      certification_ready: counts.total > 0
        && counts.MAPPED === counts.total
        && counts.MAPPING_INCOMPLETE === 0
        && counts.TYPE_MISMATCH === 0
        && counts.BALANCE_MISMATCH === 0
    };
  }

  return {
    getAccountMappingRegistry,
    getAccountClassifications,
    getAccountMappingCoverage
  };
}
