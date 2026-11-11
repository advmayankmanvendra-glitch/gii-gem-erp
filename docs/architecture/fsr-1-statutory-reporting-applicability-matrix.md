# FSR-1 Statutory Reporting Applicability Matrix

**Audit date:** 2026-07-20  
**Purpose:** Applicability control study, not legal or audit certification  
**Overall readiness:** FAIL

## Authority hierarchy used

1. Companies Act, 2013 and rules/notifications issued by the Ministry of Corporate Affairs.
2. Accounting Standards or Ind AS notified under section 133, as applicable.
3. ICAI standards and guidance for non-corporate entities where applicable.
4. ERP products, including TallyPrime, only as usability/implementation references.

Companies Act section 128 requires company books to be kept on accrual basis and according to double entry, and section 129 requires financial statements to comply with notified accounting standards and Schedule III form. See the official [Companies Act, 2013 PDF](https://www.mca.gov.in/content/dam/mca/pdf/CompaniesAct2013.pdf) and [India Code section 129](https://www.indiacode.nic.in/show-data?actid=AC_CEN_22_29_00008_201318_1517807327856&orderno=132&sectionId=49276&sectionno=129).

## Applicability profiles

| Entity/profile | Governing presentation | ERP facts required | Current ERP readiness |
|---|---|---|---|
| Company using Accounting Standards | Schedule III Division I, notified AS | Legal form, framework, size/status exemptions, FY, comparative period | Missing profile and mapping |
| Company using Ind AS | Schedule III Division II, notified Ind AS | Ind AS applicability and transition/effective date | Missing |
| NBFC using Ind AS | Schedule III Division III | NBFC classification and Ind AS applicability | Missing |
| OPC/small/dormant company | Company framework with applicable exemptions | Formal classification and effective dates | Missing; must not infer |
| Proprietorship/partnership | ICAI non-corporate guidance and applicable law | Entity type, level/applicability, capital/drawings model | Missing |
| LLP | LLP-specific ICAI guidance and LLP law | LLP status and partner-equity mapping | Missing |
| Society/trust/other | Governing statute plus applicable standards/guidance | Registration type and reporting basis | Missing |

## Current company inference boundary

The visible company name is “Gesture India Infrastructure Private Limited”, which indicates a company form. The repository does not contain enough governed profile data to determine:

- Division I versus Division II applicability;
- small-company/OPC/dormant exemptions;
- whether cash-flow exemption applies;
- reporting framework transition date;
- note/disclosure applicability.

No statutory profile should be auto-selected from name, GSTIN, turnover alone, or an ERP operator choice without approved company-secretarial/accounting evidence.

## Required financial statement set

Companies Act section 2(40) defines financial statements to include Balance Sheet, Profit and Loss, Cash Flow Statement, Statement of Changes in Equity where applicable, and related notes; the cash-flow exception for OPC/small/dormant companies is profile-dependent. See [India Code section 2](https://www.indiacode.nic.in/show-data?actid=AC_CEN_22_29_00008_201318_1517807327856&orderno=2&sectionId=185&sectionno=2).

The ERP currently has only flat operational Trial Balance, P&L and Balance Sheet reports. It has no governed cash-flow statement, notes, statutory comparative format or entity-profile evidence.

## Inventory standard consideration

ICAI AS 2 covers inventory cost and write-down to net realisable value. The ERP's weighted-average cost logic does not implement NRV, write-down or reversal controls. See [ICAI AS 2](https://indasaccess.icai.org/Volume-III/AS/asb.html?a=105).

## Non-corporate reporting consideration

ICAI issued its Guidance Note on Financial Statements of Non-Corporate Entities in 2023. ICAI's March 31, 2026 announcement states phased applicability from periods beginning April 1, 2025 for entities above the stated turnover threshold and April 1, 2026 for all entities covered by the announcement. See the [ICAI 2026 announcement](https://www.icai.org/post/23950) and [ICAI guidance-note index](https://www.icai.org/post/guidance-notes).

This does not make the non-corporate profile applicable to the current private limited company; it establishes why a separate Profile D is needed for future entities.

## Required statutory mapping controls

- legal entity type and registration evidence;
- reporting framework and Schedule division;
- applicability effective dates and overrides with approvals;
- current/non-current classification rules;
- comparative and note-number mapping;
- materiality/disclosure policy hooks;
- cash-flow and statement-of-equity applicability;
- versioned mapping and audit trail;
- CA/authorized-accountant certification status.

## Decision

**Operational accounting reports:** Present but uncertified  
**Statutory company reporting:** Not ready  
**Non-corporate profile:** Not ready  
**Safe to present current reports as Schedule III statements:** No

