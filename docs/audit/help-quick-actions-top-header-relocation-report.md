# Help Quick Actions — Top Header Relocation Report

## 1. Before Issue Summary

The five Help quick action buttons (Screen Help, Learn This Screen, Training, Ask ERP Help, Feedback) were rendered inside the left `NavigationSidebar` as a `nav-quick-actions` div between the Dashboard link and the navigation groups. This made them appear as broken sidebar links and cluttered the main left navigation.

## 2. Files Changed

| File | Change |
|------|--------|
| `src/renderer/components/layout/index.jsx` | Removed `nav-quick-actions` div and all 5 buttons from `NavigationSidebar`. Removed unused `useState` import, `FeedbackLogPanel` import, `showFeedback` state, `feedbackPanel`, and the `onHelp`/`onHelpAssistant`/`onLearnThisScreen`/`onTraining` props from `NavigationSidebar`. Removed unused `trainingMode` prop from `RightUtilitySidebar`. |
| `src/renderer/components/help/HelpQuickActionsBar.jsx` | **New file.** Reusable component rendering the 5 help buttons as a horizontal pill-style toolbar with a "Help" label. Manages local `showFeedback` state and renders `FeedbackLogPanel` inline. |
| `src/renderer/App.jsx` | Replaced 4 callback props (`onHelp`/`onHelpAssistant`/`onLearnThisScreen`/`onTraining`) from `NavigationSidebar` with the same callbacks passed to the new `HelpQuickActionsBar` component inside `WorkspaceFrame`. Added import for `HelpQuickActionsBar`. Removed unused `trainingMode`/`onHelp`/`onHelpAssistant`/`onLearnThisScreen`/`onTraining` props from `RightUtilitySidebar`. |
| `src/renderer/styles/layout.css` | Added CSS for `.help-quick-actions-bar`, `.help-bar-label`, `.help-bar-actions`, `.help-bar-btn` classes. |

## 3. Where Actions Were Moved From

**From:** `NavigationSidebar` in `src/renderer/components/layout/index.jsx` (inside the `<nav class="nav grouped-nav">`, between the Dashboard link and the navigation groups).

## 4. Where Actions Were Moved To

**To:** A new `HelpQuickActionsBar` component rendered inside `WorkspaceFrame` in `src/renderer/App.jsx`, positioned between the WorkspaceFrame header (breadcrumb + title) and the screen content (RendererErrorBoundary). Renders as a horizontal toolbar with a "Help" label followed by the 5 pill-style buttons, using flex layout with wrapping for smaller widths.

## 5. Confirmation All Five Actions Still Work

Each button retains its original handler:
- **Screen Help** → `onHelp`: calls `setHelpAssistantSourceView(effectiveView)`, `setHelpAssistantInitialMode("screen")`, `navigate("help_assistant")`
- **Learn This Screen** → `onLearnThisScreen`: calls `setProductivityLearnOpen(true)`
- **Training** → `onTraining`: calls `setTrainingMode((current) => !current)`, `navigate("help_training")`
- **Ask ERP Help** → `onHelpAssistant`: calls `setHelpAssistantSourceView(effectiveView)`, `setHelpAssistantInitialMode("help")`, `navigate("help_assistant")`
- **Feedback** → local `showFeedback` state toggles `FeedbackLogPanel` visibility. Panel receives `session`, `companyContext`, `api` props.

All keyboard shortcuts (`Ctrl+Shift+B` for backup, etc.) remain unchanged.

## 6. Manual Visual Verification Status

**Not yet completed** — requires Electron desktop app launch. The following is the expected visual state:
- Left sidebar: Dashboard link followed directly by navigation groups (no help quick actions)
- Top content area: A subtle horizontal bar with "Help" label and 5 pill buttons beneath the breadcrumb/title header
- All 5 buttons appear as compact pill-style buttons with consistent spacing
- Buttons do not look like sidebar navigation links
- Right sidebar Utilities are unchanged (compact/expanded still work)
- No internal graph/Brain labels visible

## 7. Verification Command Results

| Command | Result |
|---------|--------|
| `npm run lint:syntax` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| `npm run verify:read-only-assistant` | PASS (42/42) |
| `npm run verify:assistant-relevance` | PASS (258/266, 96.99%) |
| `npm run verify:help-assistant-brain` | PASS (23/23) |
| `npm run verify:erp-brain` | PASS (51/51) |
| `npm run verify:audit` | PASS (204/204) |
| `npm run verify:erp` | PASS (all sub-verifications) |

## 8. Confirmation No ERP Logic Changed

- No accounting, workflow, database, voucher, GST, inventory, report, IPC, preload, or assistant reasoning logic was modified.
- No route keys changed.
- No IPC channel names changed.
- No database schema changed.
- No business logic duplicated or altered.
- Help Assistant logic is unchanged.
- Ask ERP Help / ERP Brain logic is unchanged.
- All existing handlers and keyboard shortcuts preserved.
- This is a pure UI placement/styling change.
