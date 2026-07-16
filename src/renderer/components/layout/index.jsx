import React, { useState } from "react";
import { flatNavItems } from "../../config/navigation.js";
import { Icon } from "../common.jsx";
import FeedbackLogPanel from "../../features/feedback/FeedbackLogPanel.jsx";

export function NavigationSidebar({
  compactSidebar,
  navSearch,
  onNavSearchChange,
  onToggleCompact,
  view,
  effectiveView,
  searchedGroups,
  expandedGroups,
  onSetExpandedGroups,
  recentScreens,
  favorites,
  onNavigate,
  onFavorite
}) {
  const safeGroups = Array.isArray(searchedGroups) ? searchedGroups : [];
  const safeRecentScreens = Array.isArray(recentScreens) ? recentScreens : [];
  const safeFavorites = Array.isArray(favorites) ? favorites : [];

  return (
    <aside className={`sidebar ${compactSidebar ? "compact" : ""}`}>
      <div className="brand">
        <div className="brand-mark">G</div>
        <div>
          <strong>GII GeM ERP</strong>
          <span>Government Supply ERP</span>
        </div>
      </div>
      <div className="sidebar-tools">
        <input value={navSearch} onChange={(event) => onNavSearchChange(event.target.value)} placeholder="Search menu" />
        <button type="button" title="Toggle compact sidebar" onClick={onToggleCompact}>
          <Icon name={compactSidebar ? "menu" : "collapse"} />
        </button>
      </div>
      <nav className="nav grouped-nav">
        <div className="nav-dashboard-link">
          <button type="button" className={view === "dashboard" ? "active" : ""} title="Dashboard" onClick={() => onNavigate("dashboard")}>
            <Icon name="grid" />
            <span>Dashboard</span>
          </button>
        </div>
        {safeGroups.map((group) => {
          const isExpanded = Boolean(navSearch) || expandedGroups[group.id];
          const groupItems = Array.isArray(group.items) ? group.items : [];
          const groupActive = groupItems.some(([key]) => key === view || key === effectiveView);
          return (
            <div className={`nav-group ${isExpanded ? "expanded" : ""}`} key={group.id}>
              <button type="button" className={`nav-group-trigger ${groupActive ? "active-group" : ""} ${isExpanded ? "expanded-group" : ""}`} title={group.label} onClick={() => onSetExpandedGroups((current) => { if (current[group.id]) { const next = { ...current }; delete next[group.id]; return next; } return { [group.id]: true }; })}>
                <Icon name={group.icon} />
                <span>{group.label}</span>
                <strong>{isExpanded ? "-" : "+"}</strong>
              </button>
              {isExpanded && (
                <div className="nav-children">
                  {(group.sections || [{ id: "default", label: "", items: groupItems }]).map((section) => {
                    const sectionKey = `${group.id}:${section.id}`;
                    const sectionItems = Array.isArray(section.items) ? section.items : [];
                    const sectionActive = sectionItems.some(([key]) => key === view || key === effectiveView);
                    const sectionExpanded = !section.label || Boolean(navSearch) || (expandedGroups[sectionKey] !== undefined ? expandedGroups[sectionKey] : sectionActive);
                    return (
                      <div className={`nav-subgroup ${sectionExpanded ? "expanded" : ""}`} key={sectionKey}>
                        {section.label && (
                          <button type="button" className={`nav-subgroup-trigger ${sectionActive ? "active-subgroup" : ""}`} title={`${group.label} > ${section.label}`} onClick={() => onSetExpandedGroups((current) => ({ ...Object.fromEntries(Object.entries(current).filter(([k]) => k === group.id || k.startsWith(`${group.id}:`))), [group.id]: true, [sectionKey]: !current[sectionKey] }))}>
                            <span>{section.label}</span>
                            <strong>{sectionExpanded ? "-" : "+"}</strong>
                          </button>
                        )}
                        {sectionExpanded && sectionItems.map(([key, label]) => (
                          <div className="nav-child-row" key={key}>
                            <button type="button" className={view === key ? "active" : ""} title={`${group.label} > ${section.label ? `${section.label} > ` : ""}${label}`} onClick={() => onNavigate(key)}>
                              <span>{label}</span>
                            </button>
                            <button type="button" className={`favorite-pin ${safeFavorites.includes(key) ? "pinned" : ""}`} title={safeFavorites.includes(key) ? "Remove favorite" : "Add favorite"} onClick={() => onFavorite(key)}>*</button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {safeRecentScreens.length > 0 && <NavQuickSection title="Recent" items={safeRecentScreens} current={view} compact={compactSidebar} onNavigate={onNavigate} onFavorite={onFavorite} />}
        {safeFavorites.length > 0 && <NavQuickSection title="Favorites" items={safeFavorites} current={view} compact={compactSidebar} onNavigate={onNavigate} onFavorite={onFavorite} />}
      </nav>
      <div className="version">v0.4.0 - Accounting Controls</div>
    </aside>
  );
}

export function WorkspaceFrame({ breadcrumb, title, subtitle, canGoBack, onBack, onToggleMobileSidebar, children }) {
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="topbar-nav-actions">
          <button className="hamburger" type="button" onClick={onToggleMobileSidebar} title="Open menu">
            <Icon name="menu" />
          </button>
          {canGoBack && (
            <button className="workspace-back-btn" type="button" onClick={onBack} title="Return to previous screen (Alt + Left Arrow)">
              <Icon name="undo" />
              <span>Back</span>
              <kbd className="workspace-back-shortcut">Alt+←</kbd>
            </button>
          )}
        </div>
        <div>
          <div className="breadcrumb">{breadcrumb}</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {children}
    </main>
  );
}

export function RightUtilitySidebar({
  collapsed,
  onToggle,
  session,
  trainingMode,
  onHelp,
  onHelpAssistant,
  onLearnThisScreen,
  onTraining,
  onLogout,
  companies,
  companyContext,
  currentCompanyId,
  adminUser,
  onCompanyChange,
  onCreateCompany,
  onAlterCompany,
  onSettings,
  onShortcutPanelToggle,
  productivityPanel,
  extension,
  api
}) {
  const [showFeedback, setShowFeedback] = useState(false);
  const safeCompanies = Array.isArray(companies) ? companies : [];

  if (collapsed) {
    return (
      <aside className="right-utility-sidebar compact" aria-label="Utilities sidebar">
        <button type="button" className="utility-toggle" onClick={onToggle} title="Expand utilities sidebar">+</button>
        <button type="button" className="utility-compact-action" onClick={onHelp} title="Screen Guidance">?</button>
        <button type="button" className="utility-compact-action" onClick={onLearnThisScreen} title="Learn This Screen">Lr</button>
        <button type="button" className="utility-compact-action" onClick={onHelpAssistant} title="Ask ERP Help">A</button>
        <button type="button" className={`utility-compact-action ${trainingMode ? "active" : ""}`} onClick={onTraining} title={trainingMode ? "Training Mode On" : "Training"}>T</button>
        <button type="button" className="utility-compact-action" onClick={onSettings} title={companyContext.company_name || "Company Settings"}>Co</button>
        <button type="button" className="utility-compact-action" onClick={onShortcutPanelToggle} title="Productivity Panel">P</button>
        <button type="button" className="utility-compact-action" onClick={() => setShowFeedback(true)} title="Feedback & Improvement Log">F</button>
        <button type="button" className="utility-compact-action" onClick={onLogout} title="Logout">L</button>
      </aside>
    );
  }

  return (
    <aside className="right-utility-sidebar" aria-label="Utilities sidebar">
      <div className="utility-head">
        <div>
          <strong>Utilities</strong>
          <span>Company, user, and productivity tools</span>
        </div>
        <button type="button" className="utility-toggle" onClick={onToggle} title="Compact utilities sidebar">-</button>
      </div>

      <div className="utility-section utility-actions">
        <button type="button" className="ghost-btn help-btn" title="Open screen-specific guidance for the current module" onClick={onHelp}>
          <Icon name="help" />
          <span>Screen Help</span>
        </button>
        <button type="button" className="ghost-btn help-btn" title="Learn the current screen's purpose, workflow, common mistakes, and related reports" onClick={onLearnThisScreen}>
          <Icon name="book" />
          <span>Learn This Screen</span>
        </button>
        <button type="button" className={`ghost-btn help-btn ${trainingMode ? "active" : ""}`} title="Open safe sample-data training mode" onClick={onTraining}>
          <Icon name="book" />
          <span>{trainingMode ? "Training On" : "Training"}</span>
        </button>
        <button type="button" className="ghost-btn help-btn ask-help-btn" title="Ask a general ERP help question across modules and workflows" onClick={onHelpAssistant}>
          <Icon name="help" />
          <span>Ask ERP Help</span>
        </button>
        <button type="button" className={`ghost-btn help-btn ${showFeedback ? "active" : ""}`} title="Submit feedback, suggestions, and improvement requests" onClick={() => setShowFeedback(true)}>
          <Icon name="edit" />
          <span>Feedback</span>
        </button>
      </div>

      <div className="company-context utility-section" title="Current company context controls">
        <label>
          <span>Current Company</span>
          <select value={companyContext.company_scope === "all" ? "__all" : currentCompanyId} onChange={(event) => onCompanyChange(event.target.value)}>
            {!safeCompanies.length && <option value="">Create company first</option>}
            {safeCompanies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}
            {adminUser && <option value="__all">All Companies View</option>}
          </select>
        </label>
        <div className="company-context-actions">
          <button type="button" onClick={onCreateCompany}>Create</button>
          <button type="button" onClick={onAlterCompany} disabled={!currentCompanyId || companyContext.company_scope === "all"}>Alter</button>
          <button type="button" onClick={onSettings}>Settings</button>
        </div>
        {companyContext.company_scope === "all" && <small>Read-only group summary</small>}
      </div>

      <div className="user-pill utility-user">
        <Icon name="shield" />
        <span>{session.displayName}</span>
        <button type="button" onClick={onLogout}>Logout</button>
      </div>

      {productivityPanel}
      {extension}

      {showFeedback && (
        <FeedbackLogPanel
          session={session}
          companyContext={companyContext}
          onClose={() => setShowFeedback(false)}
          onOpenHelp={() => {
            setShowFeedback(false);
            onHelpAssistant();
          }}
          api={api}
        />
      )}
    </aside>
  );
}

function NavQuickSection({ title, items, current, compact, onNavigate, onFavorite }) {
  const safeItems = Array.isArray(items) ? items : [];
  const resolved = safeItems.map((key) => flatNavItems.find((item) => item.key === key)).filter(Boolean);
  if (!resolved.length) return null;
  return (
    <div className="nav-quick-section">
      <div className="nav-section-title">{title}</div>
      {resolved.map((item) => (
        <div className={`nav-child-row quick ${compact ? "compact-quick" : ""}`} key={`${title}-${item.key}`}>
          <button type="button" className={current === item.key ? "active" : ""} title={`${item.group} > ${item.label}`} onClick={() => onNavigate(item.key)}>
            {compact && <Icon name={item.icon} />}
            <span>{item.label}</span>
          </button>
          {title === "Favorites" && <button type="button" className="favorite-pin pinned" title="Remove favorite" onClick={() => onFavorite(item.key)}>*</button>}
        </div>
      ))}
    </div>
  );
}
