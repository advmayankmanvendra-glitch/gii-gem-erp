import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateReadinessScore } from "./readinessService.js";

function zeroPad(num, width) {
  return String(num).padStart(width, "0");
}

function historyFilePath(runtimeRoot) {
  const dir = path.join(runtimeRoot, "deployment");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "certificate-history.json");
}

function readHistory(runtimeRoot) {
  const filePath = historyFilePath(runtimeRoot);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch { /* return empty */ }
  return { nextId: 1, certificates: [] };
}

function writeHistory(runtimeRoot, history) {
  const filePath = historyFilePath(runtimeRoot);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

function projectRoot() {
  return path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
}

function versionFromPackage() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot(), "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function gitCommit() {
  try {
    const headPath = path.join(projectRoot(), ".git", "HEAD");
    if (!fs.existsSync(headPath)) return "unknown";
    const rev = fs.readFileSync(headPath, "utf8").trim();
    if (rev.startsWith("ref: ")) {
      const refPath = path.join(projectRoot(), ".git", rev.slice(5));
      if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, "utf8").trim().slice(0, 12);
      }
    }
    return rev.slice(0, 12);
  } catch {
    return "unknown";
  }
}

function getDbVersion(db) {
  try {
    const row = db.prepare("SELECT sqlite_version() as ver").get();
    return row?.ver || "unknown";
  } catch {
    return "unknown";
  }
}

export function generateGoLiveCertificate(db, runtimeRoot, userId) {
  const readiness = calculateReadinessScore(db, runtimeRoot);
  const history = readHistory(runtimeRoot);
  const certId = zeroPad(history.nextId, 6);
  const certNumber = `GLC-2026-${certId}`;
  const now = new Date();
  const companyCount = db.prepare("SELECT COUNT(*) count FROM companies WHERE COALESCE(is_deleted,0)=0").get()?.count || 0;

  const certificate = {
    certificateNumber: certNumber,
    certificateId: history.nextId,
    generatedAt: now.toISOString(),
    generatedDate: now.toLocaleDateString(),
    generatedTime: now.toLocaleTimeString(),
    erpVersion: versionFromPackage(),
    gitCommit: gitCommit(),
    dbVersion: getDbVersion(db),
    issuedBy: userId || "system",
    companyCount,
    readiness,
    verificationProfile: process.env.VERIFY_PROFILE || "Development"
  };

  const reportDir = path.join(runtimeRoot, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `go-live-certificate-${certId}.md`);

  const reportLines = [
    `# GII GeM ERP — Go-Live Certificate ${certNumber}`,
    "",
    `**Date:** ${certificate.generatedDate} ${certificate.generatedTime}`,
    `**ERP Version:** ${certificate.erpVersion}`,
    `**Git Commit:** ${certificate.gitCommit}`,
    `**Database Version:** ${certificate.dbVersion}`,
    `**Verification Profile:** ${certificate.verificationProfile}`,
    `**Issued By:** ${certificate.issuedBy}`,
    "",
    "## Readiness Status",
    "",
    `**${readiness.status}** — Score: ${readiness.score}%`,
    "",
  ];

  for (const [key, cat] of Object.entries(readiness.categories)) {
    reportLines.push(`## ${key.charAt(0).toUpperCase() + key.slice(1)} Readiness (${cat.score.score}%)`, "");
    for (const check of cat.checks) {
      reportLines.push(`- ${check.passed ? "✓" : "✗"} ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
    }
    reportLines.push("");
  }

  fs.writeFileSync(reportPath, reportLines.join("\n"));

  history.certificates.unshift({
    certificateNumber: certNumber,
    generatedAt: now.toISOString(),
    generatedDate: certificate.generatedDate,
    environment: readiness.status,
    readinessScore: readiness.score,
    issuedBy: certificate.issuedBy,
    status: readiness.status
  });
  history.nextId += 1;
  writeHistory(runtimeRoot, history);

  return { certificate, reportPath };
}

export function getCertificateHistory(runtimeRoot) {
  const history = readHistory(runtimeRoot);
  return history.certificates;
}

export { readHistory as _readHistory, writeHistory as _writeHistory };