import React, { useEffect, useState } from "react";
import { EmptyState } from "../common.jsx";

export function ModalBackdrop({ children, className = "", dataEscClose = false }) {
  const escCloseProps = dataEscClose ? { "data-esc-close": "true" } : {};
  return (
    <div className={["modal-backdrop", className].filter(Boolean).join(" ")} role="presentation" {...escCloseProps}>
      {children}
    </div>
  );
}

export function ModalPanel({ children, className, labelledBy }) {
  const labelledByProps = labelledBy ? { "aria-labelledby": labelledBy } : {};
  return (
    <section className={className} role="dialog" aria-modal="true" {...labelledByProps}>
      {children}
    </section>
  );
}

export function AlertPanel({ title, message, titleId = "confirm-title" }) {
  return (
    <>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
    </>
  );
}

export function ReasonEntry({ label, placeholder, value, onChange }) {
  return (
    <label className="confirm-reason">
      {label || "Reason"}
      <textarea value={value} placeholder={placeholder || "Enter reason"} onChange={(event) => onChange(event.target.value)} autoFocus />
    </label>
  );
}

export function ModalActions({ children, className = "confirm-actions" }) {
  return <div className={className}>{children}</div>;
}

export function ConfirmationActions({ dialog, canConfirm, onCancel, onConfirm }) {
  return (
    <ModalActions>
      {!dialog.hideCancel && <button type="button" className="ghost-btn" onClick={onCancel}>{dialog.cancelLabel || "No"}</button>}
      <button type="button" className={dialog.mode === "danger" ? "primary-btn danger" : "primary-btn"} disabled={!canConfirm} onClick={onConfirm}>{dialog.confirmLabel || "Yes"}</button>
    </ModalActions>
  );
}

export function PrintPreviewDialog({ preview, onClose, notify, desktopApi }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printPreviewContent();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function printPreviewContent() {
    if (desktopApi?.printHtml) {
      try {
        const result = await desktopApi.printHtml(preview);
        if (result?.success) {
          notify?.("Print job sent");
        } else if (result?.failureReason) {
          notify?.(`Print cancelled: ${result.failureReason}`, "warning");
        } else {
          notify?.("Print cancelled", "warning");
        }
        return;
      } catch (error) {
        notify?.(error.message || "Desktop print failed", "error");
      }
    }
    document.body.classList.add("erp-printing");
    const cleanup = () => document.body.classList.remove("erp-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 1500);
    }, 50);
  }

  async function savePreviewPdf() {
    if (!desktopApi?.savePrintPdf) {
      notify?.("PDF export requires the Windows desktop app.", "warning");
      return;
    }
    try {
      const result = await desktopApi.savePrintPdf(preview);
      if (result?.success) notify?.(`PDF saved: ${result.filePath}`);
      else if (result?.canceled) notify?.("PDF export cancelled", "warning");
      else notify?.("PDF export was not completed", "warning");
    } catch (error) {
      notify?.(error.message || "PDF export failed", "error");
    }
  }

  return (
    <ModalBackdrop className="print-preview-backdrop" dataEscClose>
      <ModalPanel className="print-preview-dialog">
        <div className="print-preview-toolbar">
          <div>
            <h2>Print Preview</h2>
            <p>{preview.breadcrumb}</p>
          </div>
          <div className="button-row">
            <button type="button" className="primary-btn" onClick={printPreviewContent}>Print</button>
            <button type="button" className="ghost-btn" onClick={savePreviewPdf}>Save PDF</button>
            <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
          </div>
        </div>
        <article className="print-preview-page">
          <header className="print-page-header">
            <div>
              <strong>GII GeM ERP</strong>
              <h1>{preview.title}</h1>
              <p>{preview.subtitle}</p>
            </div>
            <div>
              <span>{preview.generatedAt}</span>
              <small>{preview.breadcrumb}</small>
            </div>
          </header>
          <div className="print-page-content" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </article>
      </ModalPanel>
    </ModalBackdrop>
  );
}

export function ConfirmDialog({ dialog, onResolve }) {
  const [reason, setReason] = useState("");
  const needsReason = Boolean(dialog.requireReason);
  const canConfirm = !needsReason || reason.trim();
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onResolve({ confirmed: false, reason: "" });
      }
      if (event.key === "Enter" && canConfirm && (!needsReason || event.ctrlKey || document.activeElement?.tagName !== "TEXTAREA")) {
        event.preventDefault();
        dialog.onConfirm?.();
        onResolve({ confirmed: true, reason: reason.trim() });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canConfirm, dialog, needsReason, onResolve, reason]);
  return (
    <ModalBackdrop>
      <ModalPanel className={`confirm-dialog ${dialog.mode || "normal"}`} labelledBy="confirm-title">
        <AlertPanel title={dialog.title} message={dialog.message} />
        {needsReason && <ReasonEntry label={dialog.reasonLabel} placeholder={dialog.reasonPlaceholder} value={reason} onChange={setReason} />}
        <ConfirmationActions
          dialog={dialog}
          canConfirm={canConfirm}
          onCancel={() => onResolve({ confirmed: false, reason: "" })}
          onConfirm={() => {
            dialog.onConfirm?.();
            onResolve({ confirmed: true, reason: reason.trim() });
          }}
        />
      </ModalPanel>
    </ModalBackdrop>
  );
}

export function GlobalSearchOverlay({ query, setQuery, results, onNavigate, onClose }) {
  const firstResult = results.find((group) => group.items.length)?.items[0];
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Enter" && firstResult) {
        event.preventDefault();
        onNavigate(firstResult.key);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [firstResult, onClose, onNavigate]);
  return (
    <ModalBackdrop>
      <ModalPanel className="global-search-dialog">
        <div className="panel-head">
          <div>
            <h2>Global Search</h2>
            <p>Search orders, invoices, suppliers, departments, items, vouchers, inventory, payments and reports.</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>
        <input className="global-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ERP..." autoFocus />
        <div className="global-search-results">
          {results.some((group) => group.items.length) ? results.map((group) => group.items.length ? (
            <div className="search-result-group" key={group.label}>
              <strong>{group.label}</strong>
              {group.items.map((item) => (
                <button type="button" key={`${group.label}-${item.key}-${item.id || item.label}`} onClick={() => onNavigate(item.key)}>
                  <span>{item.label}</span>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          ) : null) : <EmptyState title="No matching ERP records" note="Try order number, invoice number, supplier, item, voucher or report name." />}
        </div>
      </ModalPanel>
    </ModalBackdrop>
  );
}
