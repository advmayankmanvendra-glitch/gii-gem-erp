import React from "react";
import { OperationsDrilldownContent } from "../components/operations/index.jsx";

export function OperationsDrilldownPanel({ drilldown, onClose, onNavigate, onInlineAction }) {
  return <OperationsDrilldownContent drilldown={drilldown} onClose={onClose} onNavigate={onNavigate} onInlineAction={onInlineAction} />;
}
