import React from "react";
import { OperationsDrilldownContent } from "../components/operations/index.jsx";

export function OperationsDrilldownPanel({ drilldown, onClose, onNavigate }) {
  return <OperationsDrilldownContent drilldown={drilldown} onClose={onClose} onNavigate={onNavigate} />;
}
