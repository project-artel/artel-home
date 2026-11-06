# 2026-09-08 — QA step timeline 을 기대 판정 기준으로 칠한다

- Date: 2026-09-08
- Jira: ARTEL-846 (Epic ARTEL-607)
- Status: Implemented

## Goal

`expected_passed` 라벨이 달린 스텝은 통과 여부가 아니라 **에이전트가 맞혔는지**로 칠한다.
라벨이 없는 스텝과 시나리오는 화면이 지금과 완전히 같다.

## Non-goals

- 서버 변경. 라벨은 `GET /api/test-scenario/{id}` 의 `payload.steps[].expected_passed` 로
  이미 내려오고 있다.
- home 에서 라벨을 편집하는 화면. 라벨링은 admin-page 와 `artel scenario expected-labels` 가 한다.
- `qa_try_score` 조회. 이 화면은 자기가 읽은 로그에서 파생한 판정으로 채점한다.
- TC bracket 의 `통과 N · 실패 M` 집계 변경.

## 왜 색을 뒤집나

QA 에이전트의 스텝 판정은 자기채점이다. 답지가 없으면 "전부 통과"가 만점 전략이라,
ARTEL-301 이 사람이 단 기대 판정을 붙이고 결정적 채점자를 두었다. WordVenture 벤치마크는
게임이 실제로 거부하는 기대를 9 건 심어 두었고, L1 시나리오는 24 스텝 중 6 개가 그것이다.

그 6 개는 **실패로 보고해야 정답**이다. 그런데 화면은 실패를 빨강으로 칠하므로, 에이전트가
정답을 맞힌 순간 화면이 가장 나쁘게 보인다. 채점 결과를 읽으려면 `qa_try_score` 를 SQL 로
직접 봐야 했다.

## 색이 뜻을 바꾸는 것을 어떻게 감당하나

라벨이 붙은 스텝에서 초록은 "통과"가 아니라 "에이전트가 맞혔다"가 된다. 실제로 실패한
스텝이 초록으로 보이는 경우가 생긴다는 뜻이고, 그것이 이 변경의 유일한 오독 지점이다.
색 하나만 바꾸면 화면이 거짓말을 한다. 그래서 셋으로 나눈다:

| 무엇 | 무엇을 말하나 |
| --- | --- |
| glyph (`✓` / `✕`) | 에이전트가 실제로 보고한 판정 |
| 셀 위의 띠 | 사람이 적어 둔 기대 판정 |
| 셀 몸통 색 | 둘이 맞았는지 |

기대 판정은 **띠**로 그린다. 처음에는 verdict 옆에 작은 glyph 로 얹었는데, 통과해야 하는
스텝이 통과하면 같은 문자가 두 번 찍혀 (`✓ 1 ✓`) 답이 아니라 렌더링 사고로 읽혔다. 띠는
채널이 하나 더 있는 표현이라 그 문제가 없다 — 몸통은 채점 결과를, 띠는 무엇에 대고 채점한
것인지를 말하고, 띠가 없다는 것이 곧 채점 대상이 아니라는 뜻이다.

띠 색은 셀 배경보다 진하다. 배경은 16% tint 이고 띠는 full strength 라, 같은 색이어도 띠로
분리돼 보인다. 좌우를 6px 들여 두꺼운 위 테두리로 보이지 않게 한다.

TC cap 은 글자 줄이라 띠를 그 폭에 맞춰 12px 로 줄여 단다. 없으면 cap 이 빨간색으로
`✓ Passed` 라고만 떠서, 이 strip 이 오독될 수 있는 단 한 가지 방식이 그대로 남는다.
여기에 glyph 를 쓰면 셀에서 없앤 중복이 캡에서 되살아난다.

## 채점 규칙은 서버와 같아야 한다

`ExpectedStepsGrader` 가 미보고를 제 3 의 상태로 두는 것까지 맞춘다.

- 라벨이 `null` 이면 채점하지 않는다. `null` 은 "채점 안 함"이지 "통과 기대"가 아니다.
- 판정이 없는 스텝은 라벨이 있어도 `correct` 로도 `wrong` 으로도 세지 않는다. 일치로 세면
  일찍 죽은 런이 만점이 되고, 불일치로 세면 죽었다는 사실이 스텝 수만큼 이중 계산된다.
- 그래서 머리의 집계는 `labeled` / `correct` / `wrong` 셋이고, `labeled - correct - wrong`
  이 런이 판정하지 않고 지나간 수다.

## TC bracket 의 집계는 왜 그대로 두나

게임이 거부한 검증은 **실제로 실패한 것**이다. `21 checks · 21 passed · 0 failed` 는 런이
무엇을 결론지었는지에 대한 사실이고, 그 숫자까지 채점으로 접으면 런에 그 사실을 말하는 줄이
하나도 안 남는다. bracket 은 색만 채점을 따라간다.

## 변경 지점

| 파일 | 무엇 |
| --- | --- |
| `src/testScenarios/scenarioTypes.ts` | `ScenarioStep.expected_passed` |
| `src/testScenarios/scenarioApi.ts` | `parseStep` 이 그 필드를 살린다. 정확히 boolean 일 때만 |
| `src/qa/qaProgress.ts` | 스텝별 `expectedPassed` / `grade`, 런 단위 `labeled` / `correct` / `wrong` |
| `src/qa/QaStepTimeline.tsx` | `toneClass`, 기대 띠, 머리의 집계 |
| `src/i18n/messages/qa.ts` | `expected` / `gradeLabels` / `gradeSummary` / `gradeNote` (en · ko) |
| `src/App.css` | `--grade-correct` / `--grade-wrong`, `.qa-tl-cell-expect`, `.qa-tl-cap-expect`, 머리 `flex-wrap` |

editor 가 이 필드를 저장 요청에 되돌려 보내지만 서버의 `ExpectedLabelPolicy` 가 일반 쓰기
경로의 라벨을 버리므로 저장은 바뀌지 않는다. 라벨을 바꾸는 경로는 `expected-labels` 하나다.
