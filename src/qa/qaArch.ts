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
 */

export type QaPhaseCycle = 'off' | 'in_verdict' | 'lite' | 'full'
export type QaSkillsMode = 'off' | 'on_demand'
export type QaMacrosMode = 'off' | 'on'
export type QaScreenCapture = 'on_demand' | 'every_call' | 'by_role'
export type QaVisionMode = 'auto' | 'on' | 'off'

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
}

/** 서버로 보내는 body. label 과 바꾼 knob 만 있다. 모양은 QaArchSelection 과 같다. */
export type QaArchRequest = QaArchSelection
export type QaArchKnobKey = Exclude<keyof QaArchSelection, 'label'>

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

/** 바꾼 knob 이 하나라도 있는데 label 이 공백뿐이면 true. */
export function archLabelMissing(selection: QaArchSelection): boolean {
  return changedKnobCount(selection) > 0 && selection.label.trim() === ''
}

/** 바꾼 knob 이 없으면 null. 있으면 label(trim) 과 바꾼 knob 만 담은 object. */
export function toArchRequest(selection: QaArchSelection): QaArchRequest | null {
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

/** localStorage 등에서 읽은 unknown 을 selection 으로. 모르는 키, 축에 없는 값, 범위 밖 숫자는 버린다. object 가 아니면 null. label 이 string 이 아니면 ''. */
export function parseArchSelection(raw: unknown): QaArchSelection | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const fields = new Map(Object.entries(raw))
  const label = fields.get('label')
  let result: QaArchSelection = { label: typeof label === 'string' ? label : '' }
  for (const axis of QA_ARCH_AXES) {
    const value = fields.get(axis.key)
    if (value !== undefined && axisAccepts(axis, value)) {
      result = { ...result, [axis.key]: value }
    }
  }
  return result
}
