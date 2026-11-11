import React, { createContext, useContext, useMemo } from "react";

const RoleContext = createContext({ role: "readonly", depth: "basic" });

function AssistantRoleProvider({ role, children }) {
  const depthMap = {
    admin: "diagnostic",
    accountant: "detailed",
    operator: "basic",
    approver: "standard",
    auditor: "detailed",
    readonly: "basic"
  };
  const value = useMemo(() => ({
    role: role || "readonly",
    depth: depthMap[role] || "basic"
  }), [role]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

function useAssistantRole() {
  return useContext(RoleContext);
}

export { AssistantRoleProvider, useAssistantRole };
