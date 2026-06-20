import React from "react";

export function CRACDocumentPanel({ documents, onUpload, onView, onDownload }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h3>CRAC Documents</h3><span>{documents.length} document(s)</span></div>
        {onUpload && <button type="button" className="ghost-btn" onClick={onUpload}>Upload CRAC</button>}
      </div>
      {documents.length ? (
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr><th>File Name</th><th>Type</th><th>Uploaded</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.original_file_name}</td>
                  <td>{doc.document_type}</td>
                  <td>{new Date(doc.uploaded_at).toLocaleDateString("en-IN")}</td>
                  <td>
                    <div className="button-row">
                      {onView && <button type="button" className="ghost-btn" onClick={() => onView(doc)}>View</button>}
                      {onDownload && <button type="button" className="ghost-btn" onClick={() => onDownload(doc)}>Download</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state compact"><strong>No Documents</strong><span>Upload CRAC documents to link them to this record.</span></div>
      )}
    </section>
  );
}
