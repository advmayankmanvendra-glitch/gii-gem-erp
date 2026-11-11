export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

function safeExportFileName(value, extension = "csv") {
  const base = String(value || "export")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "export"}.${extension}`;
}

// A cell starting with = + - @ is run as a formula by Excel; prefix it so it opens as text.
// Plain numbers such as -500, -1,234.50 or +91 98765 43210 are left alone.
export function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d, ]*\.?\d+$/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  const text = neutralizeFormula(value === null || value === undefined ? "" : String(value));
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export function downloadText(fileName, content, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\uFEFF", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportRows(title, rows) {
  if (!rows?.length) return false;
  const keys = Object.keys(rows[0]);
  const csv = [
    keys.map(csvCell).join(","),
    ...rows.map((row) => keys.map((key) => csvCell(row[key])).join(","))
  ].join("\r\n") + "\r\n";
  downloadText(safeExportFileName(title), csv);
  return true;
}
