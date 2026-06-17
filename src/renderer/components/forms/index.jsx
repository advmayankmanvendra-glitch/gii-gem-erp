import React, { useEffect, useRef, useState } from "react";

export function SelectField({ label, value, onChange, options }) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const valueLabel = Array.isArray(option) ? option : [option, option];
          return <option key={valueLabel[0]} value={valueLabel[0]}>{valueLabel[1]}</option>;
        })}
      </select>
    </label>
  );
}

export function SelectBox({ label, value, onChange, options }) {
  return (
    <label className="field">
      {label}
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </label>
  );
}

export function SearchableSelect({ label, value, onChange, options = [], placeholder = "Search or select", disabled = false, onKeyDown, onQuickCreate }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const focusedRef = useRef(false);
  const selected = options.find(([id]) => String(id) === String(value));
  const displayValue = open ? query : selected?.[1] || "";
  const filtered = options
    .filter(([, text, note]) => `${text || ""} ${note || ""}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);

  useEffect(() => {
    if (!onQuickCreate) return undefined;
    function onQuickCreateShortcut() {
      if (focusedRef.current && !disabled) onQuickCreate();
    }
    window.addEventListener("gii-gem-quick-create", onQuickCreateShortcut);
    return () => window.removeEventListener("gii-gem-quick-create", onQuickCreateShortcut);
  }, [onQuickCreate, disabled]);

  return (
    <label className="field searchable-field" onBlur={() => window.setTimeout(() => { focusedRef.current = false; setOpen(false); setQuery(""); }, 120)}>
      {label}
      <input
        value={displayValue}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          focusedRef.current = true;
          setQuery("");
          setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        onKeyDown={(event) => {
          if (event.key === "F10" && onQuickCreate) {
            event.preventDefault();
            onQuickCreate();
            return;
          }
          onKeyDown?.(event);
        }}
      />
      {!disabled && open && (
        <div className="searchable-options">
          <button type="button" onMouseDown={(event) => { event.preventDefault(); onChange(""); setQuery(""); setOpen(false); }}>Clear</button>
          {filtered.length ? filtered.map(([id, text, note]) => (
            <button
              type="button"
              key={id}
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(id);
                setQuery("");
                setOpen(false);
              }}
            >
              <span>{text}</span>
              {note ? <small>{note}</small> : null}
            </button>
          )) : <span className="searchable-empty">No match</span>}
        </div>
      )}
    </label>
  );
}

export function ReadOnlyBox({ label, value }) {
  return (
    <label className="field readonly-field">
      {label}
      <span>{value || "-"}</span>
    </label>
  );
}

export function MetricLine({ label, value }) {
  return <div className="metric-line"><span>{label}</span><strong>{value}</strong></div>;
}

export function Field({ name, label, type, value, onChange }) {
  if (type === "textarea") {
    return <label className="field wide">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} /></label>;
  }
  if (type === "status") {
    return (
      <label className="field">
        {label}
        <select value={value || "active"} onChange={(event) => onChange(event.target.value)}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
    );
  }
  if (type === "calculation") {
    return (
      <label className="field">
        {label}
        <select value={value || "percentage_gross"} onChange={(event) => onChange(event.target.value)}>
          <option value="percentage_gross">Percentage of Gross Bill</option>
          <option value="percentage_taxable">Percentage of Taxable Bill</option>
          <option value="fixed">Fixed Amount</option>
        </select>
      </label>
    );
  }
  if (type === "checkbox") {
    return (
      <label className="field checkbox-field">
        <input type="checkbox" checked={Boolean(Number(value || 0))} onChange={(event) => onChange(event.target.checked ? 1 : 0)} />
        <span>{label}</span>
      </label>
    );
  }
  return <label className="field">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function FormRow({ children, className = "" }) {
  return <div className={['form-row', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function FormSection({ title, note, children, className = "" }) {
  return (
    <section className={['form-section', className].filter(Boolean).join(' ')}>
      {(title || note) && <SectionHeader title={title} note={note} />}
      {children}
    </section>
  );
}

export function FormActions({ children, className = "" }) {
  return <div className={['button-row form-actions', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function StatusBadge({ status, className = "status-pill" }) {
  const label = status || 'Draft';
  const normalized = String(label).toLowerCase().replaceAll(' ', '-');
  return <span className={`${className} ${normalized}`}>{label}</span>;
}

export function FilterBar({ children, className = "" }) {
  return <div className={['toolbar-controls filter-bar', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function ReportDateFilters({ companyId, companies = [], dateFrom, dateTo, onCompanyChange, onDateFromChange, onDateToChange }) {
  return (
    <>
      {onCompanyChange && (
        <select value={companyId || ""} onChange={(event) => onCompanyChange(event.target.value)}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
        </select>
      )}
      {onDateFromChange && <input type="date" value={dateFrom || ""} onChange={(event) => onDateFromChange(event.target.value)} />}
      {onDateToChange && <input type="date" value={dateTo || ""} onChange={(event) => onDateToChange(event.target.value)} />}
    </>
  );
}

export function ReportSelectFilter({ value, onChange, options = [], placeholderLabel, placeholderValue = "" }) {
  return (
    <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
      {placeholderLabel !== undefined && <option value={placeholderValue}>{placeholderLabel}</option>}
      {options.map((option) => {
        const [optionValue, optionLabel] = Array.isArray(option) ? option : [option.value, option.label];
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
      })}
    </select>
  );
}

export function ReportActionButtons({ onExport, onPrint, exportLabel = "Export", printLabel = "Print" }) {
  return (
    <>
      {onExport && <button className="ghost-btn" type="button" onClick={onExport}>{exportLabel}</button>}
      {onPrint && <button className="ghost-btn" type="button" onClick={onPrint}>{printLabel}</button>}
    </>
  );
}

export function ReportToolbar({ title, note, children, className = "" }) {
  return (
    <div className={['records-toolbar report-toolbar', className].filter(Boolean).join(' ')}>
      <div>
        {title && <h2>{title}</h2>}
        {note && <span>{note}</span>}
      </div>
      {children && <div className="toolbar-controls">{children}</div>}
    </div>
  );
}

export function ViewTabs({ tabs = [], active, onChange, className = "view-tabs" }) {
  return (
    <div className={className}>
      {tabs.map((tab) => (
        <button key={tab.key} type="button" className={active === tab.key ? "active" : ""} onClick={() => onChange?.(tab.key)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SimpleActionBar({ children, className = "" }) {
  return <div className={['button-row simple-action-bar', className].filter(Boolean).join(' ')}>{children}</div>;
}

export function CardHeader({ title, note, action }) {
  return (
    <div className="card-header">
      <div>
        {title && <h3>{title}</h3>}
        {note && <p>{note}</p>}
      </div>
      {action || null}
    </div>
  );
}

export function SectionHeader({ title, note }) {
  return (
    <div className="section-header">
      {title && <h2>{title}</h2>}
      {note && <span>{note}</span>}
    </div>
  );
}

export function InfoBanner({ title, message, children }) {
  return <div className="info-banner">{title && <strong>{title}</strong>}{message && <span>{message}</span>}{children}</div>;
}

export function WarningBanner({ title, message, children }) {
  return <div className="warning-banner">{title && <strong>{title}</strong>}{message && <span>{message}</span>}{children}</div>;
}
