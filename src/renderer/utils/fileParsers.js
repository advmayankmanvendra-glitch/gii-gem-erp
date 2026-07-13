import { downloadText } from "./formatters.js";
import { formatCurrency } from "./formatters.js";

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function splitGrossByGst(grossAmount, gstRate) {
  const gross = roundMoney(grossAmount);
  const rate = Number(gstRate || 0);
  if (!rate) return { taxable: gross, gst: 0, gross };
  const taxable = roundMoney(gross / (1 + rate / 100));
  return { taxable, gst: roundMoney(gross - taxable), gross };
}

export function normalizeStatusClass(status) {
  return String(status || "draft").toLowerCase().replaceAll(" ", "-").replaceAll("/", "-");
}

export function formatCell(value, type) {
  if (type === "money") return formatCurrency(Number(value || 0));
  return value ?? "-";
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

export function buildZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(([fileName, data]) => {
    const nameBytes = encoder.encode(fileName);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });
  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

export function excelColumnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildXlsxBytes(rows) {
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, cellIndex) => {
    const ref = `${excelColumnName(cellIndex)}${rowIndex + 1}`;
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Template" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheetXml]
  ];
  return buildZip(files.map(([name, content]) => [name, new TextEncoder().encode(content)]));
}

export function downloadXlsx(fileName, rows) {
  const bytes = buildXlsxBytes(rows);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function decodeXmlBrowser(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function normalizeImportHeader(value) {
  return String(value || "").trim().toLowerCase().replaceAll(" ", "_");
}

export function excelColumnIndexBrowser(column) {
  return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function splitCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  cells.push(value);
  return cells;
}

export function matrixToRows(matrix) {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => /date|narration|debit|credit|balance|utr|reference|cheque/i.test(cell)));
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
}

export function parseCsvText(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines.shift() || "").map((header) => header.trim().toLowerCase().replaceAll(" ", "_"));
  return lines.map((line) => Object.fromEntries(splitCsvLine(line).map((cell, index) => [headers[index], cell.trim()])));
}

export function parseLegacyXlsText(text) {
  const clean = text.replace(/\0/g, "");
  if (/<table|<tr|<td/i.test(clean)) {
    const rows = [];
    for (const rowMatch of clean.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(decodeXmlBrowser(cellMatch[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")).trim());
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    return matrixToRows(rows);
  }
  if (clean.includes("\t")) return matrixToRows(clean.split(/\r?\n/).map((line) => line.split("\t").map((cell) => cell.trim())).filter((row) => row.some(Boolean)));
  return parseCsvText(clean);
}

export function parseSharedStringsBrowser(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXmlBrowser([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
}

export function findEndOfCentralDirectoryBrowser(view) {
  for (let index = view.byteLength - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) return index;
  }
  throw new Error("Invalid XLSX file");
}

export async function inflateRawBrowser(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("XLSX decompression is not supported in this browser. Use the desktop file picker.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzipXlsxBrowser(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const files = new Map();
  const eocd = findEndOfCentralDirectoryBrowser(view);
  const centralDirectoryOffset = view.getUint32(eocd + 16, true);
  const entries = view.getUint16(eocd + 10, true);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? compressed : await inflateRawBrowser(compressed));
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

export async function parseXlsxBufferBrowser(arrayBuffer) {
  const files = await unzipXlsxBrowser(arrayBuffer);
  const decoder = new TextDecoder();
  const sharedStrings = parseSharedStringsBrowser(files.get("xl/sharedStrings.xml") ? decoder.decode(files.get("xl/sharedStrings.xml")) : "");
  const workbook = files.get("xl/workbook.xml") ? decoder.decode(files.get("xl/workbook.xml")) : "";
  const rels = files.get("xl/_rels/workbook.xml.rels") ? decoder.decode(files.get("xl/_rels/workbook.xml.rels")) : "";
  const firstSheetId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
  const target = firstSheetId ? new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : "worksheets/sheet1.xml";
  const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
  const sheetBytes = files.get(sheetPath) || files.get("xl/worksheets/sheet1.xml");
  if (!sheetBytes) throw new Error("No worksheet found in XLSX file");
  const sheetXml = decoder.decode(sheetBytes);
  const matrix = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1] || "";
      const colIndex = excelColumnIndexBrowser(ref);
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] || "";
      const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXmlBrowser(raw);
      row[colIndex] = value;
    }
    if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
  }
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeImportHeader);
    return normalized.includes("supplier_name") ||
      normalized.includes("beneficiary_account_name") ||
      normalized.includes("item_name") ||
      normalized.includes("order_number") ||
      normalized.includes("company_name");
  });
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
}

export function createInitialTemplateFieldMap(template, rows) {
  const detected = Object.keys(rows[0] || {});
  return Object.fromEntries((template.columns || []).map((column) => {
    const normalizedColumn = normalizeImportHeader(column);
    const match = detected.find((field) => normalizeImportHeader(field) === normalizedColumn);
    return [column, match || ""];
  }));
}

export function mapTemplateRows(rows, template, fieldMap) {
  return rows.map((row) => Object.fromEntries((template.columns || []).map((column) => {
    const key = normalizeImportHeader(column);
    const mappedField = fieldMap[column];
    return [key, mappedField ? row[mappedField] ?? "" : row[key] ?? ""];
  })));
}

export function validateStagedTemplateRows(template, rows) {
  const result = { totalRows: rows.length, successfulRows: 0, failedRows: 0, skippedDuplicates: 0, updatedRows: 0, errors: [] };
  const seen = new Set();
  rows.forEach((row, index) => {
    const errors = [];
    const rowNumber = index + 1;
    const value = (field) => String(row[normalizeImportHeader(field)] ?? "").trim();

    template.required.forEach((field) => {
      if (!value(field)) errors.push(`${field} is required`);
    });

    if (value("gstin") && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value("gstin"))) {
      errors.push("GSTIN format is invalid");
    }
    if (value("pan") && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value("pan"))) {
      errors.push("PAN format is invalid");
    }
    ["gst_rate", "purchase_rate", "sales_rate", "opening_balance", "opening_stock_qty", "opening_stock_value", "amount"].forEach((field) => {
      if (value(field) && !Number.isFinite(Number(value(field)))) errors.push(`${field} must be numeric`);
    });
    if (value("opening_balance") && !["debit", "credit"].includes(value("opening_balance_type").toLowerCase())) {
      errors.push("opening_balance_type must be Debit or Credit when opening balance is present");
    }
    if (template.id === "tally_ledger_mapping" && !value("erp_account_group")) {
      errors.push("erp_account_group is required for ledger mapping");
    }
    if (template.id === "tally_voucher_mapping") {
      const knownTypes = new Set(["sales", "purchase", "receipt", "payment", "journal", "contra", "credit note", "debit note"]);
      if (value("tally_voucher_type") && !knownTypes.has(value("tally_voucher_type").toLowerCase()) && !value("erp_voucher_type")) {
        errors.push("Unknown Tally voucher type requires erp_voucher_type mapping");
      }
    }

    const duplicateKey = template.duplicateKeys.map((field) => value(field).toLowerCase()).filter(Boolean).join("|");
    if (duplicateKey) {
      if (seen.has(duplicateKey)) {
        result.skippedDuplicates += 1;
        result.errors.push({ row: rowNumber, status: "Duplicate", errors: ["Duplicate key in uploaded template"] });
        return;
      }
      seen.add(duplicateKey);
    }

    if (errors.length) {
      result.failedRows += 1;
      result.errors.push({ row: rowNumber, status: "Failed", errors });
      return;
    }
    result.successfulRows += 1;
  });
  return result;
}

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadErrorReport(table, errors) {
  const csv = ["row,status,errors", ...errors.map((item) => [item.row, item.status, `"${item.errors.join("; ").replaceAll('"', '""')}"`].join(","))].join("\n");
  downloadText(`${table}-import-errors.csv`, csv);
}

export async function parseUploadFile(file, api) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (file.path) return api.parseImportFile(file.path);
  if (extension === "xlsx") {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.parseImportBuffer(file.name, bytes);
  }
  if (extension === "csv") return parseCsvText(await file.text());
  if (extension === "xls") return parseLegacyXlsText(await file.text());
  throw new Error("Only CSV, XLS and XLSX files are supported for import");
}
