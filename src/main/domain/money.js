export const CURRENCY = "INR";
export const MINOR_UNITS = 100;
export const MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER / MINOR_UNITS;
export const RATE_PRECISION = 4;
export const QUANTITY_PRECISION = 3;
export const PERCENTAGE_PRECISION = 4;

export function parseMoneyToMinor(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Money value must be finite");
    const minor = Math.round(value * MINOR_UNITS);
    if (!Number.isSafeInteger(minor)) throw new Error(`Money value exceeds safe range: ${value}`);
    return minor;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[₹,\s]/g, "").trim();
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Malformed money input: "${value}"`);
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) throw new Error(`Money value must be finite: "${value}"`);
    const minor = Math.round(num * MINOR_UNITS);
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
