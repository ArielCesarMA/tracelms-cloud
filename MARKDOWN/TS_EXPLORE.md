# TS_EXPLORE — Test Scenario Guide

## INPUT

Use content between:  <<START_REQUIREMENTS>>  and  <<END_REQUIREMENTS>>

<<START_REQUIREMENTS>>
| Field | Content |
|-------|---------|
| Requirement | [Paste requirement] |
| User Story | As a [role], I want to [goal], so that [value] |
| Acceptance Criteria | Given [precondition] When [action] Then [outcome] |
| Module | e.g., LOGIN FEATURE |

If input exceeds 300 words:
- Summarize to max 120 words before processing
<<END_REQUIREMENTS>>

---

## SCENARIO TYPES

| Type | Definition |
|------|------------|
| Happy Path | Ideal flow; valid inputs, all preconditions met |
| Alternative Flow | Valid deviation; different inputs/route, still succeeds |
| Error Condition | Invalid input/system failure; graceful handling required |
| Edge Case | Boundary values, timing, concurrency, rare state |
| Business Rule | Verify documented rule enforcement |

---

## SCENARIO TEMPLATE

| # | Type | Scenario | Precondition | Action | Expected Result | Priority |
|---|------|----------|--------------|--------|------------------|----------|
| 1 | HP | [Title] | [State] | [Input] | [Outcome] | High |
| 2 | AF | | | | | |
| 3 | EC | | | | | |
| 4 | EG | | | | | |
| 5 | BR | [Rule ID] | | | | |

**Priority:**  Critical →  High →  Medium →  Low

---

## GUIDING QUESTIONS

- **Happy Path:** What is the most common successful path?
- **Alternative:** Are there multiple valid ways to reach the outcome?
- **Error:** What if data is missing/invalid? System unavailable?
- **Edge:** Boundary values? Concurrent events? Idempotency?
- **Business Rule:** What rules govern this feature?


## COVERAGE FRAMEWORK

### 1. Happy Path (Core Flow)
- Primary successful user journey
- Expected system behavior under normal conditions

### 2. Alternative Flows
- Valid variations of user behavior
- Different roles, inputs, or sequences

### 3. Error Scenarios
- Invalid inputs
- System failures
- Permission or validation issues

### 4. Edge Cases
- Boundary values (min/max limits)
- Timing issues (delays, concurrency)
- Rare but possible conditions

### 5. Business Rules
- Verify documented rule enforcement
- Validate rule calculations and logic
- Ensure rule exceptions are handled properly

---

## OUTPUT RULES
- No TEST CASE and TEST CASE steps (scenarios only)
- No explanations or commentary

## DEDUPLICATION
- Merge similar scenarios into one
- Avoid rewording the same scenario multiple ways

## REASONING_RULE
Do not explain reasoning.
Return final answer only.

## CONSTRAINTS (Token Optimization)
- Do not expand into test steps
- Do not infer missing requirements unless critical
- Keep language compact and precise
- Avoid repetition

## END
