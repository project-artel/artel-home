import type { QaStepVerdict } from '../qaVerdictApi'

/** 판정 근거 표의 한 줄: 판정에 그 판정이 난 시나리오 실행을 붙인 것. */
export type VerdictRow = QaStepVerdict & {
  qaTryId: string
  scenarioTitle: string
  scenarioOrdinal: number
}

/** 줄의 정체. 주소(`?try=&step=`)와 같은 두 값이다. */
export function rowKey(row: { qaTryId: string; step: number }): string {
  return `${row.qaTryId}:${row.step}`
}
