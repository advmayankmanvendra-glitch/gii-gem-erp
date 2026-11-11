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

export function matrixToRows(matrix) {
  const headerIndex = matrix.findIndex((row) => row.some((cell) => /date|narration|debit|credit|balance|utr|reference|cheque/i.test(cell)));
  const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
  const headers = (sourceRows.shift() || []).map(normalizeImportHeader);
  const entries = headers.map((header, index) => [header, index]).filter(([header]) => header);
  return sourceRows.map((cells) => Object.fromEntries(entries.map(([header, index]) => [header, cells[index] ?? ""])));
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

export function parseSharedStringsBrowser(xml) {
  return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXmlBrowser([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
}

export function excelColumnIndexBrowser(column) {
  return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
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

export function normalizeFallbackImportRow(table, row) {
  if (table !== "suppliers") return { ...row, status: row.status || "active" };
  const normalized = { ...row };
  normalized.supplier_name ||= normalized.supplier_account_name || normalized.beneficiary_account_name || normalized.account_name || "";
  normalized.supplier_type ||= normalized.beneficiary_type || "";
  normalized.supplier_code ||= normalized.beneficiary_code || "";
  normalized.date_of_activation ||= normalized.date_of_activation || "";
  normalized.supplier_account_name ||= normalized.beneficiary_account_name || normalized.supplier_name || "";
  normalized.supplier_account_number ||= normalized.beneficiary_account_number || normalized.account_number || "";
  normalized.supplier_bank_name ||= normalized.beneficiary_bank_name || normalized.bank_name || "";
  normalized.supplier_bank_ifsc_code ||= normalized.beneficiary_ifsc_code || normalized.ifsc || "";
  normalized.supplier_branch ||= normalized.beneficiary_branch || normalized.branch || "";
  normalized.supplier_contact ||= normalized.beneficiary_contact || normalized.contact || "";
  normalized.status = normalized.status || (String(normalized.beneficiary_status || "").toLowerCase().includes("disabled") ? "inactive" : "active");
  if (!normalized.contact_details && normalized.supplier_contact) normalized.contact_details = normalized.supplier_contact;
  if (!normalized.bank_details && (normalized.supplier_account_number || normalized.supplier_bank_name || normalized.supplier_bank_ifsc_code || normalized.supplier_branch)) {
    normalized.bank_details = [
      `Account Name: ${normalized.supplier_account_name || "-"}`,
      `Account Number: ${normalized.supplier_account_number || "-"}`,
      `Bank: ${normalized.supplier_bank_name || "-"}`,
      `IFSC: ${normalized.supplier_bank_ifsc_code || "-"}`,
      `Branch: ${normalized.supplier_branch || "-"}`
    ].join("; ");
  }
  return normalized;
}
