#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  convertPurchaseOrderToWorkOrder,
  createRecord,
  deleteRecord,
  initializeDatabase,
  listRecords,
  updateRecord
} from "../src/main/database/init.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gii-gem-operational-stages-"));
const db = initializeDatabase(root);
const suffix = Date.now();
const checks = [];

function check(name, condition, detail = "") {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  checks.push({ name, status: "PASS", detail });
}

function expectError(name, callback, pattern) {
  try {
    callback();
  } catch (error) {
    check(name, pattern.test(error.message), error.message);
    return;
  }
  throw new Error(`${name}: expected operation to be blocked`);
}

try {
  const company = db.prepare("SELECT * FROM companies ORDER BY id LIMIT 1").get();
  const department = db.prepare("SELECT * FROM government_departments ORDER BY id LIMIT 1").get();
  const employee = db.prepare("SELECT * FROM employees ORDER BY id LIMIT 1").get();
  const supplier = db.prepare("SELECT * FROM suppliers ORDER BY id LIMIT 1").get();
  const warehouse = db.prepare("SELECT * FROM warehouses WHERE status = 'active' ORDER BY id LIMIT 1").get();
  check("Seed references available", company && department && employee && supplier && warehouse);

  const accountingBefore = {
    vouchers: db.prepare("SELECT COUNT(*) count FROM vouchers").get().count,
    ledgerEntries: db.prepare("SELECT COUNT(*) count FROM ledger_entries").get().count
  };

  const item = createRecord(db, "items", {
    item_name: `Planning Item ${suffix}`,
    gst_rate: 18,
    unit: "Nos",
    opening_stock: 5,
    opening_rate: 100,
    opening_value: 500,
    default_warehouse_id: warehouse.id,
    status: "active"
  });

  const lead = createRecord(db, "leads", {
    company_id: company.id,
    lead_number: `LEAD-${suffix}`,
    title: "Government supply opportunity",
    department_id: department.id,
    expected_value: 10000,
    status: "new"
  });
  check("Lead create/list", listRecords(db, "leads", { company_id: company.id }).some((row) => row.id === lead.id));
  const updatedLead = updateRecord(db, "leads", lead.id, { ...lead, title: "Updated government supply opportunity" });
  check("Lead update", updatedLead.title.startsWith("Updated"));

  const nullableLead = createRecord(db, "leads", {
    company_id: company.id,
    lead_number: `LEAD-NULL-${suffix}`,
    title: "Nullable reference check",
    department_id: "",
    status: "new"
  });
  check("Blank foreign key normalized", nullableLead.department_id === null);
  deleteRecord(db, "leads", nullableLead.id);
  check("Soft-deleted lead hidden", !listRecords(db, "leads", { company_id: company.id }).some((row) => row.id === nullableLead.id));

  const query = createRecord(db, "requirement_queries", {
    company_id: company.id,
    query_number: `REQ-${suffix}`,
    title: "Supply requirement",
    department_id: department.id,
    employee_id: employee.id,
    lead_id: lead.id,
    priority: "high",
    status: "open"
  });
  const quotation = createRecord(db, "quotations", {
    company_id: company.id,
    quotation_number: `QUO-${suffix}`,
    requirement_query_id: query.id,
    supplier_id: supplier.id,
    quotation_date: "2026-07-20",
    quantity: 10,
    unit_price: 100,
    total_amount: 1000,
    tax_amount: 180,
    grand_total: 1180,
    status: "draft"
  });
  const negotiation = createRecord(db, "negotiations", {
    company_id: company.id,
    negotiation_number: `NEG-${suffix}`,
    quotation_id: quotation.id,
    supplier_id: supplier.id,
    negotiation_date: "2026-07-20",
    initial_amount: 1180,
    negotiated_amount: 1100,
    savings_amount: 80,
    status: "completed"
  });

  const purchaseOrder = createRecord(db, "purchase_orders", {
    company_id: company.id,
    po_number: `PO-${suffix}`,
    po_date: "2026-07-20",
    supply_type: "GeM",
    gem_order_number: `GEM-${suffix}`,
    negotiation_id: negotiation.id,
    department_id: department.id,
    employee_id: employee.id,
    supplier_id: supplier.id,
    title: "Converted Work Order source",
    total_value: 1100,
    status: "accepted"
  });
  check("Purchase Order create/list", listRecords(db, "purchase_orders", { company_id: company.id }).some((row) => row.id === purchaseOrder.id));

  const conversion = convertPurchaseOrderToWorkOrder(db, purchaseOrder.id, { company_id: company.id });
  check("Purchase Order conversion creates Work Order", conversion.workOrder?.id && conversion.workOrder.order_status === "Draft");
  check("Conversion preserves company", Number(conversion.workOrder.company_id) === Number(company.id));
  check("Conversion creates traceability", Number(conversion.purchaseOrder.work_order_id) === Number(conversion.workOrder.id) && Number(conversion.purchaseOrder.converted_to_work_order) === 1);
  expectError("Duplicate conversion blocked", () => convertPurchaseOrderToWorkOrder(db, purchaseOrder.id, { company_id: company.id }), /already been converted/i);
  expectError("Converted Purchase Order edit blocked", () => updateRecord(db, "purchase_orders", purchaseOrder.id, { ...conversion.purchaseOrder, title: "Unsafe edit" }), /locked/i);

  const plan = createRecord(db, "procurement_plans", {
    company_id: company.id,
    plan_number: `PLAN-${suffix}`,
    plan_date: "2026-07-20",
    order_id: conversion.workOrder.id,
    item_id: item.id,
    warehouse_id: warehouse.id,
    required_quantity: 10,
    available_stock: 999,
    short_quantity: 999,
    planned_quantity: 5,
    expected_rate: 100,
    estimated_value: 999,
    supplier_id: supplier.id,
    priority: "high",
    status: "draft"
  });
  check("Available stock derived by backend", Number(plan.available_stock) === 5, String(plan.available_stock));
  check("Short quantity derived by backend", Number(plan.short_quantity) === 5, String(plan.short_quantity));
  check("Estimated value derived by backend", Number(plan.estimated_value) === 500, String(plan.estimated_value));
  const updatedPlan = updateRecord(db, "procurement_plans", plan.id, { ...plan, required_quantity: 12, planned_quantity: 6, expected_rate: 110 });
  check("Procurement Plan recalculates on update", Number(updatedPlan.short_quantity) === 7 && Number(updatedPlan.estimated_value) === 660);
  const completedPlan = updateRecord(db, "procurement_plans", plan.id, { ...updatedPlan, status: "completed" });
  check("Procurement Plan can be completed", completedPlan.status === "completed");
  expectError("Completed Procurement Plan delete blocked", () => deleteRecord(db, "procurement_plans", plan.id), /locked/i);

  const installation = createRecord(db, "installations", {
    company_id: company.id,
    installation_number: `INST-${suffix}`,
    supply_order_id: conversion.workOrder.id,
    department_id: department.id,
    supervisor_employee_id: employee.id,
    installation_date: "2026-07-20",
    status: "pending"
  });
  check("Installation create/list", listRecords(db, "installations", { company_id: company.id }).some((row) => row.id === installation.id));

  [
    ["leads", lead.id],
    ["requirement_queries", query.id],
    ["quotations", quotation.id],
    ["negotiations", negotiation.id],
    ["purchase_orders", purchaseOrder.id],
    ["procurement_plans", plan.id],
    ["installations", installation.id]
  ].forEach(([table, id]) => check(`${table} is registered`, listRecords(db, table, { company_id: company.id }).some((row) => row.id === id)));

  const accountingAfter = {
    vouchers: db.prepare("SELECT COUNT(*) count FROM vouchers").get().count,
    ledgerEntries: db.prepare("SELECT COUNT(*) count FROM ledger_entries").get().count
  };
  check("No voucher mutation", accountingAfter.vouchers === accountingBefore.vouchers);
  check("No ledger mutation", accountingAfter.ledgerEntries === accountingBefore.ledgerEntries);
  check("Conversion audit recorded", Boolean(db.prepare("SELECT id FROM audit_log WHERE action = 'convert_to_work_order' AND table_name = 'purchase_orders' AND record_id = ?").get(purchaseOrder.id)));

  console.log(JSON.stringify({ status: "passed", checks: checks.length, tables: 7, workOrderId: conversion.workOrder.id }, null, 2));
} catch (error) {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}

process.exit(process.exitCode || 0);
