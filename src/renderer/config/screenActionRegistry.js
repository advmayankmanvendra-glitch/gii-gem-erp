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
  }
];

export function screenActionsForView(view) {
  return SCREEN_ACTION_REGISTRY.filter((action) => action.view === view);
}
