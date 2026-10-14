import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  breakdown,
  casePassRate,
  completionRate,
  falseAlarmRate,
  matrix,
  missRate,
  scoreCoverage,
  stepPassRate,
  sumCells,
  unreportedRate,
  verdictCoverage,
} from './pivot'
import type { QaStatsCell } from './qaStatsTypes'

/**
 * 이 파일이 지키는 것은 산술이다.
 *
 * 화면이 서버를 다시 부르지 않고 축을 바꿀 수 있는 이유는 런이 4축 조합으로 분할되어 있어서
 * 어떤 분해든 같은 셀 목록의 부분합이라는 데 있다. 그 부분합이 틀리면 숫자는 여전히 그럴듯해
 * 보이고, 화면만 봐서는 잡히지 않는다.
 */

function cell(overrides: Partial<QaStatsCell>): QaStatsCell {
  return {
    model: 'sonnet-5',
    reasoningEffort: 'high',
    promptVersion: 'v3',
    agentArch: 'v2-tool-loop',
    runs: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    active: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    costUsd: null,
    llmCalls: 0,
    avgCompletedDurationMs: null,
    verdictKnown: 0,
    stepsTotal: 0,
    stepsPassed: 0,
    casesTotal: 0,
    casesPassed: 0,
    scoredRuns: 0,
    correctPass: 0,
    falseAlarm: 0,
    miss: 0,
    correctFail: 0,
    unreported: 0,
    ...overrides,
  }
}

/** Same tolerance as vitest's `toBeCloseTo`; null never counts as close. */
function assertClose(actual: number | null, expected: number) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs((actual as number) - expected) < 1e-2, `${actual} is not close to ${expected}`)
}

describe('completionRate', () => {
  it('진행 중과 취소를 분모에서 뺀다', () => {
    // 방금 시작한 런과 운영자가 멈춘 런은 설정의 성질이 아니다.
    const rate = completionRate(cell({ runs: 10, completed: 3, failed: 1, cancelled: 4, active: 2 }))
    assertClose(rate, 0.75)
  })

  it('판정된 런이 없으면 0%가 아니라 null이다', () => {
    // 0%로 쓰면 "전부 실패"와 같은 글자가 된다.
    assert.equal(completionRate(cell({ runs: 2, active: 2 })), null)
  })
})

describe('sumCells', () => {
  it('단가를 아는 셀이 없으면 비용은 null로 남는다', () => {
    const summed = sumCells([cell({ runs: 1, costUsd: null }), cell({ runs: 1, costUsd: null })])
    // 0으로 접으면 "공짜"가 된다.
    assert.equal(summed.costUsd, null)
  })

  it('일부만 단가를 알면 아는 것만 더한다', () => {
    const summed = sumCells([cell({ costUsd: 0.5 }), cell({ costUsd: null }), cell({ costUsd: 0.25 })])
    assertClose(summed.costUsd, 0.75)
  })

  it('평균 소요는 완주 런 수로 가중한다', () => {
    // 1건짜리 셀이 100건짜리 셀과 같은 무게를 가지면 안 된다.
    const summed = sumCells([
      cell({ completed: 1, avgCompletedDurationMs: 100_000 }),
      cell({ completed: 9, avgCompletedDurationMs: 10_000 }),
    ])
    assertClose(summed.avgCompletedDurationMs, 19_000)
  })

  it('완주한 런이 없으면 평균 소요는 null이다', () => {
    assert.equal(sumCells([cell({ runs: 3, failed: 3 })]).avgCompletedDurationMs, null)
  })
})

describe('coverage', () => {
  it('판정 커버리지와 채점 커버리지가 서로 다른 수다', () => {
    // 요약은 받았지만 시나리오에 기대 라벨이 없어 채점 대상이 아닌 런이 있다. 하나로 합치면
    // "라벨을 안 달아서 점수가 없다"와 "런이 죽어서 점수가 없다"가 섞인다.
    const row = cell({ runs: 10, verdictKnown: 8, scoredRuns: 3 })
    assertClose(verdictCoverage(row), 0.8)
    assertClose(scoreCoverage(row), 0.3)
  })

  it('런이 없으면 커버리지는 0%가 아니라 null이다', () => {
    assert.equal(verdictCoverage(cell({})), null)
    assert.equal(scoreCoverage(cell({})), null)
  })
})

describe('pass rates', () => {
  it('판정을 아는 런이 없으면 합격률은 null이다', () => {
    // 0%로 쓰면 "전부 실패"와 같은 글자가 되고, 잘 죽는 설정이 최악으로 과대평가된다.
    assert.equal(stepPassRate(cell({ runs: 4, verdictKnown: 0 })), null)
    assert.equal(casePassRate(cell({ runs: 4, verdictKnown: 0 })), null)
  })

  it('case_id 없이 저작된 시나리오만 돌면 TC 합격률이 null이다', () => {
    // 스텝은 쟀지만 TC는 잴 것이 없었다. 0%가 아니다.
    const row = cell({ runs: 1, verdictKnown: 1, stepsTotal: 5, stepsPassed: 4 })
    assertClose(stepPassRate(row), 0.8)
    assert.equal(casePassRate(row), null)
  })
})

describe('confusion matrix rates', () => {
  it('미탐과 오탐이 서로 다른 분모를 쓴다', () => {
    // 실패 기대 2개 중 1개를 놓쳤고, 통과 기대 8개 중 1개를 잘못 실패라 했다. 같은 분모로
    // 나누면 미탐률이 구조적으로 작아 보이고, 실패 기대 스텝이 적은 시나리오가 정확히 이
    // 지표가 필요한 경우다.
    const row = cell({ correctPass: 7, falseAlarm: 1, miss: 1, correctFail: 1 })
    assertClose(missRate(row), 0.5)
    assertClose(falseAlarmRate(row), 0.125)
  })

  it('미보고 스텝이 두 비율의 분모에 들지 않는다', () => {
    // 방향조차 알 수 없는 스텝이다. 어느 쪽에 넣어도 그 방향을 지어내는 것이 된다.
    const row = cell({ correctPass: 1, falseAlarm: 0, miss: 0, correctFail: 1, unreported: 8 })
    assertClose(missRate(row), 0)
    assertClose(falseAlarmRate(row), 0)
    assertClose(unreportedRate(row), 0.8)
  })

  it('그 방향의 기대 스텝이 없으면 0%가 아니라 null이다', () => {
    // 실패 기대 스텝이 하나도 없는 시나리오는 "전부 통과"라 답하는 모델을 걸러내지 못한다.
    // 그 사실을 0%(완벽)로 쓰면 정확히 반대로 읽힌다.
    const lenientScenario = cell({ correctPass: 5, falseAlarm: 0, miss: 0, correctFail: 0 })
    assert.equal(missRate(lenientScenario), null)
    assertClose(falseAlarmRate(lenientScenario), 0)
  })

  it('채점 대상 스텝이 없으면 미보고율도 null이다', () => {
    assert.equal(unreportedRate(cell({ runs: 3 })), null)
  })
})

describe('sumCells with scores', () => {
  it('셀을 접어도 판정과 채점의 분모가 함께 따라온다', () => {
    const summed = sumCells([
      cell({ runs: 2, verdictKnown: 2, stepsTotal: 10, stepsPassed: 8, scoredRuns: 1, miss: 1, correctFail: 1 }),
      cell({ runs: 3, verdictKnown: 1, stepsTotal: 5, stepsPassed: 5, scoredRuns: 0 }),
    ])
    assert.equal(summed.runs, 5)
    assert.equal(summed.verdictKnown, 3)
    assert.equal(summed.scoredRuns, 1)
    assertClose(stepPassRate(summed), 13 / 15)
    // 합격률은 다섯 런이 아니라 세 런 위에 얹혀 있다. 이 값이 같이 따라오지 않으면 그 사실이
    // 접는 순간 사라진다.
    assertClose(verdictCoverage(summed), 0.6)
    assertClose(missRate(summed), 0.5)
  })

  it('점수가 없는 셀이 접기에서 사라지지 않는다', () => {
    // 사라지면 셀 합이 총계와 어긋나고, 화면에는 그 차이를 설명할 자리가 없다.
    const summed = sumCells([cell({ runs: 4 }), cell({ runs: 1, scoredRuns: 1, correctPass: 2 })])
    assert.equal(summed.runs, 5)
    assertClose(scoreCoverage(summed), 0.2)
  })
})

describe('breakdown', () => {
  const cells = [
    cell({ model: 'sonnet-5', agentArch: 'v1', runs: 5, completed: 4, failed: 1 }),
    cell({ model: 'sonnet-5', agentArch: 'v2', runs: 3, completed: 1, failed: 2 }),
    cell({ model: 'gpt-4o', agentArch: 'v1', runs: 2, completed: 2 }),
    cell({ model: null, agentArch: null, runs: 1, completed: 1 }),
  ]

  it('축별 합이 전체 런 수와 같다', () => {
    // 어느 축으로 접든 같은 런을 다르게 묶었을 뿐이다. 어긋나면 셀이 분할이 아니라는 뜻이다.
    const byModel = breakdown(cells, 'model').reduce((sum, group) => sum + group.runs, 0)
    const byArch = breakdown(cells, 'agentArch').reduce((sum, group) => sum + group.runs, 0)
    assert.equal(byModel, 11)
    assert.equal(byArch, 11)
  })

  it('미상 그룹을 버리지 않고 끝에 둔다', () => {
    const groups = breakdown(cells, 'model')
    assert.deepEqual(groups.map((group) => group.value), ['sonnet-5', 'gpt-4o', null])
    assert.equal(groups.at(-1)?.runs, 1)
  })

  it('같은 축 값의 셀을 하나로 접는다', () => {
    const sonnet = breakdown(cells, 'model').find((group) => group.value === 'sonnet-5')
    assert.equal(sonnet?.runs, 8)
    assert.equal(sonnet?.completed, 5)
    assertClose(completionRate(sonnet!), 5 / 8)
  })
})

describe('matrix', () => {
  const cells = [
    cell({ model: 'sonnet-5', agentArch: 'v1', runs: 5, completed: 5 }),
    cell({ model: 'sonnet-5', agentArch: 'v2', runs: 3, completed: 1, failed: 2 }),
    cell({ model: 'gpt-4o', agentArch: 'v1', runs: 2, completed: 2 }),
  ]

  it('돌려 보지 않은 조합은 0이 아니라 빈 칸이다', () => {
    const view = matrix(cells, 'model', 'agentArch')
    const gptRow = view.rowValues.indexOf('gpt-4o')
    const v2Col = view.colValues.indexOf('v2')
    // 0건으로 그리면 실험 공백이 "전부 실패"로 읽힌다.
    assert.equal(view.grid[gptRow][v2Col], null)
  })

  it('행·열 합계가 서로, 그리고 전체와 맞는다', () => {
    const view = matrix(cells, 'model', 'agentArch')
    const rowSum = view.rowTotals.reduce((sum, row) => sum + row.runs, 0)
    const colSum = view.colTotals.reduce((sum, col) => sum + col.runs, 0)
    assert.equal(rowSum, 10)
    assert.equal(colSum, 10)
  })

  it('축 값 순서가 단일 축 분해와 같다', () => {
    // 두 표를 나란히 읽는 사람이 행 순서를 다시 익히지 않아야 한다.
    const view = matrix(cells, 'model', 'agentArch')
    assert.deepEqual(view.rowValues, breakdown(cells, 'model').map((group) => group.value))
  })
})
