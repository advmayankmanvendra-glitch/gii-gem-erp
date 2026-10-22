// A cell starting with = + - @ is run as a formula by Excel; prefix it so it opens as text.
// Plain numbers such as -500, -1,234.50 or +91 98765 43210 are left alone. The renderer has the same rule in
// src/renderer/utils/formatters.js (the two processes do not share modules).
export function neutralizeFormula(text) {
  return /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d, ]*\.?\d+$/.test(text) ? `'${text}` : text;
}
