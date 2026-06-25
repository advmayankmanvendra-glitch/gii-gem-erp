# GII GeM ERP Global UX and Interaction Standards

## Objective

Establish one unified user experience (UX) standard across the entire GII GeM ERP.

Every future screen, module, report, wizard and assistant must comply with these standards.

This document becomes the permanent UX governance document for all future development.

---

# Core Principle

The ERP must feel like one product.

Not a collection of individual screens.

The user should never feel they have moved into a different application.

---

# Navigation Standards

## Universal Back Navigation

Every operational screen, drilldown, wizard and assistant must support:

← Back

using one centralized Navigation History Service.

Never create individual back buttons with custom logic.

The back button should return the user to the immediately previous ERP screen.

---

## Breadcrumb

Every screen should display:

Dashboard > Accounting > Receivables > Invoice

Users should always know where they are.

---

## Current Company

Always visible.

Never hidden.

Never silently changed.

---

## Screen Layout Standard

Every screen should contain:

Header → Toolbar → Primary Work Area → Summary Panel (where applicable) → Status Bar

Avoid floating controls scattered across the page.

---

# Toolbar Standards

Every module should follow the same action order.

Recommended order: New, Save, Edit, Delete (where permitted), Refresh, Search, Filter, Export, Print, Help

Actions should never appear randomly.

---

# Universal Search

Every module should support Search using one consistent search box.

Search should remain in the same location on every screen.

---

# Universal Keyboard Standards

- Enter → Submit / Save
- Shift+Enter → New Line
- Esc → Back / Close
- Ctrl+S → Save
- Ctrl+P → Print
- F1 → Help

Keyboard behavior should be identical across the ERP.

---

# Help Assistant Standards

Question box: Multi-line, 4–5 visible rows, Resizable.

- Enter → Submit
- Shift+Enter → New line

Rename "Ask" to "Submit" or "Get Guidance".

Always display:

User Question → Thinking → Assistant Answer → Suggested Actions → Related Questions → Source

---

# Assistant Source Labels

Every answer must identify its source. Examples: Official ERP Help, Workflow Guide, Current Screen Guidance, Knowledge Base, Safe Summary Data, Future Data API Required.

Never mix guidance and live data without indicating the source.

---

# Processing Feedback

Every long operation must display progress. Examples: "Thinking...", "Analyzing...", "Validating...", "Generating Preview...", "Importing..."

Never leave users staring at a static button.

---

# Form Standards

Every form should show: Required fields, Section headings, Validation messages, Business tips, Common mistakes.

Avoid large uninterrupted forms. Group fields logically.

---

# Tables

Every grid should support: Sorting, Filtering, Search, Column resizing, Export, Print, Sticky headers, Sticky totals where applicable.

---

# Drilldown Standards

Every report should support: Click → Open Source Record → Back → Return to Report.

Users should never lose context.

---

# Status Colours

Use one global colour language.

- Green → Completed
- Blue → Information
- Orange → Pending
- Yellow → Warning
- Red → Critical

Never invent module-specific colours.

---

# Icons

Use one consistent icon family. Do not mix icon styles.

---

# Empty Screens

Never display "No data". Instead display why the screen is empty and how to populate it: Open related screen, Create new record, Import data.

Example: "No suppliers found. [Create Supplier] [Import Suppliers] [Open Help]"

---

# Reports

Every report should contain: Summary → Filters → Grid → Totals → Export → Print → Drilldown.

Avoid report-only dead ends.

---

# Data Quality

Whenever possible show: Completeness, Missing Data, Warnings, Suggested Improvements — instead of only showing records.

---

# AI and Intelligence

AI should first: Explain, Guide, Recommend, Alert, Predict.

Only after long-term operational maturity should AI create drafts.

AI must never silently post transactions.

---

# Confirmation Standards

Critical actions require confirmation. Examples: Delete, Restore, Reverse, Year Close, Opening Stock Posting, Bulk Update.

Never bypass confirmations.

---

# Health Standards

Utilities → ERP Health Center → Diagnosis → Recovery → Support → Health Reports.

All diagnostics should follow the same presentation style.

---

# Performance Standards

Every screen should load quickly. Lazy-load where appropriate. Avoid blocking the entire UI. Long-running operations should display progress.

---

# Accessibility

Support: Tooltips, Keyboard navigation, Readable fonts, High contrast status colours, Consistent spacing.

---

# Modularization Rule

App.jsx must never become the implementation location for new business features.

App.jsx responsibilities are limited to: route registration, menu registration, safe context wiring, safe mode routing.

Every new subsystem must have its own module.

---

# Future Compliance Rule

Every future implementation report must include: UX Compliance, Navigation Compliance, Help Compliance, Accessibility Compliance, Modularization Compliance.

Only phases that comply with this UX standard should be considered production-ready.

---

# Final Principle

The user should never have to think "Where do I click now?" The ERP should naturally guide the user through every workflow while maintaining consistency, predictability, operational clarity and audit integrity.
