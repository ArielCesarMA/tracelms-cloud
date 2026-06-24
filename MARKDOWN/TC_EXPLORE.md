# TC_EXPLORE.md

## Objective
Transform test scenarios from `TS_EXPLORE.md` into structured, detailed test cases.

---

## INPUT
Use the scenarios from `TS_EXPLORE.md`.

---

## DATA STRUCTURE

Each test case must include:

| Field | Description |
|-------|-------------|
| Issue Type | Always: Test |
| Test Type | Functional / Negative / Edge / Integration |
| Test Case Summary | Short title (≤12 words), key condition/action |
| Test Case Description | Brief objective (max 2 lines) |
| Detailed Steps | Each row must contain exactly one step and its corresponding expected result |
| Test Data | Required inputs only, concise |
| Expected Result | Measurable outcome, aligns with scenario |

**Transformation Rules:**
1. Each scenario → One test case or more as long as not duplicate to existing test case
2. Expand into actionable steps
3. Add navigation context if obvious
4. Do NOT invent logic not in scenario
5. Steps executable by new tester
6. Maintain traceability (Scenario ID → Test Case ID)

---

## PRIORITIZATION

If limited:
- Convert only:
  - High-risk scenarios
  - Core business flows
  - Known failure points

---

## CASE TEMPLATE

### TC-01

- **Issue Type:** Test  
- **Test Type:** Functional  
- **Test Case Summary:** 
- **Test Case Description:**  
- **Detailed Steps:**
- **Test Data:**  
- **Expected Result:**  

---

## CONSTRAINTS
- Summary ≤12 words
- Description ≤2 lines
- Concise wording, no repetition

---

## VALIDATION CHECKLIST

Before finalizing:
- [ ] Each row contains exactly one step under 'Detailed Steps' and its corresponding expected result
- [ ] Summary is clear and concise
- [ ] Expected result is measurable
- [ ] Test case aligns with scenario
- [ ] No missing mandatory fields

---

## DEDUPLICATION
- Merge similar test cases into one
- Avoid rewording the same test case multiple ways

## REASONING_RULE
Do not explain reasoning.
Return final answer only.

## END
