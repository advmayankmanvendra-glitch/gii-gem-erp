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

  // Each data row becomes one object with a key per header column, so the work is
  // columns x rows. A small crafted file with a very wide header (or a sheet past these
  // limits) would block the app for minutes; real import sheets are far below them.
  const MAX_IMPORT_COLUMNS = 500;
  const MAX_IMPORT_ROWS = 200000;
  const MAX_IMPORT_VALUES = 12000000;
  const MAX_HEADER_SEARCH_ROWS = 50;

  function tooManyRows() {
    return new Error(`Import refused: the sheet has more than ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows. Split it into smaller files and import them one by one.`);
  }

  // Header cells left blank (for example trailing commas saved by Excel) carry no field.
  function namedColumns(headers) {
    return headers.map((header, index) => [header, index]).filter(([header]) => header);
  }

  function toRecords(headerEntries, rows) {
    if (headerEntries.length > MAX_IMPORT_COLUMNS) {
      throw new Error(`Import refused: the header row has ${headerEntries.length} columns; the limit is ${MAX_IMPORT_COLUMNS}. Delete the unused columns and import again.`);
    }
    if (rows.length > MAX_IMPORT_ROWS || headerEntries.length * rows.length > MAX_IMPORT_VALUES) {
      throw new Error(`Import refused: the sheet has ${rows.length} rows of ${headerEntries.length} columns, more than one import can read safely. Split it into smaller files and import them one by one.`);
    }
    return rows.map((cells) => Object.fromEntries(headerEntries.map(([header, index]) => [header, cells[index] ?? ""])));
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
        // Refuse a sheet past the row limit while reading, before it fills memory.
        if (rows.length > MAX_IMPORT_ROWS + 1) throw tooManyRows();
        row = [];
        value = "";
      } else {
        value += char;
      }
    }
    row.push(value.trim());
    if (row.some((cell) => cell !== "")) rows.push(row);
    const headers = (rows.shift() || []).map(normalizeHeader);
    return toRecords(namedColumns(headers), rows);
  }

  function parseDelimited(text, delimiter) {
    if ((text.match(/\n/g)?.length || 0) > MAX_IMPORT_ROWS + 1) throw tooManyRows();
    const rows = text.split(/\r?\n/).map((line) => line.split(delimiter).map((cell) => cell.trim())).filter((row) => row.some(Boolean));
    const headers = (rows.shift() || []).map(normalizeHeader);
    return toRecords(namedColumns(headers), rows);
  }

  function parseHtmlTable(text) {
    const rows = [];
    // HTML tag names are case-insensitive; the walker below matches lower case.
    const html = text.replace(/<(\/?)(tr|td|th)\b/gi, (_match, slash, tag) => `<${slash}${tag.toLowerCase()}`);
    forEachElement(html, "tr", (_attrs, rowBody) => {
      const cells = [];
      const cellPattern = /<(td|th)(?=[\s>\/])/g;
      let match;
      while ((match = cellPattern.exec(rowBody))) {
        const tagEnd = rowBody.indexOf(">", match.index);
        if (tagEnd === -1) break;
        const end = rowBody.indexOf(`</${match[1]}>`, tagEnd + 1);
        if (end === -1) break;
        cells.push(rowBody.slice(tagEnd + 1, end).replace(/<[^<>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());
        cellPattern.lastIndex = end;
      }
      if (cells.some(Boolean)) rows.push(cells);
      if (rows.length > MAX_IMPORT_ROWS + 1) throw tooManyRows();
    });
    const headers = (rows.shift() || []).map(normalizeHeader);
    return toRecords(namedColumns(headers), rows);
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
  const MAX_CELL_CHARS = 32767;
  const MAX_SHEET_CHARS = 64 * 1024 * 1024;

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
    // Read the first sheet's id and its relationship target from tag attributes only; a
    // regex over the whole file (or one built from text inside it) can be made to hang.
    let firstSheetId = null;
    forEachElement(workbook, "sheet", (attrs) => { if (firstSheetId === null) firstSheetId = /r:id="([^"]+)"/.exec(attrs)?.[1] || ""; });
    let target = firstSheetId ? null : "worksheets/sheet1.xml";
    if (firstSheetId) {
      forEachElement(rels, "Relationship", (attrs) => {
        if (target === null && /\bId="([^"]+)"/.exec(attrs)?.[1] === firstSheetId) target = /\bTarget="([^"]+)"/.exec(attrs)?.[1] || "";
      });
    }
    const sheetPath = `xl/${(target || "worksheets/sheet1.xml").replace(/^\/xl\//, "")}`;
    const sheetXml = files.get(sheetPath)?.toString("utf8") || files.get("xl/worksheets/sheet1.xml")?.toString("utf8") || "";
    const matrix = [];
    let cellCount = 0;
    let spreadCells = 0;
    let textChars = 0;
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
        // Many cells can point at one shared string, so a few KB of sheet can expand to
        // gigabytes of text. Excel itself stops a cell at 32,767 characters.
        if (value.length > MAX_CELL_CHARS) {
          throw new Error(`Import refused: cell ${ref}${/r="[A-Z]+(\d+)"/.exec(attrs)?.[1] || ""} holds more than 32,767 characters, Excel's limit for one cell. Save the sheet again from Excel and retry.`);
        }
        textChars += value.length;
        if (textChars > MAX_SHEET_CHARS) {
          throw new Error("Import refused: the sheet holds more than 64 million characters of text. Split it into smaller files and import them one by one.");
        }
        row[colIndex] = value;
      });
      spreadCells += row.length;
      if (spreadCells > MAX_XLSX_CELLS * 10) {
        throw new Error("Import refused: the sheet is too wide and long to read safely. Delete empty columns, or split it into smaller files, and retry.");
      }
      if (row.some((cell) => String(cell || "").trim())) matrix.push(row.map((cell) => String(cell || "").trim()));
    });
    // The header is near the top; looking further only costs time on a crafted sheet.
    const headerIndex = matrix.slice(0, MAX_HEADER_SEARCH_ROWS).findIndex((row) => {
      const normalized = row.map(normalizeHeader);
      return normalized.includes("supplier_name") ||
        normalized.includes("beneficiary_account_name") ||
        normalized.includes("item_name") ||
        normalized.includes("order_number") ||
        normalized.includes("company_name");
    });
    const sourceRows = headerIndex >= 0 ? matrix.slice(headerIndex) : matrix;
    const headers = (sourceRows.shift() || []).map(normalizeHeader);
    return toRecords(namedColumns(headers), sourceRows);
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
