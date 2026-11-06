import type { FunctionChoiceKind } from '../projects/gameFunctions'
import { asRecord } from '../projects/projectApi'

/**
 * test case 가 에이전트에게 허락하는 cheat · behavior(ARTEL-1051 계약 4절).
 *
 * 각 축은 `"all"`, `"none"`, 이름 목록 셋 중 하나다. 키나 `functions` 전체가 없으면 `"all"` 이고,
 * run 단위 허용 목록을 좁히기만 하며 넓히지는 않는다.
 */
export type FunctionSelection = 'all' | 'none' | string[]

export type CaseFunctions = {
  cheats: FunctionSelection
  behaviors: FunctionSelection
}

export const ALL_CASE_FUNCTIONS: CaseFunctions = { cheats: 'all', behaviors: 'all' }

function asSelection(value: unknown): FunctionSelection {
  if (value === 'none') return 'none'
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  // "all", 키 없음, 모르는 값은 모두 기본값인 전부로 읽는다. 모르는 값을 "none" 으로 읽으면 에이전트가
  // 조용히 cheat 를 못 쓰게 되고, 그 원인이 화면에 없다.
  return 'all'
}

/** 응답에서 읽는다. `functions` 가 없으면 null — 서버가 이 필드를 아직 안 보내는 것과 "전부" 가 구분된다. */
export function parseCaseFunctions(data: unknown): CaseFunctions | null {
  const record = asRecord(data)
  if (record === null) return null
  return { cheats: asSelection(record.cheats), behaviors: asSelection(record.behaviors) }
}

export type SelectionKind = FunctionChoiceKind

export function selectionKind(selection: FunctionSelection): SelectionKind {
  return selection === 'all' || selection === 'none' ? selection : 'chosen'
}

/** 같은 selection 인가. 이름 목록은 순서가 달라도 같다. */
export function sameSelection(left: FunctionSelection, right: FunctionSelection): boolean {
  if (typeof left === 'string' || typeof right === 'string') return left === right
  return left.length === right.length && left.every((name) => right.includes(name))
}

export function sameCaseFunctions(left: CaseFunctions, right: CaseFunctions): boolean {
  return sameSelection(left.cheats, right.cheats) && sameSelection(left.behaviors, right.behaviors)
}

/**
 * 고르는 방식을 바꾼다. `chosen` 으로 바꿀 때는 지금 이름 목록을 이어받고, 이어받을 것이 없으면 빈 목록이다.
 * 빈 목록의 "고른 것 없음" 은 `none` 과 같은 뜻이지만 화면이 아직 이름을 고르는 중이라는 사실은 보존한다.
 */
export function changeSelectionKind(current: FunctionSelection, kind: SelectionKind): FunctionSelection {
  if (kind === 'chosen') return Array.isArray(current) ? current : []
  return kind
}

/** 이름 하나를 켜고 끈다. 이름 목록이 아닌 상태에서는 아무것도 하지 않는다. */
export function toggleChosenName(current: FunctionSelection, name: string): FunctionSelection {
  if (typeof current === 'string') return current
  return current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name]
}

/**
 * 서버가 받는 모양으로. 이름 목록이 비었으면 `none` 으로 보낸다 — 서버가 빈 목록을 어떻게 읽든 같은
 * 뜻이 되도록 계약에 있는 쓰기 값만 쓴다.
 */
export function toWireSelection(selection: FunctionSelection): FunctionSelection {
  return Array.isArray(selection) && selection.length === 0 ? 'none' : selection
}

export function toWireCaseFunctions(functions: CaseFunctions): CaseFunctions {
  return { cheats: toWireSelection(functions.cheats), behaviors: toWireSelection(functions.behaviors) }
}
