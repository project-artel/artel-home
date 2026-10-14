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

/**
 * 이름 하나를 켜고 끈다.
 *
 * 결과가 catalog 전부면 목록이 아니라 `null` 로 돌려준다. "전부" 와 "전부를 나열한 목록" 은 지금은 같지만,
 * 다음 revision 에 항목이 늘면 앞의 것은 새 항목을 포함하고 뒤의 것은 포함하지 않는다.
 */
export function toggleAllowedName(
  allowed: string[] | null,
  catalogNames: readonly string[],
  name: string,
): string[] | null {
  const current = allowedNames(allowed, catalogNames)
  const next = current.includes(name)
    ? current.filter((candidate) => candidate !== name)
    : catalogNames.filter((candidate) => candidate === name || current.includes(candidate))
  return next.length === catalogNames.length ? null : next
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
