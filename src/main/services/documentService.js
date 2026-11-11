import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DOCUMENT_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".xlsx", ".xls", ".csv"]);

export function createDocumentService(deps) {
  const { auditLog, projectRoot } = deps;

  function sanitizeFilePart(value) {
    return String(value || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file";
  }

  function assertSafeFileContent(extension, bytes) {
    const header = bytes.subarray(0, 8);
    const ascii = bytes.subarray(0, 512).toString("utf8");
    const isZip = header[0] === 0x50 && header[1] === 0x4b;
    const isPdf = ascii.startsWith("%PDF");
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    const isJpeg = header[0] === 0xff && header[1] === 0xd8;
    const isXls = header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0;
    const isText = !bytes.subarray(0, Math.min(bytes.length, 2048)).includes(0);
    const allowed = {
      ".pdf": isPdf,
      ".png": isPng,
      ".jpg": isJpeg,
      ".jpeg": isJpeg,
      ".xlsx": isZip,
      ".csv": isText,
      ".xls": isXls
    };
    if (!allowed[extension]) throw new Error("Uploaded file content does not match the permitted file type");
  }

  function uploadDocument(db, payload, root = projectRoot()) {
    const sourcePath = payload.source_path;
    if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("Selected file was not found");
    const extension = path.extname(sourcePath).toLowerCase();
    if (!DOCUMENT_EXTENSIONS.has(extension)) throw new Error("Unsupported file type");
    const stat = fs.statSync(sourcePath);
    const bytes = fs.readFileSync(sourcePath);
    assertSafeFileContent(extension, bytes);
    const fileHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const originalFileName = path.basename(sourcePath);
    const moduleName = sanitizeFilePart(payload.linked_module || "documents");
    const year = new Date().getFullYear().toString();
    const companyId = Number(payload.company_id || 0) || null;
    if (!companyId) throw new Error("Company context is required before uploading documents.");
    const targetDir = path.join(root, "documents", String(companyId || "common"), moduleName, year);
    fs.mkdirSync(targetDir, { recursive: true });
    const storedFileName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${sanitizeFilePart(path.basename(originalFileName, extension))}${extension}`;
    const targetPath = path.join(targetDir, storedFileName);
    fs.copyFileSync(sourcePath, targetPath);
    const result = db.prepare(`
      INSERT INTO documents (company_id, linked_module, linked_record_id, document_type, original_file_name, stored_file_name, file_path, file_extension, file_size, file_hash, uploaded_by, remarks, status)
      VALUES (@company_id, @linked_module, @linked_record_id, @document_type, @original_file_name, @stored_file_name, @file_path, @file_extension, @file_size, @file_hash, @uploaded_by, @remarks, 'active')
    `).run({
      company_id: companyId,
      linked_module: payload.linked_module,
      linked_record_id: payload.linked_record_id || null,
      document_type: payload.document_type || "Supporting Document",
      original_file_name: originalFileName,
      stored_file_name: storedFileName,
      file_path: targetPath,
      file_extension: extension,
      file_size: stat.size,
      file_hash: fileHash,
      uploaded_by: payload.uploaded_by || null,
      remarks: payload.remarks || ""
    });
    auditLog(db, { company_id: companyId, user_id: payload.uploaded_by || null, action: "document upload", table_name: "documents", record_id: result.lastInsertRowid, new_value: JSON.stringify({ module: payload.linked_module, fileName: originalFileName, size: stat.size }) });
    return db.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid);
  }

  function listDocuments(db, filters = {}) {
    const companyId = Number(filters.company_id || 0);
    const recordId = Number(filters.linked_record_id || 0);
    const rows = db.prepare(`
      SELECT *
      FROM documents
      WHERE status = 'active' AND deleted_at IS NULL
        AND (@module = '' OR linked_module = @module)
        AND (@company_id = 0 OR company_id = @company_id)
        AND (@record_id = 0 OR linked_record_id = @record_id)
      ORDER BY uploaded_at DESC, id DESC
    `).all({ module: filters.module || "", company_id: companyId, record_id: recordId });
    return rows;
  }

  function deleteDocument(db, id, context = {}) {
    const doc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(id);
    if (!doc) throw new Error("Document not found or already deleted");
    db.prepare("UPDATE documents SET status = 'deleted', deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog(db, { company_id: doc.company_id, user_id: context.user_id || null, action: "document delete", table_name: "documents", record_id: id, old_value: JSON.stringify({ fileName: doc.original_file_name, filePath: doc.file_path }) });
    return { id, status: "deleted" };
  }

  function replaceDocument(db, payload, root = projectRoot(), context = {}) {
    const oldId = payload.replace_document_id;
    if (!oldId) throw new Error("replace_document_id is required");
    const oldDoc = db.prepare("SELECT * FROM documents WHERE id = ? AND status = 'active' AND deleted_at IS NULL").get(oldId);
    if (!oldDoc) throw new Error("Original document not found");
    const newDoc = uploadDocument(db, { ...payload, company_id: oldDoc.company_id }, root);
    db.prepare("UPDATE documents SET status = 'replaced' WHERE id = ?").run(oldId);
    auditLog(db, { company_id: oldDoc.company_id, user_id: context.user_id || payload.uploaded_by || null, action: "document replace", table_name: "documents", record_id: oldId, old_value: JSON.stringify({ fileName: oldDoc.original_file_name }), new_value: JSON.stringify({ newId: newDoc.id, fileName: newDoc.original_file_name }) });
    return { old: { id: oldId, status: "replaced" }, new: newDoc };
  }

  return { uploadDocument, listDocuments, deleteDocument, replaceDocument };
}
