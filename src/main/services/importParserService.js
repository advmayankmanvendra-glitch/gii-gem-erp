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

  // Walks <tag ...>body</tag> (or <tag .../>) elements with indexOf, in one pass. A lazy
  // regex such as /<row[^>]*>([\s\S]*?)<\/row>/g rescans to the end of the text for every
  // unclosed tag, so a tiny crafted file with many open tags freezes the app.
  function forEachElement(xml, tag, fn) {
    const open = `<${tag}`;
    const close = `</${tag}>`;
    let at = 0;
    while ((at = xml.indexOf(open, at)) !== -1) {
      const next = xml[at + open.length];
      if (next !== ">" && next !== "/" && !/\s/.test(next || "")) {
        at += open.length;
        continue;
      }
      const tagEnd = xml.indexOf(">", at);
      if (tagEnd === -1) return;
      const attrs = xml.slice(at + open.length, tagEnd);
      if (attrs.endsWith("/")) {
        fn(attrs.slice(0, -1), "");
        at = tagEnd + 1;
        continue;
      }
      const end = xml.indexOf(close, tagEnd + 1);
      if (end === -1) return;
      fn(attrs, xml.slice(tagEnd + 1, end));
      at = end + close.length;
    }
  }

  function firstElementBody(xml, tag) {
    let body = null;
    forEachElement(xml, tag, (_attrs, inner) => { if (body === null) body = inner; });
    return body;
  }

  function parseSharedStrings(xml) {
    const strings = [];
    forEachElement(xml, "si", (_attrs, body) => {
      const parts = [];
      forEachElement(body, "t", (_tAttrs, text) => parts.push(text));
      strings.push(decodeXml(parts.join("")));
    });
    return strings;
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
  const MAX_XLSX_COLUMN_INDEX = 16383;
  const MAX_XLSX_CELLS = 2000000;

  function assertImportSize(buffer) {
    if (buffer.length > MAX_IMPORT_BYTES) {
      throw new Error(`Import refused: the file is ${(buffer.length / 1048576).toFixed(1)} MB; the limit is 25 MB. Split the sheet into smaller files and import them one by one.`);
    }
  }

  // Lists the workbook's XML parts; each part is inflated only when it is read, so a
  // large workbook with many sheets is not refused when only one small sheet is used.
  function unzipXlsx(buffer) {
    const entries = {};
    let totalBytes = 0;
    const eocd = findEndOfCentralDirectory(buffer);
    const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = centralDirectoryOffset;
    for (let index = 0; index < count; index += 1) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");
      offset += 46 + fileNameLength + extraLength + commentLength;
      if (!/^xl\/.*\.(xml|rels)$/.test(name)) continue;
      entries[name] = { method, compressedSize, localHeaderOffset };
    }
    const cache = {};
    return {
      get(name) {
        if (name in cache) return cache[name];
        const entry = entries[name];
        if (!entry) return undefined;
        const localNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
        const dataStart = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.slice(dataStart, dataStart + entry.compressedSize);
        let data;
        try {
          data = entry.method === 0 ? compressed : zlib.inflateRawSync(compressed, { maxOutputLength: MAX_XLSX_ENTRY_BYTES });
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
        cache[name] = data;
        return data;
      }
    };
  }

  function parseXlsx(buffer) {
    const files = unzipXlsx(buffer);
    const sharedStrings = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8") || "");
    const workbook = files.get("xl/workbook.xml")?.toString("utf8") || "";
    const rels = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";
    const firstSheetId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1];
    const target = firstSheetId ? new RegExp(`<Relationship[^>]*Id="${firstSheetId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] : "worksheets/sheet1.xml";
    const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
    const sheetXml = files.get(sheetPath)?.toString("utf8") || files.get("xl/worksheets/sheet1.xml")?.toString("utf8") || "";
    const matrix = [];
    let cellCount = 0;
    let spreadCells = 0;
    forEachElement(sheetXml, "row", (_rowAttrs, rowBody) => {
      const row = [];
      forEachElement(rowBody, "c", (attrs, body) => {
        const ref = /r="([A-Z]+)(\d+)"/.exec(attrs)?.[1] || "";
        const colIndex = excelColumnIndex(ref);
        // Excel stops at column XFD (16,384 columns); a cell further right is a crafted file
        // that would make every row a huge sparse array and freeze the app.
        if (colIndex > MAX_XLSX_COLUMN_INDEX) {
          throw new Error(`Import refused: the sheet has a cell in column ${ref}, beyond Excel's last column XFD. Save the sheet again from Excel and retry.`);
        }
        cellCount += 1;
        if (cellCount > MAX_XLSX_CELLS) {
          throw new Error("Import refused: the sheet has more than 2,000,000 cells. Split it into smaller files and import them one by one.");
        }
        const type = /t="([^"]+)"/.exec(attrs)?.[1];
        const raw = firstElementBody(body, "v") ?? firstElementBody(body, "t") ?? "";
        const value = type === "s" ? sharedStrings[Number(raw)] || "" : decodeXml(raw);
        row[colIndex] = value;
      });
      spreadCells += row.length;
      if (spreadCells > MAX_XLSX_CELLS * 10) {
        throw new Error("Import refused: the sheet is too wide and long to read safely. Delete empty columns, or split it into smaller files, and retry.");
      }
      if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
    });
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
