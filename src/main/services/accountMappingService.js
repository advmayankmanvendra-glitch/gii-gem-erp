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
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Account mapping date must use YYYY-MM-DD");
  }
  return date;
}

function requiredId(value, label) {
  const id = Number(value || 0);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} is required for account mapping`);
  }
  return id;
}

function requiredReason(value) {
  const reason = String(value || "").trim();
  if (!reason) {
    throw new Error("Change reason is required for account mapping");
  }
  if (reason.length > 500) {
    throw new Error("Change reason must be 500 characters or fewer");
  }
  return reason;
}

function previousDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function createAccountMappingService(deps = {}) {
  const { auditLog } = deps;

  function assignmentSnapshot(db, assignmentId) {
    return db.prepare(`
      SELECT
        assignment.*,
        account.account_code,
        account.account_name,
        group_row.group_code,
        group_row.group_name
      FROM account_group_assignments assignment
      JOIN accounts account ON account.id = assignment.account_id
      JOIN account_groups group_row ON group_row.id = assignment.account_group_id
      WHERE assignment.id = ?
    `).get(assignmentId);
  }

  function writeAssignmentAudit(db, payload) {
    if (typeof auditLog !== "function") {
      throw new Error("Account mapping audit service is unavailable");
    }
    auditLog(db, {
      company_id: payload.company_id,
      user_id: payload.user_id,
      user_role: payload.user_role,
      action: payload.action,
      module: "account_mapping",
      table_name: "account_group_assignments",
      record_id: payload.record_id,
      old_value: payload.old_value ? JSON.stringify(payload.old_value) : null,
      new_value: JSON.stringify(payload.new_value)
    });
  }

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

  function getAccountMappingReviewQueue(db, filters = {}) {
    return getAccountClassifications(db, filters).filter(
      (row) => row.mapping_status !== "MAPPED"
    );
  }

  function assignAccountGroup(db, payload = {}, actor = {}) {
    const companyId = requiredCompanyId(payload.company_id);
    const accountId = requiredId(payload.account_id, "Account");
    const accountGroupId = requiredId(payload.account_group_id, "Account group");
    const effectiveFrom = normalizedDate(payload.effective_from);
    const changeReason = requiredReason(payload.change_reason);
    const userId = requiredId(actor.user_id, "Authenticated user");
    const userRole = String(actor.user_role || "").trim();

    const execute = db.transaction(() => {
      const account = db.prepare(`
        SELECT id, company_id, account_code, account_name, account_type,
          normal_balance, status, COALESCE(is_deleted, 0) is_deleted
        FROM accounts
        WHERE id = ?
      `).get(accountId);
      if (!account || account.status !== "active" || Number(account.is_deleted) === 1) {
        throw new Error("Select an active account before assigning its account group");
      }
      if (Number(account.company_id) !== companyId) {
        throw new Error("The selected account does not belong to the current company");
      }

      const group = db.prepare(`
        SELECT id, group_code, group_name, account_type, normal_balance,
          posting_allowed, status
        FROM account_groups
        WHERE id = ?
      `).get(accountGroupId);
      if (!group || group.status !== "active") {
        throw new Error("Select an active account group");
      }
      if (Number(group.posting_allowed) !== 1) {
        throw new Error("Select a posting account group, not a statement heading");
      }
      if (account.account_type !== group.account_type) {
        throw new Error(
          `Account type ${account.account_type} is incompatible with ${group.group_name}`
        );
      }
      if (account.normal_balance !== group.normal_balance) {
        throw new Error(
          `Account normal balance ${account.normal_balance} is incompatible with ${group.group_name}`
        );
      }
      const statementMapping = db.prepare(`
        SELECT id
        FROM financial_statement_mappings
        WHERE account_group_id = ?
          AND reporting_profile_code = ?
          AND reporting_profile_version = ?
          AND status = 'active'
          AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC, id DESC
        LIMIT 1
      `).get(
        accountGroupId,
        DEFAULT_REPORTING_PROFILE.code,
        DEFAULT_REPORTING_PROFILE.version,
        effectiveFrom,
        effectiveFrom
      );
      if (!statementMapping) {
        throw new Error(
          "The selected account group has no active governed financial-statement mapping."
        );
      }

      const exactDated = db.prepare(`
        SELECT *
        FROM account_group_assignments
        WHERE account_id = ? AND effective_from = ?
        LIMIT 1
      `).get(accountId, effectiveFrom);

      if (exactDated && exactDated.status !== "active") {
        throw new Error(
          "This date already has a retired mapping. Use a governed historical correction phase."
        );
      }

      if (exactDated) {
        const oldValue = assignmentSnapshot(db, exactDated.id);
        if (Number(exactDated.account_group_id) === accountGroupId) {
          writeAssignmentAudit(db, {
            company_id: companyId,
            user_id: userId,
            user_role: userRole,
            action: "account_mapping_assignment_confirmed",
            record_id: exactDated.id,
            old_value: oldValue,
            new_value: {
              assignment: oldValue,
              confirmation_reason: changeReason,
              changed: false
            }
          });
          return {
            changed: false,
            assignment: oldValue,
            message: "The account already has this mapping from the selected date."
          };
        }

        db.prepare(`
          UPDATE account_group_assignments
          SET account_group_id = ?,
              provenance = 'MANUAL',
              assigned_by = ?,
              change_reason = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(accountGroupId, userId, changeReason, exactDated.id);
        const newValue = assignmentSnapshot(db, exactDated.id);
        writeAssignmentAudit(db, {
          company_id: companyId,
          user_id: userId,
          user_role: userRole,
          action: "account_mapping_same_date_corrected",
          record_id: exactDated.id,
          old_value: oldValue,
          new_value: newValue
        });
        return {
          changed: true,
          assignment: newValue,
          message: "The dated account mapping was corrected."
        };
      }

      const laterAssignment = db.prepare(`
        SELECT *
        FROM account_group_assignments
        WHERE account_id = ?
          AND status = 'active'
          AND effective_from > ?
        ORDER BY effective_from, id
        LIMIT 1
      `).get(accountId, effectiveFrom);
      if (laterAssignment) {
        throw new Error(
          "A later account mapping already exists. Use a governed historical correction phase."
        );
      }

      const effectiveAssignment = db.prepare(`
        SELECT *
        FROM account_group_assignments
        WHERE account_id = ?
          AND status = 'active'
          AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC, id DESC
        LIMIT 1
      `).get(accountId, effectiveFrom, effectiveFrom);

      if (
        effectiveAssignment
        && Number(effectiveAssignment.account_group_id) === accountGroupId
      ) {
        const existingValue = assignmentSnapshot(db, effectiveAssignment.id);
        writeAssignmentAudit(db, {
          company_id: companyId,
          user_id: userId,
          user_role: userRole,
          action: "account_mapping_assignment_confirmed",
          record_id: effectiveAssignment.id,
          old_value: existingValue,
          new_value: {
            assignment: existingValue,
            confirmation_reason: changeReason,
            changed: false
          }
        });
        return {
          changed: false,
          assignment: existingValue,
          message: "The account already has this mapping on the selected date."
        };
      }

      let previousValue = null;
      let closedPreviousValue = null;
      if (effectiveAssignment) {
        previousValue = assignmentSnapshot(db, effectiveAssignment.id);
        db.prepare(`
          UPDATE account_group_assignments
          SET effective_to = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(previousDate(effectiveFrom), effectiveAssignment.id);
        closedPreviousValue = assignmentSnapshot(db, effectiveAssignment.id);
      }

      const insertResult = db.prepare(`
        INSERT INTO account_group_assignments (
          company_id, account_id, account_group_id, effective_from,
          effective_to, status, provenance, assigned_by, change_reason
        ) VALUES (?, ?, ?, ?, NULL, 'active', 'MANUAL', ?, ?)
      `).run(
        companyId,
        accountId,
        accountGroupId,
        effectiveFrom,
        userId,
        changeReason
      );
      const assignmentId = Number(insertResult.lastInsertRowid);
      const newValue = assignmentSnapshot(db, assignmentId);
      writeAssignmentAudit(db, {
        company_id: companyId,
        user_id: userId,
        user_role: userRole,
        action: previousValue
          ? "account_mapping_assignment_changed"
          : "account_mapping_assignment_created",
        record_id: assignmentId,
        old_value: previousValue,
        new_value: previousValue
          ? {
            closed_assignment: closedPreviousValue,
            new_assignment: newValue
          }
          : newValue
      });
      return {
        changed: true,
        assignment: newValue,
        message: previousValue
          ? "The account mapping was changed with its history preserved."
          : "The account mapping was assigned."
      };
    });

    return execute();
  }

  return {
    getAccountMappingRegistry,
    getAccountClassifications,
    getAccountMappingCoverage,
    getAccountMappingReviewQueue,
    assignAccountGroup
  };
}
