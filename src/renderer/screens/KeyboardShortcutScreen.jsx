import React, { useState } from "react";
import { keyboardShortcuts as standardShortcuts, moduleKeys as standardModules } from "../config/keyboardShortcuts.js";
import { tallyKeyboardShortcuts } from "../config/keyLayout.js";

const keyboardShortcuts = [...standardShortcuts, ...tallyKeyboardShortcuts];
const moduleKeys = [...standardModules, "Tally Key Layout"];
import { sortOptions } from "../utils/optionSorting.js";

export function KeyboardShortcutScreen({ onNavigate }) {
  const [search, setSearch] = useState("");
  const [activeModule, setActiveModule] = useState("");

  const filtered = keyboardShortcuts.filter((s) => {
    if (activeModule && s.module !== activeModule) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.keys.toLowerCase().includes(q) || s.action.toLowerCase().includes(q) || s.module.toLowerCase().includes(q);
  });

  return (
    <section className="panel settings-panel report-panel">
      <div className="panel-head">
        <div>
          <h2>Keyboard Shortcuts</h2>
          <p>Complete keyboard guide for desktop ERP operation. {keyboardShortcuts.length} shortcuts documented.</p>
        </div>
        <button type="button" className="ghost-btn" onClick={() => onNavigate && onNavigate("help_training")}>Help & Training</button>
      </div>
      <div className="toolbar-controls" style={{ margin: "0 16px", flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder="Search by key, action or module..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-search-input
          style={{ minWidth: 280 }}
        />
        <select value={activeModule} onChange={(e) => setActiveModule(e.target.value)}>
          <option value="">All Modules</option>
          {sortOptions(moduleKeys).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="filter-count">{filtered.length} shortcut(s)</span>
      </div>
      <div className="shortcut-grid" style={{ margin: "0 16px 16px" }}>
        {filtered.length ? (
          (activeModule ? [activeModule] : moduleKeys).map((mod) => {
            const items = filtered.filter((s) => s.module === mod);
            if (!items.length) return null;
            return (
              <div className="shortcut-group" key={mod}>
                <h3>{mod}</h3>
                {items.map((s) => (
                  <div className="shortcut-row" key={s.keys + s.action}>
                    <kbd>{s.keys}</kbd>
                    <span>{s.action}</span>
                  </div>
                ))}
              </div>
            );
          })
        ) : (
          <div className="empty-state" style={{ gridColumn: "1 / -1" }}>
            <strong>No shortcuts match</strong>
            <span>Try a different search term or clear the filter.</span>
          </div>
        )}
      </div>
    </section>
  );
}
