# VERIFY

## Purpose

This document defines how to verify that `IMPLEMENT.md` follows the rules, format, templates, and requirements stated in `TS_EXPLORE.md` and `TC_EXPLORE.md`.

It also captures best practices for validating output derived from a requirement document.

---

## Scope

Verify three aspects:

1. `IMPLEMENT.md` content and structure
2. Requirements and template rules from `TS_EXPLORE.md`
3. Requirements and template rules from `TC_EXPLORE.md`

Use this guide for manual or automated validation.

---

## Validation Approach

### 1. Confirm source expectations

- Check that `IMPLEMENT.md` references the exact input files:
  - `TS_EXPLORE.md`
  - `TC_EXPLORE.md`
- Confirm the intended data structure matches the implementation plan.

### 2. Validate structural compliance

For the processed data, ensure:

- Test Scenarios columns match `TS_EXPLORE.md` scenario fields:
  - Scenario ID
  - Type
  - Scenario
  - Precondition
  - Action
  - Expected Result
  - Priority
- Test Cases columns match `TC_EXPLORE.md` test case fields:
  - Issue Type
  - Test Type
  - Test Case Summary
  - Test Case Description
  - Detailed Steps
  - Test Data
  - Expected Result
- Each entry contains exactly one step under 'Detailed Steps' and its corresponding expected result.

### 3. Validate process and rules

Ensure `IMPLEMENT.md` includes these required implementation phases:

- Parse Markdown files
- Normalize data
- Validate relationships and reference integrity

Ensure data validation rules include:

- Missing IDs or required fields
- Duplicate entries
- Broken or invalid references
- Invalid format handling

Ensure the implementation promotes:

- Traceability between scenarios and test cases
- Consistency of field names and formatting
- Maintainability of parsing logic
- Fail-fast behavior on inconsistencies

---

## TS_EXPLORE.md Compliance Checklist

- [ ] Uses the specified input block format with `<<START_REQUIREMENTS>>` and `<<END_REQUIREMENTS>>`
- [ ] Defines scenario types and template fields
- [ ] Restricts output to scenarios only (no test cases, no reasoning commentary)
- [ ] Uses compact wording and avoids repetition
- [ ] Includes deduplication guidance
- [ ] Includes constraints such as no test case steps and no explanations
- [ ] Clearly separates scenario categories by type and priority

---

## TC_EXPLORE.md Compliance Checklist

- [ ] Uses `Issue Type: Test` for all cases
- [ ] Includes required fields exactly:
  - Test Type
  - Test Case Summary
  - Test Case Description
  - Detailed Steps
  - Test Data
  - Expected Result
- [ ] Summary is ≤12 words
- [ ] Description is ≤2 lines
- [ ] Each entry contains exactly one step under 'Detailed Steps' and its corresponding expected result
- [ ] Expected result is measurable and aligned with the scenario
- [ ] Maintains traceability from scenario to test case
- [ ] Avoids inventing logic not present in the scenario
- [ ] Applies deduplication rules to avoid duplicate test cases

---

## Best Practices for Validating Output from Requirements

1. Start with the requirement document.
   - Identify required artifacts, field names, and constraints.
2. Create explicit validation criteria.
   - Use checklists for templates, field names, types, and limits.
3. Verify actual data structure first.
   - Compare headers and field naming conventions.
4. Validate content against the rules.
   - Confirm traceability, no missing data, and no unauthorized content.
5. Validate format and style.
   - Confirm row conventions, concise summaries, and description length.
6. Validate error behavior.
   - Confirm missing or invalid input is logged and does not produce invalid data.
7. Document findings.
   - Record mismatches, missing requirements, and corrective actions.

---

## Example Verification Steps

1. Read `IMPLEMENT.md` and extract expected input definitions.
2. Compare those definitions to `TS_EXPLORE.md` and `TC_EXPLORE.md` templates.
3. Confirm `IMPLEMENT.md` includes a validation phase.
4. Confirm data structure is consistent across phases.
5. Confirm the implementation rules for one-step-per-row and issue type enforcement.
6. Flag any mismatch between described templates and actual implementation plan.

---

## Common Failure Modes

- Data headers differ from template fields.
- Detailed steps are merged into a single entry.
- Test case summaries exceed the allowed length.
- Scenario-to-test-case traceability is absent.
- Implementation uses `TC_EXPLORE.md` input but describes different field names.
- Missing explicit validation rules for duplicate IDs and broken references.

---

## Verdict Criteria

A successful verification should show that `IMPLEMENT.md`:

- Aligns with the source templates in `TS_EXPLORE.md` and `TC_EXPLORE.md`.
- Contains a clear parse/normalize/validate process.
- Enforces the data constraints and validation checks.
- Provides a maintainable, traceable transformation path.
