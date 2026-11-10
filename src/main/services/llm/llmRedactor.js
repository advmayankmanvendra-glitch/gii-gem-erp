// LLM-011: sensitive values are removed before anything leaves the ERP.
// Works on any JSON-shaped value. Keys that name secrets are dropped outright;
// strings that look like secrets are masked wherever they appear.

// Keys are split into words (snake_case, kebab-case, camelCase) and matched
// word by word, so "shipping_address" is not mistaken for a PIN field.
const SECRET_WORDS = new Set(["password", "passwd", "pass", "secret", "token", "apikey", "authorization", "cookie", "session", "privatekey", "otp", "pin", "mpin", "recovery", "hash", "salt", "credential", "credentials"]);
const BANK_WORDS = new Set(["accountno", "accountnumber", "accno", "ifsc", "iban", "swift", "upi"]);
const PATH_WORDS = new Set(["dbpath", "databasefile", "filepath", "dataroot"]);

function keyWords(key) {
  const words = String(key).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const pairs = words.slice(1).map((word, index) => words[index] + word);
  return [...words, ...pairs];
}
const keyHits = (key, set) => keyWords(key).some((word) => set.has(word));

const VALUE_PATTERNS = [
  { name: "API_KEY", re: /\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g },
  { name: "API_KEY", re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g },
  { name: "BEARER", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: "PRIVATE_KEY", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "AADHAAR", re: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g },
  { name: "CARD", re: /\b(?:\d[ -]?){15,16}\b/g },
  { name: "DB_FILE", re: /[A-Za-z]:\\[^\s"']*\.(db|sqlite3?)\b|\/[^\s"']*\.(db|sqlite3?)\b/gi }
];

export function redactText(text, stats = { masked: 0, kinds: new Set() }) {
  let out = String(text);
  for (const { name, re } of VALUE_PATTERNS) {
    out = out.replace(re, () => {
      stats.masked += 1;
      stats.kinds.add(name);
      return `[REDACTED:${name}]`;
    });
  }
  return out;
}

export function redact(value, { allowBankFields = false } = {}) {
  const stats = { masked: 0, droppedKeys: 0, kinds: new Set() };
  const walk = (node, depth) => {
    if (depth > 12) return "[TRUNCATED]";
    if (typeof node === "string") return redactText(node, stats);
    if (Array.isArray(node)) return node.map((item) => walk(item, depth + 1));
    if (node && typeof node === "object") {
      const out = {};
      for (const [key, child] of Object.entries(node)) {
        if (keyHits(key, SECRET_WORDS) || keyHits(key, PATH_WORDS) || (!allowBankFields && keyHits(key, BANK_WORDS))) {
          stats.droppedKeys += 1;
          stats.kinds.add("FIELD");
          continue;
        }
        out[key] = walk(child, depth + 1);
      }
      return out;
    }
    return node;
  };
  const result = walk(value, 0);
  return { value: result, stats: { masked: stats.masked, droppedKeys: stats.droppedKeys, kinds: [...stats.kinds].sort() } };
}
