export type QaEngine = 'agent' | 'planner_executer'

export const QA_ENGINES: readonly QaEngine[] = ['agent', 'planner_executer']

/** 폼에서 고른 값. `undefined` 는 서버 기본값을 그대로 쓴다는 뜻이다. */
type QaArchValue = string | number | boolean
export type QaArchSelection = Partial<Record<string, QaArchValue>> & { engine?: QaEngine }

/**
 * 서버로 보내는 body.
 *
 * `agent` 는 label 과 바꾼 knob 만 있고 `engine` 키는 없다 — 서버 기본 엔진이다.
 * `planner_executer` 는 `engine` 하나뿐이다. 그 run 의 `agent_arch` 는 서버가 planner label 로
 * 적으므로 top-level label 이 필요 없고, tool loop knob 은 보내도 기록만 되고 쓰이지 않는다. 쓰이지
 * 않는 값이 run 기록에 남으면 그 run 을 읽는 사람이 그 값으로 돌았다고 오해한다.
 */
export type QaArchRequest = QaArchSelection & { label?: string }

export type QaArchAxis = { labelCode: string; description: { ko: string; en: string }; engines: readonly string[] } & (
    | { key: string; kind: 'choice'; values: readonly string[]; visionOnlyValues?: readonly string[]; unavailableWhen?: readonly { key: string; equals: QaArchValue; values: readonly string[] }[] }
    | { key: string; kind: 'toggle' }
    | { key: string; kind: 'number'; min: number; max: number }
  )

export const EMPTY_ARCH_SELECTION: QaArchSelection = {}

export function changedSettingCount(selection: QaArchSelection, axes: readonly QaArchAxis[]): number {
  return axes.filter((axis) => axis.engines.includes(archEngine(selection)) && selection[axis.key] !== undefined).length
}

export function archEngine(selection: QaArchSelection): QaEngine {
  return selection.engine ?? 'agent'
}

/** 엔진을 바꾼 새 selection. knob 은 그대로 둔다 — `agent` 로 돌아오면 고른 값이 다시 산다. `agent` 면 키를 지운다. */
export function withEngine(selection: QaArchSelection, engine: QaEngine): QaArchSelection {
  const next: QaArchSelection = { ...selection, engine }
  if (engine === 'agent') delete next.engine
  return next
}

/**
 * 통계에서 기존 설정과 계속 묶이도록 labelCode 와 choice 값의 순서를 유지한다.
 * 각 항목은 축 코드와 36진수 값으로 구성한다. 50자를 넘는 조합은 해시로 구분한다.
 */
export function toArchRequest(selection: QaArchSelection, axes: readonly QaArchAxis[]): QaArchRequest | null {
  const engine = archEngine(selection)

  const overrides: QaArchSelection = {}
  const labelParts: string[] = []
  for (const axis of axes) {
    const value = selection[axis.key]
    if (value === undefined || !axis.engines.includes(engine)) continue
    if (!axisAccepts(axis, value)) throw new Error('Invalid QA setting: ' + axis.key)
    overrides[axis.key] = value

    const encodedValue = typeof value === 'string' && axis.kind === 'choice'
      ? axis.values.indexOf(value)
      : Number(value)
    labelParts.push(axis.labelCode + encodedValue.toString(36))
  }

  if (engine === 'planner_executer') return { ...overrides, engine }
  if (labelParts.length === 0) return null
  const label = 'web-v1-' + labelParts.sort().join('-')
  if (label.length <= 50) return { label, ...overrides }

  // 기존 label에 맞지 않는 조합만 64비트 FNV-1a로 줄인다.
  let hash = 0xcbf29ce484222325n
  for (const char of label) hash = BigInt.asUintN(64, (hash ^ BigInt(char.charCodeAt(0))) * 0x100000001b3n)
  return { label: 'web-v2-' + hash.toString(16).padStart(16, '0'), ...overrides }
}

export function choiceUnavailable(axis: Extract<QaArchAxis, { kind: 'choice' }>, value: string, selection: QaArchSelection, readsImages: boolean): boolean {
  return (!readsImages && (axis.visionOnlyValues?.includes(value) ?? false)) ||
    (axis.unavailableWhen?.some((rule) => selection[rule.key] === rule.equals && rule.values.includes(value)) ?? false)
}

export function availableArch(selection: QaArchSelection, axes: readonly QaArchAxis[], readsImages: boolean): QaArchSelection {
  let result = selection
  for (const axis of axes) {
    if (axis.kind !== 'choice') continue
    const value = result[axis.key]
    if (typeof value === 'string' && choiceUnavailable(axis, value, selection, readsImages)) {
      result = withKnob(result, axis.key, undefined)
    }
  }
  return result
}

/** 한 knob 을 바꾼 새 selection. value 가 undefined 면 키를 지운다. */
export function withKnob(
  selection: QaArchSelection,
  key: string,
  value: QaArchValue | undefined,
): QaArchSelection {
  const next = { ...selection, [key]: value }
  if (value === undefined) delete next[key]
  return next
}

function axisAccepts(axis: QaArchAxis, value: unknown): boolean {
  switch (axis.kind) {
    case 'choice':
      return typeof value === 'string' && axis.values.includes(value)
    case 'toggle':
      return typeof value === 'boolean'
    case 'number':
      return typeof value === 'number' && Number.isInteger(value) && value >= axis.min && value <= axis.max
  }
}

/**
 * localStorage 등에서 읽은 unknown 을 selection 으로. 모르는 키, 축에 없는 값, 범위 밖 숫자는 버린다. object 가 아니면 null. 이전에 저장된 label 은 읽지 않는다.
 * `engine` 이 없거나 모르는 값이면 `agent` 다(키를 두지 않는다).
 */
export function parseArchSelection(raw: unknown, axes: readonly QaArchAxis[]): QaArchSelection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const fields = new Map(Object.entries(raw))
  let result: QaArchSelection = {}
  if (fields.get('engine') === 'planner_executer') result = { ...result, engine: 'planner_executer' }
  for (const axis of axes) {
    const value = fields.get(axis.key)
    if (value !== undefined && axisAccepts(axis, value)) {
      result = { ...result, [axis.key]: value }
    }
  }
  return result
}
