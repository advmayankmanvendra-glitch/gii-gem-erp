import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getPrintTemplateLabel } from "./printTemplateConfig.js";
import { PrintTemplateHost } from "./PrintTemplateHost.jsx";

function collectPrintTemplateData(sourceNode) {
  if (!sourceNode) return { fields: [], tables: [], warnings: ["No loaded screen data was available for this print template."] };
  const clone = sourceNode.cloneNode(true);
  clone.querySelectorAll(".runtime-banner, .training-banner, .productivity-panel, .button-row, .toolbar-controls, .billing-actions, .quick-create-modal, input[type='file'], [data-print-ignore='true']").forEach((node) => node.remove());
  const fields = collectFields(clone);
  const tables = collectTables(clone);
  const warnings = [];
  if (!fields.length && !tables.length) warnings.push("This template could not find loaded fields or tables on the current screen.");
  return { fields, tables, warnings };
}

function renderTemplateHtml(preview, templateKey) {
  if (!templateKey || templateKey === "screen_snapshot") return preview.html;
  return renderToStaticMarkup(
    React.createElement(PrintTemplateHost, {
      templateKey,
      templateLabel: getPrintTemplateLabel(templateKey),
      preview,
      data: preview.templateData || { fields: [], tables: [], warnings: [] }
    })
  );
}

function makePrintPreviewForTemplate(preview, templateKey) {
  const templateLabel = getPrintTemplateLabel(templateKey);
  return {
    ...preview,
    title: templateKey === "screen_snapshot" ? preview.title : templateLabel,
    subtitle: templateKey === "screen_snapshot" ? preview.subtitle : `${preview.title || "GII GeM ERP"} - certified print template`,
    html: renderTemplateHtml(preview, templateKey),
    selectedTemplateKey: templateKey
  };
}

function collectFields(root) {
  const controls = Array.from(root.querySelectorAll("input, textarea, select"))
    .filter((field) => field.type !== "hidden" && field.type !== "file");
  const fields = [];
  controls.forEach((field) => {
    const label = normalizeLabel(findControlLabel(field));
    const value = readControlValue(field);
    if (!label || !value || value === "-") return;
    if (fields.some((entry) => entry.label === label && entry.value === value)) return;
    fields.push({ label, value });
  });
  return fields.slice(0, 80);
}

function collectTables(root) {
  return Array.from(root.querySelectorAll("table")).map((table, index) => {
    const heading = findTableHeading(table) || `Table ${index + 1}`;
    const headers = Array.from(table.querySelectorAll("thead th")).map((cell) => cleanText(cell.textContent)).filter(Boolean);
    const rows = Array.from(table.querySelectorAll("tbody tr")).map((row) => (
      Array.from(row.querySelectorAll("td")).map((cell) => cleanText(cell.textContent))
    )).filter((row) => row.some(Boolean));
    return { heading, headers, rows: rows.slice(0, 80) };
  }).filter((table) => table.headers.length || table.rows.length).slice(0, 4);
}

function findControlLabel(field) {
  const explicitLabel = field.id ? field.ownerDocument?.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
  if (explicitLabel) return explicitLabel.textContent;
  const wrappedLabel = field.closest("label");
  if (wrappedLabel) {
    const clone = wrappedLabel.cloneNode(true);
    clone.querySelectorAll("input, textarea, select, button").forEach((node) => node.remove());
    return clone.textContent;
  }
  const previous = field.previousElementSibling;
  if (previous && ["LABEL", "STRONG", "SPAN", "SMALL"].includes(previous.tagName)) return previous.textContent;
  return field.getAttribute("aria-label") || field.getAttribute("name") || field.getAttribute("placeholder") || "";
}

function findTableHeading(table) {
  let node = table.parentElement;
  for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
    const heading = node.querySelector("h1, h2, h3, strong");
    if (heading) return cleanText(heading.textContent);
  }
  return "";
}

function readControlValue(field) {
  if (field.tagName === "SELECT") return cleanText(field.options?.[field.selectedIndex]?.text || field.value || "");
  if (field.type === "checkbox") return field.checked ? "Yes" : "No";
  if (field.type === "radio") return field.checked ? field.value || "Selected" : "";
  return cleanText(field.value || field.getAttribute("value") || "");
}

function normalizeLabel(label) {
  return cleanText(label)
    .replace(/\s+/g, " ")
    .replace(/[:*]+$/g, "")
    .trim();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickFields(data, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return (data.fields || []).filter((field) => wanted.some((name) => field.label.toLowerCase().includes(name)));
}

function firstTable(data) {
  return (data.tables || [])[0] || null;
}

function hasTemplateData(data) {
  return Boolean((data.fields || []).length || (data.tables || []).length);
}

export { collectPrintTemplateData, firstTable, hasTemplateData, makePrintPreviewForTemplate, pickFields, renderTemplateHtml };
