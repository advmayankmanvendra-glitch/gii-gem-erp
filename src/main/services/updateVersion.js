import path from "node:path";

// A portable EXE runs on its own and never replaces the installed app, so only
// Setup installers count as updates.
export function isPortableInstaller(fileName = "") {
  return /^GII-GeM-ERP-Portable-/i.test(path.basename(String(fileName)));
}

// Semantic-version order: 1.2.10 > 1.2.9, and a release (0.2.0) is newer than its
// pre-release (0.2.0-beta). Returns >0 when left is newer.
export function compareUpdateVersions(left = "", right = "") {
  const split = (value) => {
    const [core, ...pre] = String(value).trim().replace(/^v/i, "").split("-");
    return { core: core.split(".").map((part) => Number.parseInt(part, 10) || 0), pre: pre.join("-") };
  };
  const a = split(left);
  const b = split(right);
  for (let index = 0; index < Math.max(a.core.length, b.core.length, 3); index += 1) {
    const delta = (a.core[index] || 0) - (b.core[index] || 0);
    if (delta !== 0) return delta;
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  const aIds = a.pre.split(".");
  const bIds = b.pre.split(".");
  for (let index = 0; index < Math.max(aIds.length, bIds.length); index += 1) {
    if (aIds[index] === undefined) return -1;
    if (bIds[index] === undefined) return 1;
    const aNum = /^\d+$/.test(aIds[index]);
    const bNum = /^\d+$/.test(bIds[index]);
    if (aNum && bNum && Number(aIds[index]) !== Number(bIds[index])) return Number(aIds[index]) - Number(bIds[index]);
    if (aNum !== bNum) return aNum ? -1 : 1;
    if (aIds[index] !== bIds[index]) return aIds[index] < bIds[index] ? -1 : 1;
  }
  return 0;
}
