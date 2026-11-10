import React, { useEffect, useState } from "react";
import { EmptyState, Metric } from "../components/common.jsx";
import { ReportToolbar, MetricLine } from "../components/forms/index.jsx";
import { formatCurrency } from "../utils/formatters.js";
import { sortRecordsBy } from "../utils/optionSorting.js";

const SCENARIOS_KEY = "gii-gem-profit-simulator-scenarios";

const defaultParams = {
  billingAdjustment: 0,
  costAdjustment: 0,
  expenseAdjustment: 0,
  incentivePercent: 0,
  gstRateOverride: 0
};

function loadScenarios() {
  try {
    return JSON.parse(window.localStorage.getItem(SCENARIOS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveScenarios(scenarios) {
  window.localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function ProfitSimulatorScreen({ notify, companyContext, apiClient }) {
  const [params, setParams] = useState({ ...defaultParams });
  const [scenarios, setScenarios] = useState([]);
  const [scenarioName, setScenarioName] = useState("");
  const [selectedScenario, setSelectedScenario] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // The baseline and the scenario are calculated in the main process from the live
  // order profitability report; this screen only shows them.
  const [result, setResult] = useState(null);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let current = true;
    // Each request reruns the profitability report, so typing waits for a short pause.
    const timer = window.setTimeout(() => {
      apiClient.simulateProfit(companyContext, params).then((data) => {
        if (current) { setResult(data); setLoadError(""); }
      }).catch((error) => {
        if (!current) return;
        setLoadError(error.message);
        notify(error.message, "error");
      });
    }, 300);
    return () => { current = false; window.clearTimeout(timer); };
  }, [companyContext?.company_id, companyContext?.company_scope, params]);

  useEffect(() => {
    setScenarios(loadScenarios());
  }, []);

  const rows = result?.rows || [];
  const baselineTotals = result?.baseline || { billingValue: 0, purchaseValue: 0, grossMargin: 0, gstInputLoss: 0, totalExpenses: 0, employeeIncentive: 0, netCompanyProfit: 0 };
  const baselineROI = result?.baseline?.roi || 0;
  const scenarioTotals = result?.scenario || { billing: 0, cost: 0, grossMargin: 0, gstImpact: 0, expenses: 0, incentive: 0, netProfit: 0, roi: 0 };

  function updateParam(key, value) {
    const num = parseFloat(value);
    setParams((prev) => ({ ...prev, [key]: isNaN(num) ? 0 : num }));
    setSelectedScenario("");
  }

  function resetParams() {
    setParams({ ...defaultParams });
    setSelectedScenario("");
  }

  function applyScenario(scenario) {
    setParams({ ...scenario.params });
    setSelectedScenario(scenario.name);
  }

  function deleteScenario(name) {
    const updated = scenarios.filter((s) => s.name !== name);
    setScenarios(updated);
    saveScenarios(updated);
    if (selectedScenario === name) {
      resetParams();
    }
  }

  function saveCurrentScenario() {
    const name = scenarioName.trim();
    if (!name) {
      notify("Enter a scenario name before saving.", "error");
      return;
    }
    const updated = scenarios.filter((s) => s.name !== name);
    updated.push({ name, params: { ...params }, savedAt: new Date().toISOString() });
    setScenarios(updated);
    saveScenarios(updated);
    setSelectedScenario(name);
    setShowSaveDialog(false);
    setScenarioName("");
    notify(`Scenario "${name}" saved.`, "ok");
  }

  function loadScenario(name) {
    const scenario = scenarios.find((s) => s.name === name);
    if (scenario) applyScenario(scenario);
  }

  const paramControls = [
    { key: "billingAdjustment", label: "Billing Adjustment", hint: "Adjust total billing value" },
    { key: "costAdjustment", label: "Cost Basis Adjustment", hint: "Adjust procurement/inventory cost" },
    { key: "expenseAdjustment", label: "Expense Adjustment", hint: "Adjust dynamic expenses" },
    { key: "incentivePercent", label: "Employee Incentive %", hint: "% of initial profit" },
    { key: "gstRateOverride", label: "GST Rate Override %", hint: "Override GST rate for GST impact calculation" }
  ];

  return (
    <section className="page">
      <ReportToolbar title="Profit Simulator" note="Adjust parameters to simulate profitability scenarios based on actual order data.">
        <select value={selectedScenario} onChange={(e) => e.target.value && loadScenario(e.target.value)}>
          <option value="">Load Scenario</option>
          {sortRecordsBy(scenarios, (scenario) => scenario.name).map((s) => (
            <option key={s.name} value={s.name}>{s.name}</option>
          ))}
        </select>
        <button className="ghost-btn" type="button" onClick={() => setShowSaveDialog(true)}>Save</button>
        <button className="ghost-btn" type="button" onClick={resetParams}>Reset</button>
      </ReportToolbar>

      {showSaveDialog && (
        <div className="modal-backdrop" onClick={() => setShowSaveDialog(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Save Scenario</h2>
            <label className="field">
              Scenario Name
              <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. Optimistic Q3" autoFocus />
            </label>
            <div className="confirm-actions">
              <button className="ghost-btn" type="button" onClick={() => setShowSaveDialog(false)}>Cancel</button>
              <button className="primary-btn" type="button" onClick={saveCurrentScenario}>Save</button>
            </div>
          </div>
        </div>
      )}

      {loadError && !result ? (
        <EmptyState title="Simulation not available" note={loadError} />
      ) : !rows.length ? (
        <EmptyState title="No profitability data" note="Create orders, procurements, billing and expenses to generate profitability data for simulation." />
      ) : (
        <>
          <section className="simulator-controls-panel panel">
            <div className="section-header">
              <h2>Adjustment Parameters</h2>
              <span>Modify each parameter to see the impact on profitability. All adjustments are percentage-based.</span>
            </div>
            <div className="simulator-params-grid">
              {paramControls.map(({ key, label, hint }) => (
                <label key={key} className="field simulator-param">
                  <span className="param-label">{label}</span>
                  <input
                    type="number"
                    value={params[key]}
                    onChange={(e) => updateParam(key, e.target.value)}
                    step={key === "incentivePercent" || key === "gstRateOverride" ? 0.25 : 1}
                    min={key === "incentivePercent" || key === "gstRateOverride" ? 0 : -100}
                    max={key === "incentivePercent" || key === "gstRateOverride" ? 100 : 1000}
                  />
                  <small>{hint}</small>
                </label>
              ))}
            </div>
          </section>

          <section className="simulator-results-panel panel">
            <div className="section-header">
              <h2>Comparison</h2>
              <span>Baseline vs Scenario impact</span>
            </div>
            <div className="simulator-comparison-grid">
              <div className="simulator-compare-header">
                <span className="comp-metric">Metric</span>
                <span className="comp-baseline">Baseline</span>
                <span className="comp-scenario">Scenario</span>
                <span className="comp-delta">Change</span>
              </div>
              {[
                { label: "Billing Value", baseline: baselineTotals.billingValue, scenario: scenarioTotals.billing },
                { label: "Cost Basis", baseline: baselineTotals.inventoryCostBasis || baselineTotals.purchaseValue, scenario: scenarioTotals.cost },
                { label: "Gross Margin", baseline: baselineTotals.grossMargin, scenario: scenarioTotals.grossMargin },
                { label: "GST Impact", baseline: baselineTotals.gstInputLoss, scenario: scenarioTotals.gstImpact },
                { label: "Total Expenses", baseline: baselineTotals.totalExpenses, scenario: scenarioTotals.expenses },
                { label: "Employee Incentive", baseline: baselineTotals.employeeIncentive, scenario: scenarioTotals.incentive },
                { label: "Net Profit", baseline: baselineTotals.netCompanyProfit, scenario: scenarioTotals.netProfit },
                { label: "ROI %", baseline: baselineROI, scenario: scenarioTotals.roi, isPct: true }
              ].map(({ label, baseline, scenario, isPct }) => {
                const delta = scenario - baseline;
                const deltaPct = baseline !== 0 ? ((delta / Math.abs(baseline)) * 100) : 0;
                const isPositive = delta >= 0;
                return (
                  <div key={label} className="simulator-compare-row">
                    <span className="comp-metric">{label}</span>
                    <span className="comp-baseline">{isPct ? `${baseline.toFixed(2)}%` : formatCurrency(baseline)}</span>
                    <span className="comp-scenario">{isPct ? `${scenario.toFixed(2)}%` : formatCurrency(scenario)}</span>
                    <span className={`comp-delta ${isPositive ? "delta-positive" : "delta-negative"}`}>
                      {isPct ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}pp` : `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`}
                      <small>({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="metric-grid profit-grid">
            <Metric label="Baseline Net Profit" value={formatCurrency(baselineTotals.netCompanyProfit)} note="Current net profit" icon="rupee" />
            <Metric label="Scenario Net Profit" value={formatCurrency(scenarioTotals.netProfit)} note="After adjustments" icon="trend" />
            <Metric label="Impact" value={formatCurrency(scenarioTotals.netProfit - baselineTotals.netCompanyProfit)} note={scenarioTotals.netProfit >= baselineTotals.netCompanyProfit ? "Increase" : "Decrease"} icon="chart" />
            <Metric label="Scenario ROI" value={`${scenarioTotals.roi.toFixed(2)}%`} note={`vs ${baselineROI.toFixed(2)}% baseline`} icon="bank" />
          </section>

          <section className="panel records-panel report-panel">
            <ReportToolbar title="Order-wise Profitability (Reference Data)" note="Individual order profitability used as the baseline for simulation." />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Billing</th>
                    <th>Cost Basis</th>
                    <th>Gross Margin</th>
                    <th>GST Impact</th>
                    <th>Expenses</th>
                    <th>Incentive</th>
                    <th>Net Profit</th>
                    <th>ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.order_number}</strong><br /><span>{row.department_name} - {row.employee_name}</span></td>
                      <td>{formatCurrency(row.billingValue)}</td>
                      <td>{formatCurrency(row.inventoryCostBasis ?? row.purchaseValue)}</td>
                      <td>{formatCurrency(row.grossMargin)}</td>
                      <td>{formatCurrency(row.gstInputLoss)}</td>
                      <td>{formatCurrency(row.totalExpenses)}</td>
                      <td>{formatCurrency(row.employeeIncentive)}</td>
                      <td><strong className={row.netCompanyProfit < 0 ? "loss" : "profit"}>{formatCurrency(row.netCompanyProfit)}</strong></td>
                      <td>{Number(row.roiPercentage || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
