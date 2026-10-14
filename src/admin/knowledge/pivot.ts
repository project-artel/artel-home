import type { Axis, KnowledgeStatsCell, KnowledgeStatsTotals } from './knowledgeStatsTypes'

/** 축 하나로 접은 한 줄. `value`가 null이면 미상 그룹이다. */
export interface AxisGroup extends KnowledgeStatsTotals {
  value: string | null
}

/**
 * 인용률.
 *
 * 분모가 `retrievalTotal`이 아니라 `citationKnownTotal`이다. 인용 보고 기능이 붙기 전 검색은
 * 인용 여부를 **알 수 없고**, 그것을 분모에 넣으면 그 시절의 검색이 전부 "아무도 안 씀"으로
 * 계산되어 지식창고가 실제보다 훨씬 쓸모없어 보인다.
 *
 * 알 수 있었던 검색이 하나도 없으면 null이다 — 0%로 쓰면 "전부 사장됐다"와 같은 글자가 된다.
 */
export function citationRate(row: KnowledgeStatsTotals): number | null {
  return row.citationKnownTotal === 0 ? null : row.citationTotal / row.citationKnownTotal
}

/**
 * 인용 판정 커버리지 — 검색 중 인용 여부를 알 수 있었던 비율.
 *
 * 인용률 옆에 반드시 함께 놓는다. 커버리지가 5%인 셀의 인용률 100%는 스무 번 중 한 번을 보고
 * 내린 판단이고, 그 사실이 숫자 옆에 없으면 아무도 의심하지 않는다.
 */
export function citationCoverage(row: KnowledgeStatsTotals): number | null {
  return row.retrievalTotal === 0 ? null : row.citationKnownTotal / row.retrievalTotal
}

/**
 * 후속 런이 지운 비율.
 *
 * **수리와 폐기가 섞인 값이다.** 지우고 다시 기록하는 경로가 살아 있어 수리 한 번이
 * DELETE + CREATE로 나가면 여기 잡힌다(ARTEL-274로 갈리기 전까지). 화면은 이것을 폐기율이라고
 * 단정하지 말고 "후속 런이 손댐"으로 읽히게 써야 한다.
 *
 * 만든 버전이 없으면 null이다.
 */
export function repudiationRate(row: KnowledgeStatsTotals): number | null {
  return row.entryVersions === 0 ? null : row.repudiatedVersions / row.entryVersions
}

/**
 * 만든 버전 중 아직 최신인 비율.
 *
 * 최신이 아닌 것에는 두 종류가 섞인다 — 나중 수정에 밀린 것과 지워진 것. 그래서 이 값만으로
 * 품질을 읽으면 안 되고, 폐기율과 나란히 봐야 "고쳐졌다"와 "버려졌다"가 갈린다.
 */
export function currentRate(row: KnowledgeStatsTotals): number | null {
  return row.entryVersions === 0 ? null : row.currentVersions / row.entryVersions
}

/** 여러 셀을 하나로 접는다. 버전은 셀로 분할되므로 이 합이 곧 부분합이다. */
export function sumCells(cells: KnowledgeStatsTotals[]): KnowledgeStatsTotals {
  return {
    entryVersions: total(cells, (cell) => cell.entryVersions),
    currentVersions: total(cells, (cell) => cell.currentVersions),
    deletedVersions: total(cells, (cell) => cell.deletedVersions),
    repudiatedVersions: total(cells, (cell) => cell.repudiatedVersions),
    retrievalTotal: total(cells, (cell) => cell.retrievalTotal),
    citationTotal: total(cells, (cell) => cell.citationTotal),
    citationKnownTotal: total(cells, (cell) => cell.citationKnownTotal),
  }
}

function total(
  cells: KnowledgeStatsTotals[],
  pick: (cell: KnowledgeStatsTotals) => number,
): number {
  return cells.reduce((sum, cell) => sum + pick(cell), 0)
}

/**
 * 축 하나로 분해한다. 만든 버전 수 내림차순이고 미상 그룹은 항상 끝이다 — 값이 아닌 그룹이
 * 실제 축 값 사이에 끼면 목록이 어느 순서로 읽히는지 알 수 없다.
 */
export function breakdown(cells: KnowledgeStatsCell[], axis: Axis): AxisGroup[] {
  const groups = new Map<string, KnowledgeStatsCell[]>()

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
  if (a.entryVersions !== b.entryVersions) return b.entryVersions - a.entryVersions
  return (a.value ?? '').localeCompare(b.value ?? '')
}

/** null과 문자열 `"null"`을 같은 키로 접지 않기 위한 구분자. */
function keyOf(value: string | null): string {
  return value === null ? ' null' : `s${value}`
}
