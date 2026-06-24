## Automation Candidate Assessment

Following the completion of requirements analysis, test scenario creation, test case design, and the Requirement Enhancement Review, perform an Automation Candidate Assessment to identify, prioritize, and recommend test cases suitable for automated testing using Playwright automation framework.

### Input Contract

Strictly Use only the below as required inputs.

- Output from `TS_EXPLORE.md` (Test Scenarios)
- Output from `TC_EXPLORE.md` (Test Cases)

Assumptions:

- Do not assume missing implementation details as facts.
- If data is unavailable (for ROI, feasibility, or frequency), mark as "Evidence Required".
- Every recommendation must trace back to requirement/scenario/test-case artifacts.

### Objectives

#### A. Review Requirements and Test Scenarios

Analyze all available artifacts, including:

- Functional requirements.
- Non-functional requirements.
- User stories and acceptance criteria.
- Business workflows.
- Test scenarios and test cases.
- Requirement Enhancement Review findings.
- Newly identified requirements, flows, and edge cases.

Evaluate each test case for:

- Business criticality.
- Frequency of execution.
- Stability of functionality.
- Regression testing value.
- Risk of production impact.
- Complexity and dependencies.

**Deliverables:**
- Inventory of automation candidates.
- Traceability between requirements, scenarios, and automation opportunities.
- Identification of automation coverage gaps.

---

#### B. Prioritize High-Value Test Cases

Identify test cases that provide the greatest value when automated.

Priority should be given to:

- Smoke tests.
- Critical business workflows.
- High-volume user journeys.
- Frequently executed regression tests.
- High-risk functionalities.
- Data validation and calculation logic.
- Cross-system integration tests.
- Previously defect-prone areas.
- Compliance and security validation checks (where feasible).

**Automation Priority Levels:**

| Priority | Description |
|-----------|-----------|
| P1 | Must automate immediately; high business value and regression impact |
| P2 | Strong automation candidate; automate in upcoming releases |
| P3 | Optional automation; lower ROI or execution frequency |
| P4 | Manual testing recommended |

**Deliverables:**
- Ranked automation candidate list.
- Automation roadmap recommendations.

---

#### C. Exclude Poor Automation Candidates

Identify scenarios that are unsuitable or low-value for automation.

Examples include:

- One-time validation activities.
- Frequently changing features.
- Highly subjective visual reviews.
- Exploratory testing.
- Usability and user experience evaluations.
- Ad-hoc investigations.
- Rarely executed workflows.
- Tests requiring significant manual judgment.

For each excluded candidate, provide:

- Reason for exclusion.
- Recommended manual testing approach.
- Re-evaluation criteria for future automation.

**Deliverables:**
- Excluded automation candidate list.
- Justification for manual execution.

---

#### D. Evaluate Automation Feasibility

Assess the technical feasibility of automating each candidate.

Evaluation criteria should include:

- Test environment availability.
- API accessibility.
- Test data management requirements.
- Application stability.
- Availability of automation hooks and identifiers.
- Integration complexity.
- External system dependencies.
- Security restrictions.
- Tool compatibility.
- CI/CD integration readiness.

**Feasibility Rating:**

| Rating | Description |
|----------|-------------|
| High | Can be automated with minimal effort |
| Medium | Automatable with moderate preparation |
| Low | Significant technical barriers exist |
| Not Feasible | Automation not recommended |

**Deliverables:**
- Feasibility assessment matrix.
- Technical blockers and mitigation recommendations.

---

#### E. Calculate Automation ROI

Estimate the return on investment for automating each candidate.

Consider:

- Manual execution effort.
- Execution frequency.
- Maintenance effort.
- Automation development effort.
- Defect detection value.
- Business risk reduction.
- Time savings per release.
- Long-term maintenance costs.

### Suggested ROI Formula

```text
ROI Score =
(Manual Execution Cost x Annual Execution Frequency)
-
(Automation Development Cost + Annual Maintenance Cost)
```

### ROI Classification

| ROI Level | Description |
|------------|------------|
| High | Strong automation candidate with rapid payback |
| Medium | Valuable candidate with moderate return |
| Low | Limited benefit from automation |
| Negative | Automation cost exceeds expected benefit |

**Deliverables:**
- ROI assessment for each automation candidate.
- Estimated payback period.
- Recommended implementation sequence.

---

#### F. Categorize by Automation Layer

Classify each automation candidate according to the most appropriate automation layer.

### 1. Unit Test Candidates

Suitable for:

- Business rules.
- Validation logic.
- Calculations.
- Data transformations.
- Service methods.
- Utility functions.

**Benefits:**
- Fast execution.
- Low maintenance.
- High reliability.
- Immediate feedback.

---

### 2. API Test Candidates

Suitable for:

- Service contracts.
- Integration validation.
- Workflow orchestration.
- Data validation.
- Security and authorization checks.
- Error handling.
- Backend business processes.

**Benefits:**
- Faster than UI tests.
- Stable automation layer.
- Broad coverage.
- Lower maintenance costs.

---

### 3. UI Test Candidates

Suitable for:

- End-to-end user journeys.
- Critical business workflows.
- Cross-browser validation.
- User interaction validation.
- Visual workflow verification.

**Benefits:**
- User-perspective validation.
- Full workflow coverage.

**Limitations:**
- Slower execution.
- Higher maintenance effort.
- Greater environmental dependency.

### Playwright-Specific Feasibility Rules

Use these rules to classify whether a candidate can be automated using Playwright:

- `Yes`: Candidate can be automated using Playwright UI and/or Playwright API capabilities.
- `Partial`: Candidate can be partially automated in Playwright, but requires non-Playwright tooling for full coverage.
- `No`: Candidate is not suitable for Playwright (for example pure unit-test scope).

When `No` or `Partial`, include the blocker and recommended complementary framework.

---

### Automation Layer Prioritization Strategy

Apply the automation test pyramid principle:

| Priority | Automation Layer | Recommended Coverage |
|-----------|------------------|----------------------|
| 1 | Unit Tests | Highest coverage (60-80%) |
| 2 | API Tests | Medium coverage (15-30%) |
| 3 | UI Tests | Lowest coverage (5-15%) |

### Recommended Decision Rules

1. Automate at the lowest viable layer.
2. Prefer Unit Tests over API Tests whenever business logic can be validated without integration dependencies.
3. Prefer API Tests over UI Tests whenever workflows can be validated through service interfaces.
4. Reserve UI Tests for critical end-to-end business journeys and user interaction validation.
5. Avoid duplicate coverage across layers unless risk justifies redundancy.

**Deliverables:**
- Automation layer classification matrix.
- Recommended implementation layer.
- Justification for selected layer.
- Automation priority ranking.

### Priority-to-Rollout Mapping

| Automation Priority | Suggested Rollout Wave | Guidance |
|---------------------|------------------------|----------|
| P1 | Wave 1 (Immediate / Current release) | Blocker or high-regression-risk flows; automate first |
| P2 | Wave 2 (Next release) | Strong ROI candidates after P1 stabilization |
| P3 | Wave 3 (Backlog / Planned) | Automate when capacity and dependencies allow |
| P4 | Manual Only (Periodic review) | Keep manual unless context or risk changes |

---

## Output Format

### Automation Candidate Matrix

Create a new sheet inside the `Test_Scenario_Cases.xlsx` and name it 'Automation Candidate'.

| Requirement ID | Scenario ID | Test Case ID | Scenario | Business Criticality | Automation Feasibility | ROI | Recommended Layer | Playwright Automatable | Playwright Scope | Priority | Recommendation | Justification | Blockers/Dependencies | Re-evaluation Trigger |
|----------------|-------------|--------------|----------|---------------------|------------------------|-----|-------------------|------------------------|------------------|----------|----------------|---------------|-----------------------|-----------------------|
| REQ-001 | TS-001 | TC-001 | User Login | High | High | High | API Test | Yes | API | P1 | Automate immediately | High execution frequency and regression risk | Stable API and test data available | Reassess if auth flow changes significantly |

Output rules:

- Each row must be traceable to Requirement ID, Scenario ID, and Test Case ID.
- If feasibility or ROI cannot be scored, use "Evidence Required" and state missing data.
- Recommendations must include at least one actionable reason.
- Each row must include `Playwright Automatable` and `Playwright Scope`.
- `Playwright Automatable=No` requires a blocker and complementary framework recommendation.

---

### Executive Summary

Provide:

- Total test cases reviewed.
- Total automation candidates identified.
- Percentage recommended for automation.
- Unit Test candidates count.
- API Test candidates count.
- UI Test candidates count.
- High-priority automation candidates.
- Expected automation coverage.
- Estimated implementation effort.
- Estimated ROI summary.
- Recommended phased automation roadmap.

### Success Criteria

The assessment should ensure that:

- Automation efforts focus on the highest business value.
- Low-value automation is avoided.
- Automation aligns with the test pyramid strategy.
- ROI justifies implementation costs.
- Critical workflows receive adequate automated coverage.
- Long-term maintenance costs are considered.
- The resulting automation portfolio is scalable, maintainable, and cost-effective.

### Validation Checklist (Pass/Fail)

- [ ] All recommendations map to Requirement ID, Scenario ID, and Test Case ID.
- [ ] Priority values are only P1, P2, P3, or P4.
- [ ] Feasibility ratings are only High, Medium, Low, or Not Feasible.
- [ ] ROI is classified as High, Medium, Low, Negative, or Evidence Required.
- [ ] Excluded candidates include reason, manual approach, and re-evaluation criteria.
- [ ] Layer recommendation follows lowest viable layer rule unless justified.
- [ ] Every candidate includes justification and known blockers/dependencies.
- [ ] Playwright feasibility is explicitly classified as Yes, Partial, or No for each row.
- [ ] If a row is not Playwright-automatable, blocker and alternate framework are documented.