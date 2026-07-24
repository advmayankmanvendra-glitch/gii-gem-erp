#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { searchEntities } from "../src/main/services/entitySearchService.js";

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) { passed += 1; console.log(`PASS: ${label}`); }
  else { failed += 1; console.log(`FAIL: ${label}`); }
}

// --- 1. Backend entity search service ---
const searchService = readFileSync("src/main/services/entitySearchService.js", "utf8");
check("entitySearchService exports SUPPORTED_ENTITY_TYPES", searchService.includes("SUPPORTED_ENTITY_TYPES = Object.keys(ENTITY_CONFIG)"));
const backendTypes = searchService.match(/^\s+(\w+):\s*\{/gm)?.map((l) => l.trim().replace(":", "").replace("{", "").trim()) || [];
check("entitySearchService has >= 8 entity types", backendTypes.length >= 8);

const EXPECTED_BACKEND_TYPES = ["supplier", "item", "ledger", "supply_order", "department", "warehouse", "employee", "bank", "expense_head"];
for (const et of EXPECTED_BACKEND_TYPES) {
  check(`entitySearchService supports "${et}"`, searchService.includes(`  ${et}: {`));
}

const entitySearchDb = new DatabaseSync(":memory:");
try {
  entitySearchDb.exec(`
    CREATE TABLE suppliers (
      id INTEGER PRIMARY KEY,
      supplier_name TEXT,
      supplier_code TEXT,
      gstin TEXT,
      supplier_contact TEXT,
      contact_person TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      is_deleted INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO suppliers (id, supplier_name, supplier_code, gstin, supplier_contact, contact_person)
    VALUES
      (1, 'Alpha', 'SUP-001', 'GST-ALPHA', '9000000001', 'A Person'),
      (2, 'Alpha Industrial', 'SUP-002', 'GST-BETA', '9000000002', 'B Person');
  `);
  const populatedSearch = searchEntities(entitySearchDb, "supplier", "alpha", { limit: 50, offset: 0 });
  check("entity search executes a populated multi-field supplier query", populatedSearch.results.length === 2);
  check("entity search ranks an exact supplier-name match first", populatedSearch.results[0]?.supplier_name === "Alpha");
} catch (error) {
  console.log(`  INFO: populated entity search failed: ${error.message}`);
  check("entity search executes a populated multi-field supplier query", false);
  check("entity search ranks an exact supplier-name match first", false);
} finally {
  entitySearchDb.close();
}

// --- 2. EntityPickerRegistry ---
const registry = readFileSync("src/renderer/components/entityPicker/EntityPickerRegistry.js", "utf8");
check("EntityPickerRegistry has SUPPORTED_PICKER_TYPES export", registry.includes("SUPPORTED_PICKER_TYPES = Object.keys(ENTITY_PICKER_CONFIGS)"));
for (const et of EXPECTED_BACKEND_TYPES) {
  check(`EntityPickerRegistry has config for "${et}"`, registry.includes(`  ${et}: {`));
}

// --- 3. EntityPicker index.js exports ---
const index = readFileSync("src/renderer/components/entityPicker/index.js", "utf8");
check("entityPicker/index exports SmartEntityPicker", index.includes('SmartEntityPicker'));
check("entityPicker/index exports EntityPickerModal", index.includes('EntityPickerModal'));
check("entityPicker/index exports useEntitySearch", index.includes('useEntitySearch'));
check("entityPicker/index exports getEntityPickerConfig", index.includes('getEntityPickerConfig'));

// --- 4. SmartEntityPicker imports registry + permissions ---
const pickerSource = readFileSync("src/renderer/components/entityPicker/SmartEntityPicker.jsx", "utf8");
check("SmartEntityPicker imports EntityPickerRegistry", pickerSource.includes("EntityPickerRegistry.js"));
check("SmartEntityPicker imports useEntitySearch", pickerSource.includes("useEntitySearch"));
check("SmartEntityPicker imports useEntityPickerKeyboard", pickerSource.includes("useEntityPickerKeyboard"));
check("SmartEntityPicker imports canQuickCreate", pickerSource.includes("quickCreatePermissions"));
check("SmartEntityPicker handles entityType prop", pickerSource.includes("entityType"));
check("SmartEntityPicker keeps selection state per component", pickerSource.includes("const storeRef = useRef(null)") && !pickerSource.includes("const storeRef = { current: null }"));
check("SmartEntityPicker resolves remembered Quick Create labels", pickerSource.includes("getRememberedEntityPickerRecord(entityType, value)"));

const selectionStoreSource = readFileSync("src/renderer/components/entityPicker/EntityPickerSelectionStore.js", "utf8");
check("entity picker selection store keys records by entity type and id", selectionStoreSource.includes("selectionKey(entityType, id)") && selectionStoreSource.includes("selectionRecords.set"));

const quickCreateDialogSource = readFileSync("src/renderer/components/overlays/QuickCreateMasterDialog.jsx", "utf8");
check("Quick Create remembers saved records for picker labels", quickCreateDialogSource.includes("rememberEntityPickerRecord(request.type, saved)"));
check("Quick Create remembers reused duplicate records for picker labels", quickCreateDialogSource.includes("rememberEntityPickerRecord(request.type, duplicate)"));

// --- 5. Integration in TransactionScreen ---
const txSource = readFileSync("src/renderer/features/transactions/TransactionScreen.jsx", "utf8");
check("TransactionScreen imports SmartEntityPicker", txSource.includes('import { SmartEntityPicker }'));
check("TransactionScreen uses SmartEntityPicker in TransactionField", txSource.includes('<SmartEntityPicker'));
check("TransactionScreen passes api to TransactionField", txSource.includes('api={api}'));
check("TransactionScreen passes companyId to TransactionField", txSource.includes('companyId={companyContext?.company_id}'));
check("TransactionScreen entity type map covers all 8 types", txSource.includes("order: \"supply_order\"") && txSource.includes("item: \"item\""));
const ENTITY_VIEW_TYPES = ["department", "employee", "supplier", "bank", "expense_head", "order", "item", "warehouse"];
for (const vt of ENTITY_VIEW_TYPES) {
  check(`TransactionScreen entityTypeMap includes view type "${vt}"`, txSource.includes(`${vt}:`));
}

// --- 6. Integration in BusinessVoucherScreen ---
const bvSource = readFileSync("src/renderer/features/accounting/businessVouchers/BusinessVoucherScreen.jsx", "utf8");
check("BusinessVoucherScreen imports SmartEntityPicker", bvSource.includes('import { SmartEntityPicker }'));
const BV_ENTITY_TYPES = ["supply_order", "bank", "department", "supplier", "employee", "item", "warehouse", "expense_head", "ledger"];
for (const et of BV_ENTITY_TYPES) {
  check(`BusinessVoucherScreen uses SmartEntityPicker entityType="${et}"`, bvSource.includes(`entityType="${et}"`));
}

// --- 6b. Integration in BillingVoucherScreen ---
const billSource = readFileSync("src/renderer/features/billing/BillingVoucherScreen.jsx", "utf8");
check("BillingVoucherScreen imports SmartEntityPicker", billSource.includes('import { SmartEntityPicker }'));
check("BillingVoucherScreen uses SmartEntityPicker for order", billSource.includes('entityType="supply_order"'));
check("BillingVoucherScreen uses SmartEntityPicker for department", billSource.includes('entityType="department"'));
check("BillingVoucherScreen uses SmartEntityPicker for item (grid row)", billSource.includes("openQuickItem(index)"));
check("BillingVoucherScreen passes role to SmartEntityPicker", billSource.includes("role={role}"));

// --- 7. CSS classes in layout.css ---
const css = readFileSync("src/renderer/styles/layout.css", "utf8");
const EXPECTED_CSS = [
  "entity-picker-backdrop",
  "entity-picker-modal",
  "entity-picker-header",
  "entity-picker-close-btn",
  "entity-picker-search",
  "entity-picker-results",
  "entity-picker-row",
  "entity-picker-primary",
  "entity-picker-secondary",
  "entity-picker-trigger",
  "entity-picker-qc-btn",
  "entity-picker-empty-create",
  "entity-picker-load-more",
  "entity-picker-error",
  "entity-picker-status",
  "entity-picker-note"
];
for (const cls of EXPECTED_CSS) {
  check(`CSS has class "${cls}"`, css.includes(`.${cls}`));
}

// --- 8. IPC handler in main.js ---
const mainSource = readFileSync("src/main/main.js", "utf8");
check("main.js registers records:search IPC handler", mainSource.includes("records:search") && mainSource.includes("entitySearchService"));

// --- 9. Preload bridge ---
const preload = readFileSync("src/preload/preload.cjs", "utf8");
check("preload.cjs exposes searchEntities bridge", preload.includes("searchEntities"));

// --- 10. Browser fallback ---
const browserFallback = readFileSync("src/renderer/api/browserFallbackApi.js", "utf8");
check("browserFallbackApi has searchEntities method", browserFallback.includes("searchEntities"));

// --- 11. Migration 028 with search indexes ---
const initSource = readFileSync("src/main/database/init.js", "utf8");
check("init.js has migration 028_entity_picker_search_indexes", initSource.includes("028_entity_picker_search_indexes"));
check("init.js creates search index idx_suppliers_name", initSource.includes("idx_suppliers_name"));
check("init.js creates search index idx_items_name", initSource.includes("idx_items_name"));

// --- 12. Quick Create registry integration ---
const qcPermissions = readFileSync("src/renderer/modules/quick-create/quickCreatePermissions.js", "utf8");
check("quickCreatePermissions exports canQuickCreate", qcPermissions.includes("canQuickCreate"));

// --- 13. EntityPicker Ownership Audit — no remaining entity-type SearchableSelect ---
const ALLOWED_SEARCHABLE_SELECT = ["Company", "Financial Year", "Institution", "company_id", "financial_year", "institution_name", "gem_order_number", "gem_contract_number", "payment_mode"];
function walkJsxFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && !["node_modules", "dist"].includes(entry.name)) {
        results.push(...walkJsxFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsx")) {
        results.push(fullPath);
      }
    }
  } catch { /* skip unreadable */ }
  return results;
}
const allJsxFiles = walkJsxFiles("src/renderer");
let suspiciousSelectCount = 0;
for (const file of allJsxFiles) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("<SearchableSelect")) {
      const isAllowed = ALLOWED_SEARCHABLE_SELECT.some((tok) => line.includes(tok));
      if (!isAllowed) {
        suspiciousSelectCount += 1;
        if (suspiciousSelectCount <= 5) {
          console.log(`  INFO: SearchableSelect at ${file}:${i + 1} — ${line.trim().slice(0, 100)}`);
        }
      }
    }
  }
}
check("no unexpected entity-type SearchableSelect usages remain", suspiciousSelectCount === 0);

// --- 14. Permission matrix — role propagation verification ---
const appSource = readFileSync("src/renderer/App.jsx", "utf8");
check("App.jsx passes role={session.role} to TransactionScreen", appSource.includes("role={session.role}") && appSource.includes("TransactionScreen"));
const screenRegSource = readFileSync("src/renderer/config/screenRegistry.jsx", "utf8");
check("screenRegistry.jsx passes role={session?.role} to TransactionScreen", screenRegSource.includes("role={session?.role}") && screenRegSource.includes("TransactionScreen"));
check("screenRegistry.jsx passes api to TransactionScreen", screenRegSource.includes("api={api}") && screenRegSource.includes("TransactionScreen"));

// TransactionScreen passes role through to TransactionField
check("TransactionScreen passes role prop to TransactionField", txSource.includes("role={role}"));
// TransactionField passes role to SmartEntityPicker (not hardcoded "readonly")
check("TransactionField passes role prop to SmartEntityPicker", txSource.includes("role={role}") && !txSource.includes('role="readonly"'));

// BusinessVoucherScreen passes role to all SmartEntityPicker instances
check("BusinessVoucherScreen passes role to SmartEntityPicker", !bvSource.includes('role="readonly"') && bvSource.includes("role={role}"));
check("BusinessVoucherScreen passes api to QuickCreateMasterDialog", /<QuickCreateMasterDialog[\s\S]*?api=\{api\}[\s\S]*?\/>/.test(bvSource));

// BillingVoucherScreen passes role to SmartEntityPicker (already checked above)
check("BillingVoucherScreen passes role to SmartEntityPicker", billSource.includes("role={role}"));
check("BillingVoucherScreen passes api to QuickCreateMasterDialog", /<QuickCreateMasterDialog[\s\S]*?api=\{api\}[\s\S]*?\/>/.test(billSource));

// SmartEntityPicker calls canQuickCreate with role
check("SmartEntityPicker calls canQuickCreate(..., role)", pickerSource.includes("canQuickCreate(config.quickCreateType, role)"));

// --- 15. Shortcut fix — SmartEntityPicker listens for gii-gem-quick-create event ---
check("SmartEntityPicker listens for gii-gem-quick-create event", pickerSource.includes("gii-gem-quick-create"));
check("SmartEntityPicker checks triggerRef contains activeElement", pickerSource.includes("triggerRef.current?.contains(document.activeElement)"));
check("SmartEntityPicker imports useEffect and useRef", pickerSource.includes("useEffect") && pickerSource.includes("useRef"));
// App.jsx no longer intercepts Alt+Insert when entity picker has focus
check("App.jsx skips Alt+Insert when entity-picker-trigger has focus", appSource.includes(".entity-picker-trigger") && appSource.includes("altKey"));

// --- Summary ---
console.log(JSON.stringify({ passed, failed }, null, 2));
process.exit(failed ? 1 : 0);
