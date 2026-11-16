export const SCREEN_ACTION_REGISTRY = [
  {
    view: "opening_balances",
    actionKey: "opening_balances.add_opening",
    label: "Add Opening",
    handlerName: "openOpeningBalancePanel",
    category: "Accounting",
    risk: "high",
    requires: ["companyContext.company_id", "openFinancialYear", "account"],
    verification: "verify:screen-actions"
  },
  {
    view: "opening_balances",
    actionKey: "opening_balances.restore_from_backup",
    label: "Restore opening balances from a backup",
    handlerName: "runRestore",
    category: "Accounting",
    risk: "high",
    requires: ["companyContext.company_id", "backup", "restore_backup permission"],
    verification: "verify:screen-actions"
  }
];

export function screenActionsForView(view) {
  return SCREEN_ACTION_REGISTRY.filter((action) => action.view === view);
}
