import React from "react";
import { DocumentTemplate } from "./TemplateSections.jsx";

/** Renders a ledger-style certified print from the loaded ledger report. */
function LedgerPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="General / Party Ledger"
      purpose="Ledger statement print for audit, party review and accounting verification."
      preview={preview}
      data={data}
      fieldHints={["company", "ledger", "party", "department", "supplier", "period", "from", "to", "opening", "closing", "balance"]}
      secondaryFieldHints={["debit", "credit", "running", "outstanding", "voucher", "reference"]}
      tableTitle="Ledger Entries"
      copyType="Ledger Statement"
      declaration="This ledger statement is generated from loaded posted and report-visible ERP ledger data."
      signatureLabels={["Prepared By", "Verified By", "Accounts Approval"]}
    />
  );
}

/** Renders a trial balance certified print from the loaded trial balance report. */
function TrialBalancePrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Trial Balance"
      purpose="Trial balance print with debit and credit balances for the selected company and period."
      preview={preview}
      data={data}
      fieldHints={["company", "period", "from", "to", "debit", "credit", "difference", "status"]}
      secondaryFieldHints={["assets", "liabilities", "income", "expense", "balance"]}
      tableTitle="Trial Balance Lines"
      copyType="Financial Statement"
      declaration="Trial balance totals must remain balanced before this print is used for management or audit review."
      signatureLabels={["Prepared By", "Checked By", "Authorized Signatory"]}
    />
  );
}

/** Renders a profit and loss certified print from the loaded P&L report. */
function ProfitLossPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Profit & Loss Statement"
      purpose="Income, expense and net profit statement for the selected company and period."
      preview={preview}
      data={data}
      fieldHints={["company", "period", "from", "to", "income", "expense", "profit", "loss", "net"]}
      secondaryFieldHints={["sales", "purchase", "cogs", "gst", "expense", "margin", "profitability"]}
      tableTitle="Profit & Loss Details"
      copyType="Financial Statement"
      declaration="This statement is generated from loaded report data and should be reconciled with ledgers before statutory use."
      signatureLabels={["Prepared By", "Reviewed By", "Management Approval"]}
    />
  );
}

/** Renders a balance sheet certified print from the loaded balance sheet report. */
function BalanceSheetPrint({ preview, data }) {
  return (
    <DocumentTemplate
      title="Balance Sheet"
      purpose="Assets, liabilities and equity statement for the selected company and period."
      preview={preview}
      data={data}
      fieldHints={["company", "period", "from", "to", "assets", "liabilities", "equity", "difference", "status"]}
      secondaryFieldHints={["receivable", "payable", "cash", "bank", "stock", "gst", "capital"]}
      tableTitle="Balance Sheet Details"
      copyType="Financial Statement"
      declaration="Assets must agree with liabilities and equity before this statement is treated as finalized."
      signatureLabels={["Prepared By", "Checked By", "Authorized Signatory"]}
    />
  );
}

export { BalanceSheetPrint, LedgerPrint, ProfitLossPrint, TrialBalancePrint };
