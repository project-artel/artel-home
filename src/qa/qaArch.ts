/*
 * QA run 을 시작할 때 고르는 agent 구조(arch)와, 서버로 보내는 body 로의 변환.
 *
 * 기본값은 값을 보내지 않는 것(키 생략)으로 나타낸다. 폼이 서버 기본값 숫자를 따로 들고 있으면
 * 서버가 기본값을 바꾸는 순간 낡은 사본이 된다. 사용자가 바꾼 knob 만 보내면 나머지는 항상 서버의
 * 현재 기본값이다.
 *
 * 콘솔은 실제 요청에 포함되는 설정값으로 label 을 만든다. 통계는 agent_arch 로 run 을 묶는다.
 *
 * 필드 이름과 값은 agent-server 의 `QaArchSpec` 과 같다. 여기에 없는 knob 은 폼이 다루지 않는
 * 것이다.
 *
 * `engine`(ARTEL-1119)은 위 knob 들과 축이 다르다. 13개 knob 은 모두 `agent` 엔진(tool loop)의
 * 것이고, `planner_executer` 는 그중 아무것도 읽지 않는다. 그래서 `QA_ARCH_AXES` 에 넣지 않고 따로
 * 둔다 — 넣으면 바꾼 knob 수에 엔진이 포함된다.
 */

export type QaPhaseCycle = 'off' | 'in_verdict' | 'lite' | 'full'
export type QaSkillsMode = 'off' | 'on_demand'
export type QaMacrosMode = 'off' | 'on'
export type QaScreenCapture = 'on_demand' | 'every_call' | 'by_role'
export type QaVisionMode = 'auto' | 'on' | 'off'
export type QaEngine = 'agent' | 'planner_executer'

export const QA_ENGINES: readonly QaEngine[] = ['agent', 'planner_executer']

/** 폼에서 고른 값. `undefined` 는 서버 기본값을 그대로 쓴다는 뜻이다. */
export type QaArchSelection = {
  phase_cycle?: QaPhaseCycle
  skills?: QaSkillsMode
  macros?: QaMacrosMode
  screen_capture?: QaScreenCapture
  vision?: QaVisionMode
  pulse_relevance?: boolean
  report_step_view?: boolean
  fold_stale_scenes?: boolean
  fold_stale_knowledge?: boolean
  fold_stale_skills?: boolean
  fold_stale_macro_results?: boolean
  fold_threshold_chars?: number
  compaction?: boolean
  /** 없으면 `agent` 다. `engine` 이 생기기 전에 저장된 값도 그렇게 읽힌다. */
  engine?: QaEngine
}

/**
 * 서버로 보내는 body.
 *
 * `agent` 는 label 과 바꾼 knob 만 있고 `engine` 키는 없다 — 서버 기본 엔진이다.
 * `planner_executer` 는 `engine` 하나뿐이다. 그 run 의 `agent_arch` 는 서버가 planner label 로
 * 적으므로 top-level label 이 필요 없고, tool loop knob 은 보내도 기록만 되고 쓰이지 않는다. 쓰이지
 * 않는 값이 run 기록에 남으면 그 run 을 읽는 사람이 그 값으로 돌았다고 오해한다.
 */
export type QaArchRequest =
  | (Omit<QaArchSelection, 'engine'> & { label: string })
  | { engine: 'planner_executer'; label?: never }
export type QaArchKnobKey = Exclude<keyof QaArchSelection, 'engine'>

export type QaArchAxis = { labelCode: string } & (
    | { key: QaArchKnobKey; kind: 'choice'; values: readonly string[]; visionOnlyValues?: readonly string[] }
    | { key: QaArchKnobKey; kind: 'toggle' }
    | { key: QaArchKnobKey; kind: 'number'; min: number; max: number }
  )

/** 폼이 보여 주는 축. 순서가 화면 순서다. */
export const QA_ARCH_AXES: readonly QaArchAxis[] = [
  { key: 'phase_cycle', labelCode: 'a', kind: 'choice', values: ['off', 'in_verdict', 'lite', 'full'] },
  { key: 'skills', labelCode: 'b', kind: 'choice', values: ['off', 'on_demand'] },
  { key: 'macros', labelCode: 'c', kind: 'choice', values: ['off', 'on'] },
  {
    key: 'screen_capture',
    labelCode: 'd',
    kind: 'choice',
    values: ['on_demand', 'every_call', 'by_role'],
    visionOnlyValues: ['every_call', 'by_role'],
  },
  { key: 'vision', labelCode: 'e', kind: 'choice', values: ['auto', 'on', 'off'], visionOnlyValues: ['on'] },
  { key: 'pulse_relevance', labelCode: 'f', kind: 'toggle' },
  { key: 'report_step_view', labelCode: 'g', kind: 'toggle' },
  { key: 'fold_stale_scenes', labelCode: 'h', kind: 'toggle' },
  { key: 'fold_stale_knowledge', labelCode: 'i', kind: 'toggle' },
  { key: 'fold_stale_skills', labelCode: 'j', kind: 'toggle' },
  { key: 'fold_stale_macro_results', labelCode: 'k', kind: 'toggle' },
  { key: 'fold_threshold_chars', labelCode: 'l', kind: 'number', min: 0, max: 10_000_000 },
  { key: 'compaction', labelCode: 'm', kind: 'toggle' },
]

export const EMPTY_ARCH_SELECTION: QaArchSelection = {}

export function changedKnobCount(selection: QaArchSelection): number {
  return QA_ARCH_AXES.filter(({ key }) => selection[key] !== undefined).length
}

/**
 * 고급 설정 제목 옆의 "n개 변경". 엔진은 고급 설정 밖에서 고르므로 세지 않는다. `planner_executer` 면
 * 0 이다 — 남겨 둔 tool loop knob 은 그 run 에 쓰이지 않는다.
 */
export function changedSettingCount(selection: QaArchSelection): number {
  return archEngine(selection) === 'planner_executer' ? 0 : changedKnobCount(selection)
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
 * 각 항목은 축 코드와 36진수 값으로 구성한다. 13개 축을 모두 지정해도 서버 제한인 50자 이하다.
 */
export function toArchRequest(selection: QaArchSelection): QaArchRequest | null {
  if (archEngine(selection) === 'planner_executer') return { engine: 'planner_executer' }

  const overrides: Omit<QaArchSelection, 'engine'> = {}
  const labelParts: string[] = []
  for (const axis of QA_ARCH_AXES) {
    const value = selection[axis.key]
    if (value === undefined) continue
    Object.assign(overrides, { [axis.key]: value })

    const encodedValue = typeof value === 'string' && axis.kind === 'choice'
      ? axis.values.indexOf(value)
      : Number(value)
    labelParts.push(axis.labelCode + encodedValue.toString(36))
  }

  if (labelParts.length === 0) return null
  return { label: 'web-v1-' + labelParts.sort().join('-'), ...overrides }
}

/** 이미지를 읽지 않는 모델용: visionOnlyValues 에 해당하는 선택을 undefined 로 되돌린다. 바뀐 게 없으면 같은 object 를 돌려준다. */
export function withoutVisionKnobs(selection: QaArchSelection): QaArchSelection {
  let result = selection
  for (const axis of QA_ARCH_AXES) {
    if (axis.kind !== 'choice' || axis.visionOnlyValues === undefined) continue
    const value = result[axis.key]
    if (typeof value === 'string' && axis.visionOnlyValues.includes(value)) {
      result = withKnob(result, axis.key, undefined)
    }
  }
  return result
}

/** 한 knob 을 바꾼 새 selection. value 가 undefined 면 키를 지운다. */
export function withKnob(
  selection: QaArchSelection,
  key: QaArchKnobKey,
  value: QaArchSelection[QaArchKnobKey],
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
export function parseArchSelection(raw: unknown): QaArchSelection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const fields = new Map(Object.entries(raw))
  let result: QaArchSelection = {}
  if (fields.get('engine') === 'planner_executer') result = { ...result, engine: 'planner_executer' }
  for (const axis of QA_ARCH_AXES) {
    const value = fields.get(axis.key)
    if (value !== undefined && axisAccepts(axis, value)) {
      result = { ...result, [axis.key]: value }
    }
  }
  return result
}
