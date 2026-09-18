import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRunCoverage } from './testRunApi'

/**
 * **이 런이 무엇을 담았는가**(ARTEL-904).
 *
 * 프로젝트 전량을 재는 값과 나란히 놓이는 숫자라, 무엇을 세는지가 흔들리면 두 배지 중 하나는
 * 거짓이 된다. 읽는 쪽에서 세지 않고 서버가 센 것을 그대로 옮기는 것이 이 파서의 규칙이다.
 */
test('시나리오별 내역과 런 합계를 읽는다', () => {
  const coverage = parseRunCoverage({
    testRunId: '70',
    total: 88,
    covered: 12,
    uncovered: 76,
    scenarios: [
      { position: 0, testScenarioId: '594', title: '앞 흐름', steps: 8, cases: 5 },
      { position: 1, testScenarioId: '595', title: '뒤 흐름', steps: 12, cases: 7 },
    ],
  })

  assert.equal(coverage.total, 88)
  assert.equal(coverage.covered, 12)
  assert.equal(coverage.uncovered, 76)
  assert.deepEqual(
    coverage.scenarios.map((row) => [row.title, row.steps, row.cases]),
    [['앞 흐름', 8, 5], ['뒤 흐름', 12, 7]],
  )
})

/**
 * 합계는 **읽는 쪽에서 더하지 않는다.**
 *
 * 같은 케이스가 맥락을 달리해 두 시나리오에 들어가는 것은 정상이고, 시나리오별 수를 더하면
 * 이 런이 실제로 덮은 범위보다 커진다. 서버가 서로 다른 케이스로 세므로 그 값을 그대로 쓴다.
 */
test('겹치는 케이스가 있어도 서버가 센 합계를 그대로 쓴다', () => {
  const coverage = parseRunCoverage({
    total: 3,
    covered: 1,
    uncovered: 2,
    scenarios: [
      { position: 0, testScenarioId: '1', title: '맥락 A', steps: 1, cases: 1 },
      { position: 1, testScenarioId: '2', title: '맥락 B', steps: 1, cases: 1 },
    ],
  })

  assert.equal(coverage.scenarios.reduce((sum, row) => sum + row.cases, 0), 2)
  assert.equal(coverage.covered, 1)
})

/** 순서는 `position` 이 정한다 — 배열 순서에 기대면 어긋난 날 그것이 화면 탓인지 알 수 없다. */
test('position 으로 순서를 세운다', () => {
  const coverage = parseRunCoverage({
    scenarios: [
      { position: 2, testScenarioId: '3', title: '셋째', steps: 1, cases: 1 },
      { position: 0, testScenarioId: '1', title: '첫째', steps: 1, cases: 1 },
    ],
  })

  assert.deepEqual(coverage.scenarios.map((row) => row.title), ['첫째', '셋째'])
})

/** 시나리오가 없는 런은 흔한 상태다. 빈 목록과 0 은 깨진 응답이 아니다. */
test('빈 런도 정상으로 읽는다', () => {
  const coverage = parseRunCoverage({ testRunId: '70', total: 88, covered: 0, uncovered: 88, scenarios: [] })

  assert.deepEqual(coverage.scenarios, [])
  assert.equal(coverage.uncovered, 88)
})

/** id 없는 줄은 가리킬 대상이 없다 — 세어도 열 수 없으니 버린다. */
test('id 없는 줄과 이상한 값은 버리거나 0 으로 읽는다', () => {
  const coverage = parseRunCoverage({
    total: '여든여덟',
    covered: null,
    scenarios: [
      { position: 0, title: 'id 없음', steps: 3, cases: 1 },
      { position: 1, testScenarioId: '2', title: '정상', steps: null, cases: undefined },
      '줄이 아님',
    ],
  })

  assert.equal(coverage.total, 0)
  assert.equal(coverage.covered, 0)
  assert.deepEqual(coverage.scenarios.map((row) => [row.title, row.steps, row.cases]), [['정상', 0, 0]])
})
