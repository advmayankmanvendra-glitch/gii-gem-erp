// Regenerates docs/audit/in-house-audits-2026-10/manifest.json after a new audit report is
// added. Reports are never edited; this only records the size and SHA-256 of each file.
// Usage: node scripts/update-audit-manifest.js
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const folder = "docs/audit/in-house-audits-2026-10";
// Only the folder's own README and the manifest itself are left out.
export const UNLISTED = new Set([`${folder}/README.md`, `${folder}/manifest.json`]);

export function archiveFiles(base = root) {
  return readdirSync(join(base, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, join(entry.parentPath ?? entry.path, entry.name)).split(sep).join("/"))
    .filter((path) => !UNLISTED.has(path))
    .sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = archiveFiles().map((path) => {
    const bytes = readFileSync(join(root, path));
    return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase() };
  });
  const manifest = {
    manifestVersion: "1.0.0",
    purpose: "Checksums of the preserved in-house audit reports (October to November 2026). A report is never edited after it is preserved; a later audit is added as a new file.",
    count: entries.length,
    entries
  };
  writeFileSync(join(root, folder, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${entries.length} reports listed in ${folder}/manifest.json`);
}
