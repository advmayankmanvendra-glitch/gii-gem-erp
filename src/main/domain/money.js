export const CURRENCY = "INR";
export const MINOR_UNITS = 100;
export const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER / MINOR_UNITS;
export const RATE_PRECISION = 4;
export const QUANTITY_PRECISION = 3;
export const PERCENTAGE_PRECISION = 4;

// Rounds a plain decimal string to paise, half away from zero, using the digits
// themselves rather than binary floating point (so "1.005" -> 101 and
// "2.675" -> 268 consistently).
function decimalStringToMinor(text) {
  if (/e/i.test(text)) return Math.round(Number(text) * MINOR_UNITS);
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const padded = `${fraction}000`;
  let minor = Number(whole) * MINOR_UNITS + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) minor += 1;
  return negative && minor !== 0 ? -minor : minor;
}

export function roundMoney(value) {
  return parseMoneyToMinor(Number(value || 0)) / MINOR_UNITS;
}

// Rupee amounts as stored in the legacy REAL columns, converted to whole paise.
// Blank and non-numeric values count as zero, as `Number(x || 0)` did before.
export function paise(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? parseMoneyToMinor(value) : 0;
  const cleaned = String(value).replace(/[₹,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return 0;
  return parseMoneyToMinor(cleaned);
}

// Whole paise back to a rupee number that prints exactly to two decimals.
export function rupees(minor) {
  return Number(minor || 0) / MINOR_UNITS;
}

// Adds rupee amounts in whole paise, so 0.10 + 0.20 is exactly 0.30 and long
// lists never drift. Returns rupees.
export function sumRupees(values) {
  let total = 0;
  for (const value of values) total += paise(value);
  return rupees(total);
}

export function addRupees(...values) {
  return sumRupees(values);
}

export function subtractRupees(a, b) {
  return rupees(paise(a) - paise(b));
}

export function rupeesEqual(a, b) {
  return paise(a) === paise(b);
}

export function parseMoneyToMinor(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Money value must be finite");
    const minor = decimalStringToMinor(String(Number(value.toPrecision(15))));
    if (!Number.isSafeInteger(minor)) throw new Error(`Money value exceeds safe range: ${value}`);
    return minor;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[₹,\s]/g, "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Malformed money input: "${value}"`);
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) throw new Error(`Money value must be finite: "${value}"`);
    const minor = decimalStringToMinor(cleaned);
    if (!Number.isSafeInteger(minor)) throw new Error(`Money value exceeds safe range: ${value}`);
    return minor;
  }
  throw new Error(`Invalid money input type: ${typeof value}`);
}

export function minorToDecimalString(value) {
  if (value === null || value === undefined) return "0.00";
  const num = Number(value);
  if (!Number.isInteger(num) || !Number.isSafeInteger(num)) {
    if (Number.isNaN(num)) return "0.00";
    throw new Error("Minor-unit value must be a safe integer");
  }
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const whole = Math.floor(abs / MINOR_UNITS);
  const frac = abs % MINOR_UNITS;
  return `${sign}${whole}.${String(frac).padStart(2, "0")}`;
}

export function minorToMajor(value) {
  if (value === null || value === undefined) return 0;
  return Number(minorToDecimalString(value));
}

export function addMoney(...values) {
  return values.reduce((sum, v) => sum + Number(v), 0);
}

export function subtractMoney(a, b) {
  return Number(a) - Number(b);
}

export function compareMoney(a, b) {
  return Number(a) - Number(b);
}

export function multiplyRateByQuantity(rate, quantity) {
  const qty = Number(quantity || 0);
  const raw = rate * qty;
  const resultMinor = Math.round(raw);
  if (!Number.isSafeInteger(resultMinor)) throw new Error("Multiplication result exceeds safe range");
  return resultMinor;
}

export function calculatePercentage(amountMinor, ratePct) {
  const raw = amountMinor * ratePct / 100;
  const resultMinor = Math.round(raw);
  if (!Number.isSafeInteger(resultMinor)) throw new Error("Percentage result exceeds safe range");
  return resultMinor;
}

export function allocateMoney(total, shares) {
  const totalMinor = Number(total);
  const shareValues = shares.map(s => Number(s));
  const totalShares = shareValues.reduce((a, b) => a + b, 0);
  if (totalShares === 0) return shareValues.map(() => 0);
  let allocated = 0;
  const results = shareValues.map(share => {
    const raw = totalMinor * share / totalShares;
    return Math.round(raw);
  });
  allocated = results.reduce((a, b) => a + b, 0);
  let remainder = totalMinor - allocated;
  let idx = 0;
  while (remainder !== 0 && idx < 1000) {
    const adjust = remainder > 0 ? 1 : -1;
    results[idx % results.length] += adjust;
    remainder -= adjust;
    idx++;
  }
  return results;
}

export function assertMoney(value) {
  if (typeof value !== "number") throw new Error(`Money must be a number: ${value}`);
  if (!Number.isInteger(value)) throw new Error(`Money must be integer minor units: ${value}`);
  if (!Number.isSafeInteger(value)) throw new Error(`Money exceeds safe integer range: ${value}`);
}

export function assertSafeMoney(value) {
  assertMoney(value);
}

export function sumMoney(values) {
  return values.reduce((s, v) => s + Number(v || 0), 0);
}

export function formatMoneyForDisplay(value, currency) {
  const cur = currency || CURRENCY;
  const major = minorToMajor(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(major);
}

export function convertLegacyMajorToMinor(value) {
  return parseMoneyToMinor(value);
}

export function convertMinorToLegacyMajor(value) {
  return minorToMajor(value);
}

export function roundToMinor(value) {
  return Math.round(Number(value || 0) * MINOR_UNITS);
}

export function exactEqual(a, b) {
  return Number(a) === Number(b);
}
