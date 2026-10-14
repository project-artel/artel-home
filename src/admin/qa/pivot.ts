import type { Axis, QaStatsCell, QaStatsTotals } from './qaStatsTypes'

/**
 * 축 하나로 접은 한 줄.
 *
 * @property value 축 값. null이면 미상 그룹이다.
 */
export interface AxisGroup extends QaStatsTotals {
  value: string | null
}

export interface Matrix {
  rowAxis: Axis
  colAxis: Axis
  rowValues: (string | null)[]
  colValues: (string | null)[]
  /** `[row][col]` 셀. 그 조합으로 돈 런이 없으면 null이다(0건과 구분해 빈 칸으로 그린다). */
  grid: (QaStatsTotals | null)[][]
  rowTotals: QaStatsTotals[]
  colTotals: QaStatsTotals[]
}

/**
 * 완주율.
 *
 * 분모에서 **진행 중**과 **취소**를 뺀다. 진행 중인 런은 아직 결과가 없어 넣으면 방금 시작한
 * 설정이 무조건 나빠 보이고, 취소는 운영자의 행동이라 설정의 성질이 아니다. 남는 것은
 * "끝까지 갔거나 실패했거나" 둘뿐이고 그 비율만 설정끼리 비교할 수 있다.
 *
 * 판정할 런이 없으면 null이다 — 0%로 쓰면 "전부 실패"와 구분되지 않는다.
 */
export function completionRate(row: QaStatsTotals): number | null {
  const decided = row.completed + row.failed
  return decided === 0 ? null : row.completed / decided
}

/**
 * 판정 커버리지 — 이 묶음의 런 중 자기채점 요약을 받은 비율.
 *
 * 화면이 이 분모를 숨기면 안 된다. 합격률은 값이 있는 런만으로 계산되므로 "깔끔하게 종료된 런"에
 * 조건부이고, 잘 죽는 설정일수록 자기 최악 런이 빠져 **편향 크기가 축마다 다르다**. 두 설정의
 * 합격률을 나란히 놓고 비교하려면 이 값이 같은 자리에 있어야 한다.
 */
export function verdictCoverage(row: QaStatsTotals): number | null {
  return row.runs === 0 ? null : row.verdictKnown / row.runs
}

/**
 * 채점 커버리지 — 런 중 기대-라벨 채점을 받은 비율.
 *
 * [verdictCoverage]와 다른 수다. 요약은 받았지만 시나리오에 기대 라벨이 없어 채점 대상이 아닌
 * 런이 있고, 둘을 한 숫자로 쓰면 "라벨을 안 달아서 점수가 없다"와 "런이 죽어서 점수가 없다"가
 * 섞인다. 전자는 저작의 공백이고 후자는 설정의 성질이라 대응이 반대다.
 */
export function scoreCoverage(row: QaStatsTotals): number | null {
  return row.runs === 0 ? null : row.scoredRuns / row.runs
}

/** 스텝 합격률(자기채점). 판정을 아는 런이 없으면 null이다 — 0%로 쓰면 "전부 실패"가 된다. */
export function stepPassRate(row: QaStatsTotals): number | null {
  return row.verdictKnown === 0 || row.stepsTotal === 0 ? null : row.stepsPassed / row.stepsTotal
}

/** TC 합격률(자기채점). case_id 없이 저작된 시나리오만 돌았으면 분모가 0이라 null이다. */
export function casePassRate(row: QaStatsTotals): number | null {
  return row.verdictKnown === 0 || row.casesTotal === 0 ? null : row.casesPassed / row.casesTotal
}

/** 채점 대상이던 스텝 수. 혼동행렬 네 칸과 미보고를 합친 값이다. */
export function gradedSteps(row: QaStatsTotals): number {
  return row.correctPass + row.falseAlarm + row.miss + row.correctFail + row.unreported
}

/**
 * 미탐률 — **실패해야 하는 스텝 중** 통과라 보고한 비율.
 *
 * 분모가 오탐 쪽과 다르다. 두 방향을 같은 분모로 나누면 실패 기대 스텝이 한둘뿐인 시나리오에서
 * 미탐률이 구조적으로 작아 보이고, 그 시나리오가 정확히 이 지표가 필요한 경우다.
 *
 * 미보고 스텝은 분모에 넣지 않는다 — 그 스텝은 방향조차 알 수 없다. 빠진 몫은
 * [unreportedRate]가 따로 진다.
 */
export function missRate(row: QaStatsTotals): number | null {
  const shouldFail = row.miss + row.correctFail
  return shouldFail === 0 ? null : row.miss / shouldFail
}

/** 오탐률 — **통과해야 하는 스텝 중** 실패라 보고한 비율. */
export function falseAlarmRate(row: QaStatsTotals): number | null {
  const shouldPass = row.correctPass + row.falseAlarm
  return shouldPass === 0 ? null : row.falseAlarm / shouldPass
}

/** 미보고율 — 라벨이 있는데 판정이 오지 않은 스텝의 비율. 두 방향 비율의 신뢰도를 읽는 값이다. */
export function unreportedRate(row: QaStatsTotals): number | null {
  const graded = gradedSteps(row)
  return graded === 0 ? null : row.unreported / graded
}

/** 여러 셀을 하나로 접는다. 런은 셀로 분할되므로 이 합이 곧 부분합이다. */
export function sumCells(cells: QaStatsTotals[]): QaStatsTotals {
  const priced = cells.filter((cell) => cell.costUsd !== null)
  const timed = cells.filter((cell) => cell.avgCompletedDurationMs !== null && cell.completed > 0)
  const timedRuns = timed.reduce((sum, cell) => sum + cell.completed, 0)

  return {
    runs: total(cells, (cell) => cell.runs),
    completed: total(cells, (cell) => cell.completed),
    failed: total(cells, (cell) => cell.failed),
    cancelled: total(cells, (cell) => cell.cancelled),
    active: total(cells, (cell) => cell.active),
    inputTokens: total(cells, (cell) => cell.inputTokens),
    outputTokens: total(cells, (cell) => cell.outputTokens),
    cachedInputTokens: total(cells, (cell) => cell.cachedInputTokens),
    reasoningTokens: total(cells, (cell) => cell.reasoningTokens),
    // 단가를 아는 셀이 하나도 없으면 null을 유지한다. 0으로 접으면 "공짜"가 된다.
    costUsd: priced.length === 0 ? null : total(priced, (cell) => cell.costUsd ?? 0),
    llmCalls: total(cells, (cell) => cell.llmCalls),
    // 완주 런 수로 가중한다. 셀별 평균을 그냥 평균 내면 1건짜리 셀이 100건짜리 셀과 같은
    // 무게를 갖는다.
    avgCompletedDurationMs:
      timedRuns === 0
        ? null
        : timed.reduce(
            (sum, cell) => sum + (cell.avgCompletedDurationMs ?? 0) * cell.completed,
            0,
          ) / timedRuns,
    // 판정과 채점은 전부 합계다. 서버가 평균이 아니라 합계를 주는 이유와 같다 — 합계는 분모
    // 없이는 아무 비율도 낼 수 없어 커버리지를 함께 읽게 만든다. 여기서 미리 비율로 접으면
    // 셀을 접을 때마다 그 분모가 사라진다.
    verdictKnown: total(cells, (cell) => cell.verdictKnown),
    stepsTotal: total(cells, (cell) => cell.stepsTotal),
    stepsPassed: total(cells, (cell) => cell.stepsPassed),
    casesTotal: total(cells, (cell) => cell.casesTotal),
    casesPassed: total(cells, (cell) => cell.casesPassed),
    scoredRuns: total(cells, (cell) => cell.scoredRuns),
    correctPass: total(cells, (cell) => cell.correctPass),
    falseAlarm: total(cells, (cell) => cell.falseAlarm),
    miss: total(cells, (cell) => cell.miss),
    correctFail: total(cells, (cell) => cell.correctFail),
    unreported: total(cells, (cell) => cell.unreported),
  }
}

function total(cells: QaStatsTotals[], pick: (cell: QaStatsTotals) => number): number {
  return cells.reduce((sum, cell) => sum + pick(cell), 0)
}

/**
 * 축 하나로 분해한다. 런 수 내림차순이고 미상 그룹은 항상 끝이다 — 값이 아닌 그룹이 실제 축
 * 값 사이에 끼면 목록이 어느 순서로 읽히는지 알 수 없다.
 */
export function breakdown(cells: QaStatsCell[], axis: Axis): AxisGroup[] {
  const groups = new Map<string, QaStatsCell[]>()

  for (const cell of cells) {
    const key = keyOf(cell[axis])
    const bucket = groups.get(key)
    if (bucket) bucket.push(cell)
    else groups.set(key, [cell])
  }

  return [...groups.values()]
    .map((bucket) => ({ value: bucket[0][axis], ...sumCells(bucket) }))
    .sort(compareGroups)
}

function compareGroups(a: AxisGroup, b: AxisGroup): number {
  if ((a.value === null) !== (b.value === null)) return a.value === null ? 1 : -1
  if (a.runs !== b.runs) return b.runs - a.runs
  return (a.value ?? '').localeCompare(b.value ?? '')
}

/**
 * 두 축 교차표. 같은 축을 양쪽에 놓으면 대각선만 차는 표가 되므로 호출부가 막아야 한다.
 *
 * 빈 조합은 0이 아니라 null이다. "돌려 보고 전부 실패했다"와 "아직 안 돌려 봤다"는 다른 사실이고,
 * 둘을 0%로 같이 칠하면 실험 공백이 결과처럼 읽힌다.
 */
export function matrix(cells: QaStatsCell[], rowAxis: Axis, colAxis: Axis): Matrix {
  const rowValues = axisValues(cells, rowAxis)
  const colValues = axisValues(cells, colAxis)

  const buckets = new Map<string, QaStatsCell[]>()
  for (const cell of cells) {
    const key = `${keyOf(cell[rowAxis])} ${keyOf(cell[colAxis])}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(cell)
    else buckets.set(key, [cell])
  }

  const grid = rowValues.map((row) =>
    colValues.map((col) => {
      const bucket = buckets.get(`${keyOf(row)} ${keyOf(col)}`)
      return bucket ? sumCells(bucket) : null
    }),
  )

  return {
    rowAxis,
    colAxis,
    rowValues,
    colValues,
    grid,
    rowTotals: grid.map((row) => sumCells(row.filter(isPresent))),
    colTotals: colValues.map((_, index) =>
      sumCells(grid.map((row) => row[index]).filter(isPresent)),
    ),
  }
}

function isPresent(cell: QaStatsTotals | null): cell is QaStatsTotals {
  return cell !== null
}

/** 축에 나타난 값들. 런 수가 많은 순, 미상은 끝. `breakdown`과 같은 순서를 쓴다. */
function axisValues(cells: QaStatsCell[], axis: Axis): (string | null)[] {
  return breakdown(cells, axis).map((group) => group.value)
}

/** null과 문자열 `"null"`을 같은 키로 접지 않기 위한 구분자. */
function keyOf(value: string | null): string {
  return value === null ? ' null' : `s${value}`
}
