import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

export function createImportParserService() {
  function decodeXml(value) {
    return String(value || "")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'");
  }

  function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase().replaceAll(" ", "_");
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(value.trim());
        value = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(value.trim());
        if (row.some((cell) => cell !== "")) rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
    const headers = (rows.shift() || []).map(normalizeHeader);
    return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
  }

  function parseDelimited(text, delimiter) {
    const rows = text.split(/\r?\n/).map((line) => line.split(delimiter).map((cell) => cell.trim())).filter((row) => row.some(Boolean));
    const headers = (rows.shift() || []).map(normalizeHeader);
    return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
  }

  function parseHtmlTable(text) {
    const rows = [];
    for (const rowMatch of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [];
      for (const cellMatch of rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());
      }
      if (cells.some(Boolean)) rows.push(cells);
    }
    const headers = (rows.shift() || []).map(normalizeHeader);
    return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
  }

  function parseLegacyXls(buffer) {
    const text = buffer.toString("utf8").replace(/\0/g, "");
    if (/<table|<tr|<td/i.test(text)) return parseHtmlTable(text);
    if (text.includes("\t")) return parseDelimited(text, "\t");
    return parseCsv(text);
  }

  function excelColumnIndex(column) {
    return column.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  }

  function parseSharedStrings(xml) {
    return [...xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
  }

  function findEndOfCentralDirectory(buffer) {
    for (let index = buffer.length - 22; index >= 0; index -= 1) {
      if (buffer.readUInt32LE(index) === 0x06054b50) return index;
    }
    throw new Error("Invalid XLSX file");
  }

  // An .xlsx is a zip; a small crafted file can inflate to gigabytes and freeze the app.
  const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
  const MAX_XLSX_ENTRY_BYTES = 64 * 1024 * 1024;
  const MAX_XLSX_TOTAL_BYTES = 128 * 1024 * 1024;

  function assertImportSize(buffer) {
    if (buffer.length > MAX_IMPORT_BYTES) {
      throw new Error(`Import refused: the file is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is 25 MB. Split the sheet into smaller files and import them one by one.`);
    }
  }

  function unzipXlsx(buffer) {
    const files = {};
    let totalBytes = 0;
    const eocd = findEndOfCentralDirectory(buffer);
    const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
    const entries = buffer.readUInt16LE(eocd + 10);
    let offset = centralDirectoryOffset;
    for (let index = 0; index < entries; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.slice(dataStart, dataStart + compressedSize);
      offset += 46 + fileNameLength + extraLength + commentLength;
      // Only the workbook XML parts are read; skip media and anything else.
      if (!/^xl\/.*\.(xml|rels)$/.test(name)) continue;
      let data;
      try {
        data = method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_BYTES });
      } catch (error) {
        if (error?.code === "ERR_BUFFER_TOO_LARGE" || /too large|maxOutputLength/i.test(String(error?.message))) {
          throw new Error("Import refused: a part of this .xlsx expands to more than 64 MB. Save the sheet again from Excel (or as CSV) and retry.");
        }
        throw new Error(`Import refused: the .xlsx file is damaged (${error.message}). Save it again from Excel and retry.`);
      }
      totalBytes += data.length;
      if (totalBytes > MAX_XLSX_TOTAL_BYTES) {
        throw new Error("Import refused: this .xlsx expands to more than 128 MB. Split the sheet into smaller files and import them one by one.");
      }
      files[name] = data;
    }
    return files;
  }

  function parseXlsx(buffer) {
    const files = unzipXlsx(buffer);
    const sharedStrings = parseSharedStrings(files["xl/sharedStrings.xml"]?.toString("utf8") || "");
    const workbook = files["xl/workbook.xml"]?.toString("utf8") || "";
    const rels = files["xl/_rels/workbook.xml.rels"]?.toString("utf8") || "";
    const firstSheetId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
    const target = firstSheetId ? new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : "worksheets/sheet1.xml";
    const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
    const sheetXml = files[sheetPath]?.toString("utf8") || files["xl/worksheets/sheet1.xml"]?.toString("utf8") || "";
    const matrix = [];
    for (const rowMatch of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cellMatch[1];
        const body = cellMatch[2];
        const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1] || "";
        const colIndex = excelColumnIndex(ref);
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] || "";
        const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw);
        row[colIndex] = value;
      }
      if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
    }
    const headerIndex = matrix.findIndex((row) => {
      const normalized = row.map(normalizeHeader);
      return normalized.includes("supplier_name") ||
        normalized.includes("beneficiary_account_name") ||
        normalized.includes("item_name") ||
        normalized.includes("order_number") ||
        normalized.includes("company_name");
    });
    const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
    const headers = (sourceRows.shift() || []).map(normalizeHeader);
    const headerEntries = headers.map((header, index) => [header, index]).filter(([header]) => header);
    return sourceRows.map((cells) => Object.fromEntries(headerEntries.map(([header, index]) => [header, cells[index] ?? ""])));
  }

  function parseImportFile(filePath) {
    const extension = path.extname(filePath || "").toLowerCase();
    if ([".csv", ".xlsx", ".xls"].includes(extension)) assertImportSize({ length: fs.statSync(filePath).size });
    if (extension === ".csv") return parseCsv(fs.readFileSync(filePath, "utf8"));
    if (extension === ".xlsx") return parseXlsx(fs.readFileSync(filePath));
    if (extension === ".xls") return parseLegacyXls(fs.readFileSync(filePath));
    throw new Error("Only CSV, XLS and XLSX files are supported for import");
  }

  function parseImportBuffer(fileName, bytes) {
    const extension = path.extname(fileName || "").toLowerCase();
    const buffer = Buffer.from(bytes || []);
    assertImportSize(buffer);
    if (extension === ".csv") return parseCsv(buffer.toString("utf8"));
    if (extension === ".xlsx") return parseXlsx(buffer);
    if (extension === ".xls") return parseLegacyXls(buffer);
    throw new Error("Only CSV, XLS and XLSX files are supported for import");
  }

  return { parseImportFile, parseImportBuffer, normalizeHeader };
}
