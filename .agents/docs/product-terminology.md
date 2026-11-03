# Console terminology

Follow this glossary when writing console labels, navigation, buttons, help,
errors, accessibility text, and agent-generated explanations of the console.
Use these names in plans and reviews when referring to the product concepts.
Keep API paths, field names, enum values, tools, and quoted code unchanged.

## Names and meanings

| Concept and usage | Korean UI | English UI | Meaning |
| --- | --- | --- | --- |
| Reusable verification definition | Test Case | Test Case | What is tested, its preconditions, and its expected result. Do not abbreviate the general name to TC or case. |
| Navigation and collection title | Test Cases | Test Cases | The project's reusable Test Case collection. |
| Project-issued identifier | TC-001 | TC-001 | Use the existing project number and `formatTestCaseId` / `useTestCaseLabel`. Preserve at least three digits, larger numbers, and the existing TC-… loading fallback. Never substitute a database id or local ordinal. |
| Scenario with authored steps | 단계 기반 | Step-based | Steps are defined before execution and run in their written order. The serialized execution mode remains ORDERED. |
| Scenario with selected Test Cases | Test Case 기반 | Test Case-based | The agent determines the order and method for verifying the selected Test Cases. The serialized execution mode remains FREE. Do not call it 자율 순서 시나리오. |
| Test Case body field | 테스트 내용 | Test description | The action or behavior being tested; distinguish it from an execution step. |
| Scenario execution unit | 단계 | Step | One step in a scenario. |
| Required starting state | 사전 조건 | Preconditions | Conditions needed before testing. |
| Required outcome | 기대 결과 | Expected result | What must happen for the Test Case to pass. Do not call it 기대효과 or Expected value. |
| Recorded state on a Test Case | Test Case 검증 상태 | Test Case verification status | The state stored on the Test Case, which may differ from one scenario execution's result. |
| BROKEN status | 원본 누락 | Source missing | Map regeneration removed the generated Test Case while a scenario still references it. Do not assert that the game feature was deleted or that QA failed. |
| Scenario coverage metric | 테스트 커버리지 | Test coverage | Test Cases included in scenarios. Preserve the existing numerator, denominator, scope and explanatory help. It is not the execution rate or pass rate. |
| Recent execution list | 최근 QA | Recent QA | A bounded list of recent QA runs, including active runs. |
| Full execution history | QA 실행 기록 | QA run history | The full collection of QA runs and their recorded state/results. |
| Events since the last QA run | 최근 활동 | Recent activity | Issue resolution, reported builds, scenario edits/additions and Test Case version additions. This is not the QA run history or a field-by-field diff. |
| Saved scenario bundle | 테스트 런 | Test run | The current product name for a saved, version-associated scenario bundle. Keep it until a separate naming decision changes it; do not silently rename it Test Suite. |

## Apply names in context

- Keep TC only in actual identifier displays such as TC-001. Generic headings,
  count labels, actions, and local ordinal labels spell out Test Case. Local
  scenario positions are ordinals, not project identifiers; never format them
  as TC-000. Do not change identifier behavior as part of copy cleanup.
- Use action labels such as `Test Case 추가` / `Add Test Case` and
  `Test Case 연결` / `Link Test Case`. Use locale-appropriate plural grammar.
- Name QA run loading errors and logs directly. Do not expose the internal
  QaTry type as QA Try, and do not rename every QA surface 실행 상세.
- Keep `최근 QA`, `QA 실행 기록`, and `최근 활동` distinct. Inspect the consuming
  component before choosing a label; similar localization keys do not establish
  that two areas display the same records.
- Inspect a term's actual usage before proposing a replacement. Do not collapse
  Unity scenes into screens, or game instances into consoles, without checking
  their domain meaning.
- Preserve locale keys, interpolation expressions, markup, accessibility
  meaning and supported behavior. Check both locales, themes and narrow widths
  when longer names replace abbreviations.
