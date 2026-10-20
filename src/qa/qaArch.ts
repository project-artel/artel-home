/*
 * QA run 을 시작할 때 고르는 agent 구조(arch)와, 서버로 보내는 body 로의 변환.
 *
 * 기본값은 값을 보내지 않는 것(키 생략)으로 나타낸다. 폼이 서버 기본값 숫자를 따로 들고 있으면
 * 서버가 기본값을 바꾸는 순간 낡은 사본이 된다. 사용자가 바꾼 knob 만 보내면 나머지는 항상 서버의
 * 현재 기본값이다.
 *
 * knob 을 하나라도 바꿨다면 label 도 반드시 있어야 한다. `/api/qa-stats` 는 run 을 `agent_arch`
 * label 로 묶는데, 구조를 바꾸고도 기본 label 로 남기면 기본 구조의 통계가 오염된다(agent-server
 * `app/agents/qa/arch.py` 의 v4 주석, artel-cli 의 `qa matrix --arch` 도 같은 이유로 label 을
 * 요구한다).
 *
 * 필드 이름과 값은 agent-server 의 `QaArchSpec` 과 같다. 여기에 없는 knob 은 폼이 다루지 않는
 * 것이다.
 *
 * `engine`(ARTEL-1119)은 위 knob 들과 축이 다르다. 13개 knob 은 모두 `agent` 엔진(tool loop)의
 * 것이고, `planner_executer` 는 그중 아무것도 읽지 않는다. 그래서 `QA_ARCH_AXES` 에 넣지 않고 따로
 * 둔다 — 넣으면 바꾼 knob 수와 label 요구에 엔진이 섞인다.
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
  label: string
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
export type QaArchRequest = Omit<QaArchSelection, 'engine'> | { engine: 'planner_executer' }
export type QaArchKnobKey = Exclude<keyof QaArchSelection, 'label' | 'engine'>

export type QaArchAxis =
  | { key: QaArchKnobKey; kind: 'choice'; values: readonly string[]; visionOnlyValues?: readonly string[] }
  | { key: QaArchKnobKey; kind: 'toggle' }
  | { key: QaArchKnobKey; kind: 'number'; min: number; max: number }

/** 폼이 보여 주는 축. 순서가 화면 순서다. */
export const QA_ARCH_AXES: readonly QaArchAxis[] = [
  { key: 'phase_cycle', kind: 'choice', values: ['off', 'in_verdict', 'lite', 'full'] },
  { key: 'skills', kind: 'choice', values: ['off', 'on_demand'] },
  { key: 'macros', kind: 'choice', values: ['off', 'on'] },
  {
    key: 'screen_capture',
    kind: 'choice',
    values: ['on_demand', 'every_call', 'by_role'],
    visionOnlyValues: ['every_call', 'by_role'],
  },
  { key: 'vision', kind: 'choice', values: ['auto', 'on', 'off'], visionOnlyValues: ['on'] },
  { key: 'pulse_relevance', kind: 'toggle' },
  { key: 'report_step_view', kind: 'toggle' },
  { key: 'fold_stale_scenes', kind: 'toggle' },
  { key: 'fold_stale_knowledge', kind: 'toggle' },
  { key: 'fold_stale_skills', kind: 'toggle' },
  { key: 'fold_stale_macro_results', kind: 'toggle' },
  { key: 'fold_threshold_chars', kind: 'number', min: 0, max: 10_000_000 },
  { key: 'compaction', kind: 'toggle' },
]

export const QA_ARCH_LABEL_MAX_LENGTH = 50
export const EMPTY_ARCH_SELECTION: QaArchSelection = { label: '' }

/** label 을 뺀, 값이 있는 knob 의 [key, value] 쌍. */
function changedKnobs(selection: QaArchSelection): [QaArchKnobKey, unknown][] {
  const changed: [QaArchKnobKey, unknown][] = []
  for (const axis of QA_ARCH_AXES) {
    const value = selection[axis.key]
    if (value !== undefined) changed.push([axis.key, value])
  }
  return changed
}

export function changedKnobCount(selection: QaArchSelection): number {
  return changedKnobs(selection).length
}

/**
 * 고급 설정 제목 옆의 "n개 변경". `planner_executer` 면 엔진 하나만 센다 — 남겨 둔 tool loop knob 은
 * 그 run 에 쓰이지 않으므로 바뀐 것으로 세지 않는다.
 */
export function changedSettingCount(selection: QaArchSelection): number {
  return archEngine(selection) === 'planner_executer' ? 1 : changedKnobCount(selection)
}

export function archEngine(selection: QaArchSelection): QaEngine {
  return selection.engine ?? 'agent'
}

/** 엔진을 바꾼 새 selection. knob 과 label 은 그대로 둔다 — `agent` 로 돌아오면 고른 값이 다시 산다. `agent` 면 키를 지운다. */
export function withEngine(selection: QaArchSelection, engine: QaEngine): QaArchSelection {
  const next: QaArchSelection = { ...selection, engine }
  if (engine === 'agent') delete next.engine
  return next
}

/** `agent` 엔진에서 바꾼 knob 이 하나라도 있는데 label 이 공백뿐이면 true. `planner_executer` 는 knob 을 보내지 않으므로 늘 false. */
export function archLabelMissing(selection: QaArchSelection): boolean {
  if (archEngine(selection) === 'planner_executer') return false
  return changedKnobCount(selection) > 0 && selection.label.trim() === ''
}

/**
 * `planner_executer` 면 `{ engine }` 만. `agent` 는 바꾼 knob 이 없으면 null, 있으면 label(trim) 과
 * 바꾼 knob 만 담은 object.
 */
export function toArchRequest(selection: QaArchSelection): QaArchRequest | null {
  if (archEngine(selection) === 'planner_executer') return { engine: 'planner_executer' }
  const changed = changedKnobs(selection)
  if (changed.length === 0) return null
  return { label: selection.label.trim(), ...Object.fromEntries(changed) }
}

/** `phase_cycle=off skills=on_demand` 꼴. 50자를 넘으면 자른다. placeholder 용. 바꾼 knob 이 없으면 ''. */
export function suggestArchLabel(selection: QaArchSelection): string {
  return changedKnobs(selection)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
    .slice(0, QA_ARCH_LABEL_MAX_LENGTH)
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
 * localStorage 등에서 읽은 unknown 을 selection 으로. 모르는 키, 축에 없는 값, 범위 밖 숫자는 버린다. object 가 아니면 null. label 이 string 이 아니면 ''.
 * `engine` 이 없거나 모르는 값이면 `agent` 다(키를 두지 않는다).
 */
export function parseArchSelection(raw: unknown): QaArchSelection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const fields = new Map(Object.entries(raw))
  const label = fields.get('label')
  let result: QaArchSelection = { label: typeof label === 'string' ? label : '' }
  if (fields.get('engine') === 'planner_executer') result = { ...result, engine: 'planner_executer' }
  for (const axis of QA_ARCH_AXES) {
    const value = fields.get(axis.key)
    if (value !== undefined && axisAccepts(axis, value)) {
      result = { ...result, [axis.key]: value }
    }
  }
  return result
}
