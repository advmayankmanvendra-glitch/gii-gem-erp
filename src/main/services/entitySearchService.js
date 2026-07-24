const ENTITY_CONFIG = {
  supplier: {
    table: "suppliers",
    searchFields: ["supplier_name", "supplier_code", "gstin", "supplier_contact", "contact_person"],
    displayFields: ["supplier_name", "gstin", "supplier_code"],
    rankField: "supplier_name",
    filterStatus: true,
    companyScoped: false
  },
  item: {
    table: "items",
    searchFields: ["item_name", "brand", "model", "hsn_code", "category"],
    displayFields: ["item_name", "hsn_code", "brand", "model", "unit"],
    rankField: "item_name",
    filterStatus: true,
    companyScoped: false
  },
  ledger: {
    table: "accounts",
    searchFields: ["account_name", "account_code"],
    displayFields: ["account_name", "account_code"],
    rankField: "account_name",
    filterStatus: false,
    companyScoped: true
  },
  supply_order: {
    table: "supply_orders",
    searchFields: ["order_number"],
    displayFields: ["order_number", "order_date", "order_status"],
    rankField: "order_number",
    filterStatus: false,
    companyScoped: false,
    joins: [
      "LEFT JOIN government_departments ON supply_orders.department_id = government_departments.id"
    ],
    extraColumns: ["government_departments.department_name"],
    whereClause: "supply_orders.order_status NOT IN ('Cancelled', 'Closed') AND COALESCE(supply_orders.is_deleted, 0) = 0"
  },
  department: {
    table: "government_departments",
    searchFields: ["department_name", "contact_person", "contact_number"],
    displayFields: ["department_name", "contact_person"],
    rankField: "department_name",
    filterStatus: true,
    companyScoped: false
  },
  warehouse: {
    table: "warehouses",
    searchFields: ["warehouse_name", "location"],
    displayFields: ["warehouse_name", "location"],
    rankField: "warehouse_name",
    filterStatus: true,
    companyScoped: true
  },
  employee: {
    table: "employees",
    searchFields: ["employee_name", "designation", "mobile_number"],
    displayFields: ["employee_name", "designation"],
    rankField: "employee_name",
    filterStatus: true,
    companyScoped: false
  },
  bank: {
    table: "banks",
    searchFields: ["bank_account_name", "account_number", "bank_name"],
    displayFields: ["bank_account_name", "account_number", "bank_name"],
    rankField: "bank_account_name",
    filterStatus: true,
    companyScoped: true
  },
  expense_head: {
    table: "expense_heads",
    searchFields: ["expense_head_name", "category"],
    displayFields: ["expense_head_name", "category"],
    rankField: "expense_head_name",
    filterStatus: true,
    companyScoped: false
  }
};

function buildSearchQuery(config, searchTerm, limit, offset, companyId) {
  const term = String(searchTerm || "").trim().toLowerCase();
  const table = config.table;
  const searchFields = config.searchFields;
  const selectColumns = [...config.displayFields];
  if (config.extraColumns) selectColumns.push(...config.extraColumns);

  let whereClauses = [];
  let params = {};

  if (term) {
    const fieldSearches = searchFields.map((field) => {
      const qualified = field.includes(".") ? field : `${table}.${field}`;
      return `LOWER(COALESCE(CAST(${qualified} AS TEXT), '')) LIKE @search`;
    });
    whereClauses.push(`(${fieldSearches.join(" OR ")})`);
    params.search = `%${term}%`;

    const rankCases = searchFields.map((field) => {
      const qualified = field.includes(".") ? field : `${table}.${field}`;
      return [
        `WHEN LOWER(COALESCE(CAST(${qualified} AS TEXT), '')) = @exact_term THEN 0`,
        `WHEN LOWER(COALESCE(CAST(${qualified} AS TEXT), '')) LIKE @prefix_term THEN 1`
      ].join(" ");
    }).join(" ");
    params.exact_term = term;
    params.prefix_term = `${term}%`;
    selectColumns.push(`(CASE ${rankCases} ELSE 3 END) AS rank`);
  } else {
    selectColumns.push("0 AS rank");
  }

  if (config.filterStatus) {
    whereClauses.push(`${table}.status = 'active'`);
  }

  if (config.companyScoped && companyId) {
    whereClauses.push(`${table}.company_id = @company_id`);
    params.company_id = companyId;
  }

  if (config.whereClause) {
    whereClauses.push(`(${config.whereClause})`);
  }

  whereClauses.push(`COALESCE(${table}.is_deleted, 0) = 0`);

  const joins = config.joins ? config.joins.join(" ") : "";
  const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
  const rankOrder = config.rankField ? `rank, LOWER(COALESCE(CAST(${table}.${config.rankField} AS TEXT), ''))` : "rank";
  const countParams = { ...params };
  delete countParams.exact_term;
  delete countParams.prefix_term;

  return {
    query: `SELECT ${table}.id, ${selectColumns.join(", ")} FROM ${table} ${joins} ${where} ORDER BY ${rankOrder} LIMIT @limit OFFSET @offset`,
    countQuery: `SELECT COUNT(*) as total FROM ${table} ${joins} ${where}`,
    params: { ...params, limit, offset },
    countParams
  };
}

export function searchEntities(db, entityType, searchTerm, options = {}) {
  const config = ENTITY_CONFIG[entityType];
  if (!config) throw new Error(`Unknown entity type: ${entityType}`);

  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const companyId = Number(options.company_id) || 0;

  const { query, countQuery, params, countParams } = buildSearchQuery(config, searchTerm, limit, offset, companyId);

  const results = db.prepare(query).all(params);
  const { total } = db.prepare(countQuery).get(countParams);
  const hasMore = offset + limit < total;

  return { results, hasMore, total, limit, offset };
}

export function getEntitySearchConfig(entityType) {
  return ENTITY_CONFIG[entityType] || null;
}

export const SUPPORTED_ENTITY_TYPES = Object.keys(ENTITY_CONFIG);
