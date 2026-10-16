import type { FunctionChoiceKind } from '../projects/gameFunctions'
import { asRecord } from '../projects/projectApi'

/**
 * run 을 시작할 때 고르는 cheat · behavior 옵션과, 시작한 run 이 돌려주는 같은 옵션(ARTEL-1051 계약 5절).
 */

export type QaFunctionMode = 'on' | 'off'

/** 시작 요청에 실리는 옵션. `null` 인 목록은 "catalog 전부" 다. */
export type QaFunctionOptions = {
  cheatMode: QaFunctionMode
  behaviorMode: QaFunctionMode
  allowedCheats: string[] | null
  allowedBehaviors: string[] | null
}

/** 서버 기본값과 같다. 아무것도 건드리지 않은 시작이 옵션을 안 보낸 시작과 같은 run 을 만든다. */
export const DEFAULT_QA_FUNCTION_OPTIONS: QaFunctionOptions = {
  cheatMode: 'on',
  behaviorMode: 'on',
  allowedCheats: null,
  allowedBehaviors: null,
}

/**
 * 요청 본문에 넣을 필드. 끈 쪽의 목록은 보내지 않고 `null` 로 둔다 — 꺼진 기능에 남은 선택은 서버가
 * 쓰지 않고, 보내면 저장된 run 설정에 쓰이지 않은 목록이 남는다.
 */
export function functionOptionsRequestFields(options: QaFunctionOptions): QaFunctionOptions {
  return {
    cheatMode: options.cheatMode,
    behaviorMode: options.behaviorMode,
    allowedCheats: options.cheatMode === 'on' ? options.allowedCheats : null,
    allowedBehaviors: options.behaviorMode === 'on' ? options.allowedBehaviors : null,
  }
}

/** 지금 허용된 이름의 집합. `null` 은 catalog 전부다. */
export function allowedNames(allowed: string[] | null, catalogNames: readonly string[]): string[] {
  return allowed === null ? [...catalogNames] : catalogNames.filter((name) => allowed.includes(name))
}

export type QaFunctionAxis = 'cheats' | 'behaviors'

const AXIS_FIELDS = {
  cheats: { mode: 'cheatMode', allowed: 'allowedCheats' },
  behaviors: { mode: 'behaviorMode', allowed: 'allowedBehaviors' },
} as const

/** 화면의 세 가지 중 지금 어느 것인가. mode 가 꺼져 있으면 `none`, 목록이 `null` 이면 `all` 이다. */
export function runChoiceKind(options: QaFunctionOptions, axis: QaFunctionAxis): FunctionChoiceKind {
  const fields = AXIS_FIELDS[axis]
  if (options[fields.mode] === 'off') return 'none'
  return options[fields.allowed] === null ? 'all' : 'chosen'
}

/**
 * 세 가지 중 하나로 바꾼다. `none` 은 mode 를 끄고, `all` 은 mode 를 켜고 목록을 `null` 로 둔다.
 * `chosen` 은 이미 고른 목록이 있으면 이어받고, 없으면 catalog 전부가 체크된 목록에서 시작한다 —
 * 대개 몇 개를 빼려고 여는 것이라서다.
 */
export function changeRunChoiceKind(
  options: QaFunctionOptions,
  axis: QaFunctionAxis,
  kind: FunctionChoiceKind,
  catalogNames: readonly string[],
): QaFunctionOptions {
  const fields = AXIS_FIELDS[axis]
  if (kind === 'none') return { ...options, [fields.mode]: 'off' }
  if (kind === 'all') return { ...options, [fields.mode]: 'on', [fields.allowed]: null }
  const current = options[fields.allowed]
  return { ...options, [fields.mode]: 'on', [fields.allowed]: current ?? [...catalogNames] }
}

/**
 * 직접 고른 목록에서 이름 하나를 켜고 끈다. 목록은 catalog 순서를 따르고, catalog 에 없는 이름은 떨어진다.
 *
 * 전부를 다시 체크해도 `null` 로 바꾸지 않는다. "전부" 와 "전부를 나열한 목록" 은 지금은 같지만, 다음
 * revision 에 항목이 늘면 앞의 것은 새 항목을 포함하고 뒤의 것은 포함하지 않는다. 사용자가 "직접 선택" 을
 * 골랐으면 뒤의 것이다.
 */
export function toggleChosenRunName(
  allowed: string[] | null,
  catalogNames: readonly string[],
  name: string,
): string[] {
  const current = allowedNames(allowed, catalogNames)
  return current.includes(name)
    ? current.filter((candidate) => candidate !== name)
    : catalogNames.filter((candidate) => candidate === name || current.includes(candidate))
}

/** 접힌 고급 설정에 보이는 한 줄의 문구. */
export type FunctionOptionsSummaryText = {
  /** 둘 다 전부 허용. catalog 를 모르면 개수는 null. */
  allAllowed: (cheats: number | null, behaviors: number | null) => string
  axisName: Record<QaFunctionAxis, string>
  axisAll: (axis: string, total: number | null) => string
  axisNone: (axis: string) => string
  axisChosen: (axis: string, selected: number, total: number | null) => string
}

/**
 * 접힌 고급 설정의 한 줄. 펼치지 않아도 이 run 에서 에이전트가 무엇을 받는지 알 수 있게 한다.
 * `catalog` 는 이름을 읽어 온 빌드의 이름 목록이고, 모르면(빌드 없음 · 불러오는 중 · 실패) null 이다.
 */
export function functionOptionsSummary(
  options: QaFunctionOptions,
  catalog: Record<QaFunctionAxis, readonly string[]> | null,
  text: FunctionOptionsSummaryText,
): string {
  const axes: QaFunctionAxis[] = ['cheats', 'behaviors']
  const kinds = axes.map((axis) => runChoiceKind(options, axis))
  if (kinds.every((kind) => kind === 'all')) {
    return text.allAllowed(catalog?.cheats.length ?? null, catalog?.behaviors.length ?? null)
  }
  return axes
    .map((axis, index) => {
      const name = text.axisName[axis]
      const total = catalog?.[axis].length ?? null
      const kind = kinds[index]
      if (kind === 'none') return text.axisNone(name)
      if (kind === 'all') return text.axisAll(name, total)
      const allowed = options[AXIS_FIELDS[axis].allowed] ?? []
      const selected = catalog === null ? allowed.length : allowedNames(allowed, catalog[axis]).length
      return text.axisChosen(name, selected, total)
    })
    .join(' · ')
}

/** run 상세 응답이 싣는 옵션. 옵션 필드가 하나도 없는 옛 run 은 이 값 자체가 null 이다. */
export type QaTryFunctionOptions = {
  cheatMode: QaFunctionMode | null
  behaviorMode: QaFunctionMode | null
  /** `null` 은 전부 허용. */
  allowedCheats: string[] | null
  allowedBehaviors: string[] | null
  /** 에이전트에게 실제로 보낸 이름. 응답에 없으면 null. */
  effectiveCheats: string[] | null
  effectiveBehaviors: string[] | null
}

function asMode(value: unknown): QaFunctionMode | null {
  return value === 'on' || value === 'off' ? value : null
}

function asNameList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((entry): entry is string => typeof entry === 'string')
}

const OPTION_FIELDS = [
  'cheatMode',
  'behaviorMode',
  'allowedCheats',
  'allowedBehaviors',
  'effectiveCheats',
  'effectiveBehaviors',
] as const

/**
 * 상세 응답에서 옵션을 읽는다. 여섯 필드 중 어느 것도 응답에 없으면 null — 이 기능 이전의 run 이고,
 * 화면은 아무것도 더 그리지 않는다. `null` 값과 "키가 없음" 을 가르는 이유는 `allowedCheats: null` 이
 * "전부 허용" 이라는 뜻을 갖기 때문이다.
 */
export function parseQaTryFunctionOptions(data: unknown): QaTryFunctionOptions | null {
  const record = asRecord(data)
  if (record === null) return null
  if (!OPTION_FIELDS.some((field) => field in record)) return null

  return {
    cheatMode: asMode(record.cheatMode),
    behaviorMode: asMode(record.behaviorMode),
    allowedCheats: asNameList(record.allowedCheats),
    allowedBehaviors: asNameList(record.allowedBehaviors),
    effectiveCheats: asNameList(record.effectiveCheats),
    effectiveBehaviors: asNameList(record.effectiveBehaviors),
  }
}
