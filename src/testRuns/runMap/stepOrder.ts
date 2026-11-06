import type { MapStep } from './runMapModel'

/** 서랍에서 한 번에 끄는 단위. TC 하나에 든 연속 스텝은 묶음 하나, TC 없는 스텝은 하나씩. */
export type StepBlock =
  | { kind: 'tc'; tc: number; start: number; end: number }
  | { kind: 'step'; index: number }

/** [from]..[to] 스텝을 끄는 단위로 나눈다. 같은 TC 번호가 이어지는 동안이 묶음 하나다. GAP 스텝은 늘 따로. */
export function stepBlocks(steps: readonly MapStep[], from: number, to: number): StepBlock[] {
  const blocks: StepBlock[] = []
  for (let index = from; index <= to; index += 1) {
    const step = steps[index]
    const last = blocks[blocks.length - 1]
    if (step.tc !== null && !step.gap) {
      if (last?.kind === 'tc' && last.tc === step.tc && last.end === index - 1) last.end = index
      else blocks.push({ kind: 'tc', tc: step.tc, start: index, end: index })
    } else blocks.push({ kind: 'step', index })
  }
  return blocks
}

/**
 * [start]..[end] 스텝을 떼어 [before] 자리(원래 순번, 0..길이) 앞으로 옮긴다. 제자리에 놓으면 null.
 * 묶음 안쪽에 놓으면 null 이다(자기 안으로는 옮길 수 없다).
 */
export function moveRange<T>(items: readonly T[], start: number, end: number, before: number): T[] | null {
  if (before >= start && before <= end + 1) return null
  const block = items.slice(start, end + 1)
  const rest = [...items.slice(0, start), ...items.slice(end + 1)]
  const at = before > end ? before - block.length : before
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}
