# FSR-2A.3 Validation and Audit Model

## Close-Time Validations

Every `closeFinancialYear` call runs these validations before writing any data:

| # | Validation | Error message | Purpose |
|---|---|---|---|
| 1 | Source and target FY records exist | `Valid source and target financial years are required` | Prevents phantom ID references |
| 2 | Source FY status is Open | `Source financial year status is 'X', must be 'Open'` | Prevents double-close and close of already-locked years |
| 3 | Target FY status is Open | `Target financial year status is 'X', must be 'Open'` | Prevents close into a locked/draft destination |
| 4 | Target starts after source ends | `Target financial year must start after source year ends` | Prevents overlapping FY ranges |
| 5 | No duplicate carry-forward | `Carry forward already exists for this company/year` | Prevents duplicate close records |
| 6 | No Draft/Error postings | `Cannot close year while Draft/Error transactions exist` | Ensures all postings are settled |
| 7 | Trial Balance balances | `Trial balance must balance before year close` | Ensures accounting integrity |
| 8 | Balance Sheet balances | `Balance sheet must balance before year close` | Ensures BS equation holds |

## Status Transitions

```
[Financial Year: Open]  ---closeFinancialYear--->  [Financial Year: Locked]
      |                                                     |
      |  (cannot close again)                                | (cannot post)
      v                                                     v
  Error: "must be 'Open'"                             Error: "Cannot post to locked
                                                             financial year"
```

## Post-Close Posting Controls

Once a financial year reaches `Locked` status:

- **Manual posting**: Rejected with `Cannot post to locked financial year FY XXXX-YY`
- **Guided posting**: Rejected with `Cannot post to locked financial year FY XXXX-YY`
- **Draft vouchers**: Excluded from reports (filtered via `postedVoucherFilter()`)
- **Cross-company posting**: Validated per-voucher (account company check)
- **Source FY reports**: Unchanged after close (confirmed by TB comparison)

## Audit Evidence

Each successful close generates an `audit_log` entry:
```
action: "year close and carry forward"
table_name: "year_end_closings"
record_id: <year_end_closings.id>
new_value: JSON({ fromId, toId, netProfit })
```

FSR-2A.3 check 30 confirms the audit record exists. Check 31g confirms multi-year close audit trail.

## Verifier Coverage of Validation

| Check | Validation tested | Expected result |
|---|---|---|
| 1 | All validations pass for valid close | `Closed OK` |
| 5 | Source already Locked → reject | `must be 'Open'` |
| 6 | Overlapping target → reject | `after source year` |
| 7 | Missing destination → reject | `Valid source` |
| 8 | Locked source → reject | `must be 'Open'` |
| 9 | Locked destination → reject | `must be 'Open'` |
| 22 | Repeated close rejects on Locked source | `must be 'Open'` |
| 23 | Manual posting blocked on Locked FY | `Cannot post to locked` |
| 24 | Guided posting blocked on Locked FY | `Cannot post to locked` |
| 25 | Source TB unchanged before/after close | Equal |
| 26 | Destination postings don't alter source TB | Equal |
| 27 | Cross-company posting blocked | `different company` |
| 28 | Draft postings excluded after close | `income after draft=0` |
