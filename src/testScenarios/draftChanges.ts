import type { ScenarioStep } from './scenarioTypes'

/** 한 스텝이 이번 변경에서 어떻게 되었나(ARTEL-1075). 화면은 `changed` 를 노랑, `added` 를 초록으로 칠한다. */
export type StepMark = 'same' | 'changed' | 'added'

export type DraftChanges = {
  /** 지금 스텝마다 하나. */
  marks: StepMark[]
  /** 기준에는 있었는데 지금은 없는 스텝 수. 칠할 줄이 없어 수로만 알린다. */
  removed: number
}

/** 같은 스텝인지 가르는 칸. 하나라도 다르면 바뀐 스텝이다. */
function keyOf(step: ScenarioStep): string {
  return JSON.stringify([step.action.trim(), step.case_id, step.input ?? null, step.hint ?? null, step.step_kind ?? null])
}

/**
 * draft 의 스텝을 기준(`base_steps`)과 견준다. 기준이 없으면(처음 생긴 새 draft) 견줄 것이 없어 null 이다.
 *
 * 그대로인 스텝은 가장 긴 공통 순서로 고정한다. 그 사이에 남은 것끼리는 순서대로 짝지어 "바뀐 것" 으로 보고,
 * 짝이 없는 지금 스텝은 "새로 들어온 것", 짝이 없는 기준 스텝은 "빠진 것" 이다. 순서만 바꾼 스텝은 바뀐
 * 것으로 보인다 — 자리가 달라졌으니 사람이 다시 봐야 하는 것은 같다.
 */
export function compareDraftSteps(
  base: readonly ScenarioStep[] | null,
  current: readonly ScenarioStep[],
): DraftChanges | null {
  if (base === null) return null
  const before = base.map(keyOf)
  const after = current.map(keyOf)
  // 가장 긴 공통 순서. 스텝은 수십 개라 표 하나로 충분하다.
  const table: number[][] = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const marks: StepMark[] = new Array<StepMark>(after.length).fill('added')
  let removed = 0
  let i = 0
  let j = 0
  let gapBefore = 0
  const gapAfter: number[] = []
  const closeGap = () => {
    gapAfter.forEach((index, n) => { marks[index] = n < gapBefore ? 'changed' : 'added' })
    removed += Math.max(0, gapBefore - gapAfter.length)
    gapBefore = 0
    gapAfter.length = 0
  }
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      closeGap()
      marks[j] = 'same'
      i += 1
      j += 1
    } else if (j < after.length && (i >= before.length || table[i][j + 1] >= table[i + 1][j])) {
      gapAfter.push(j)
      j += 1
    } else {
      gapBefore += 1
      i += 1
    }
  }
  closeGap()
  return { marks, removed }
}
