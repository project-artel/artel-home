import { asRecord } from '../projects/projectApi'
import type { ScenarioStep } from '../testScenarios/scenarioTypes'
import type { ExecutionMode } from '../testScenarios/scenarioTypes'
import { toolCallOf, type ToolCall } from './qaLogGrouping'
import { stepOf } from './qaProgress'
import type { QaLog } from './qaTypes'

/**
 * `흐름` 탭이 읽는 모양으로 로그를 추린다.
 *
 * 화면이 묻는 것은 둘뿐이다 — **Agent 가 무엇을 생각했고 무엇을 했는가.** 그래서 여기서
 * 나가는 것도 그 둘이고, 도구 이름도 판정 문구도 나가지 않는다. 글말은 i18n 이 쥔다:
 * 이 파일은 "무슨 도구를 무엇에 썼나" 까지만 내고 문장은 안 만든다.
 */

/** 조작 대상을 이름으로 바꾸는 사전. `PULSE` 가 싣는 `id` → `path` 다. */
export type ObjectNames = ReadonlyMap<number, string>

/**
 * `PULSE` 들에서 `id → path` 사전을 모은다.
 *
 * `click` 과 `drag` 는 인자에 `target: "#40606"` 처럼 숫자만 싣는다. 그 숫자는 사람이 못
 * 읽고 `TOOL_RESULT` 본문에도 이름이 없다 — try 46 에서 확인했다. 이름이 있는 곳은
 * `PULSE` 뿐이고, 거기서는 같은 런의 조작 대상 9개가 9개 다 풀렸다.
 *
 * 아직 안 받은 `PULSE` 의 id 는 못 찾는다. 그때는 이름 없이 적는다 — 숫자를 보이지 않는다.
 */
export function objectNamesOf(logs: readonly QaLog[]): ObjectNames {
  const names = new Map<number, string>()
  for (const log of logs) {
    if (log.type !== 'PULSE') continue
    const payload = log.payload as Record<string, unknown> | null | undefined
    if (payload === null || typeof payload !== 'object') continue
    for (const key of ['whole', 'active', 'deactive'] as const) {
      const group = (payload as Record<string, unknown>)[key]
      if (!Array.isArray(group)) continue
      for (const entry of group) {
        if (entry === null || typeof entry !== 'object') continue
        const object = entry as Record<string, unknown>
        const id = object.id
        const path = object.path
        if (typeof id === 'number' && typeof path === 'string' && path.length > 0) {
          names.set(id, path)
        }
      }
    }
  }
  return names
}

/** `"#40606"` 도 `-38980` 도 같은 id 다. 읽히지 않으면 null. */
function idOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const parsed = Number(value.startsWith('#') ? value.slice(1) : value)
  return Number.isFinite(parsed) ? parsed : null
}

function nameOf(value: unknown, names: ObjectNames): string | null {
  const id = idOf(value)
  if (id === null) return null
  return names.get(id) ?? null
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** 한 번의 조작. 문장은 i18n 이 만들고, 여기서는 그 재료만 낸다. */
export type FlowAction = {
  tool: string
  /** 무엇에 했나. 못 읽으면 null 이고, 화면은 대상 없이 적는다. */
  subject: string | null
  /**
   * 우리 도구가 막아 아무것도 안 돈 호출인가.
   *
   * 게임의 잘못이 아니라 우리 쪽 잘못이므로 같은 색으로 두면 읽는 사람이 오해한다.
   * 판별은 그 호출의 답이 `Not now —` 로 시작하는지다. 우리가 쓴 문구이고 게임과 무관하다.
   */
  blocked: boolean
}

export function actionOf(call: ToolCall, names: ObjectNames, output: string | null): FlowAction {
  const { tool, args } = call
  const blocked = output !== null && output.trimStart().startsWith('Not now —')
  const subject = ((): string | null => {
    switch (tool) {
      case 'press_key':
      case 'hold_key':
      case 'release_key':
        return textOf(args.key_code)
      case 'click':
      case 'double_click':
        return nameOf(args.target, names)
      case 'click_button':
      case 'capture_screen':
        return nameOf(args.target_id, names)
      case 'drag': {
        const from = nameOf(args.from_target, names)
        const to = nameOf(args.to_target, names)
        return from === null || to === null ? (from ?? to) : `${from} → ${to}`
      }
      case 'inspect_object':
        return textOf(args.selector)
      case 'observe_scene': {
        const seconds = args.wait_seconds
        return typeof seconds === 'number' && seconds > 0 ? String(seconds) : null
      }
      case 'run_macro':
      case 'read_macro':
      case 'register_macro':
      case 'write_macro':
      case 'edit_macro':
        return textOf(args.name)
      case 'search_macros':
      case 'search_knowledge':
        return textOf(args.query)
      case 'record_knowledge':
      case 'update_knowledge':
        return textOf(args.summary)
      case 'finish_run':
        return textOf(args.summary)
      default:
        return null
    }
  })()
  return { tool, subject, blocked }
}

/**
 * 덩어리 안의 한 줄. 생각이거나 행동이다.
 *
 * `id` 는 그 줄이 나온 로그이고 스크롤 앵커가 쓴다. `key` 는 **줄마다 다르다** — 한 `TOOL`
 * 로그가 생각 줄과 행동 줄 둘을 만들므로 `id` 를 React key 로 쓰면 형제 둘이 같은 key 를
 * 갖고, 그러면 지운 줄의 DOM 이 남는다(접은 생각이 화면에 그대로 보였다).
 */
export type FlowLine =
  | { kind: 'thought'; id: string; key: string; text: string }
  | { kind: 'action'; id: string; key: string; action: FlowAction }

/**
 * 스텝 하나. `흐름` 한 덩어리다.
 *
 * 라벨은 [caseIdsByStep] 이 따로 낸다 — `case_id` 는 `report_step` 의 인자가 아니라
 * Agent 가 따로 보내는 STATUS 프레임에 있다.
 */
export type FlowStep = {
  step: number
  lines: FlowLine[]
  /** `report_step` 이 낸 판정. 아직 안 냈으면 null. */
  passed: boolean | null
  /**
   * 왜 그렇게 판정했는지. `report_step` 이 실은 `thought` 다.
   *
   * 덩어리의 마지막 줄로 따로 세운다 — 중간에 한 생각들과 같은 자리에 두면 "무엇을 하려
   * 했나" 와 "왜 그렇게 끝났나" 가 섞여, 읽는 사람이 가장 먼저 찾는 것이 묻힌다.
   */
  reason: string | null
  /** 판정 말고 실제로 부른 횟수. 0 이면 아무것도 안 해 보고 판정한 것이다. */
  attempts: number
}

/** `흐름` 에서 빼는 도구. 적을 것이 없다는 것을 적는 기록용 호출이다. */
const HIDDEN = new Set(['skip_memory_update'])

/**
 * 로그를 스텝 덩어리로 묶는다.
 *
 * `report_step` 은 그 스텝을 닫는다 — 생각은 한 줄로 남고, 통과 여부는 덩어리의 것이 된다.
 * 판정 문구(`message`)는 싣지 않는다. 화면이 묻는 것이 아니다.
 */
export function buildFlowSteps(logs: readonly QaLog[], names: ObjectNames): FlowStep[] {
  const steps: FlowStep[] = []
  const byStep = new Map<number, FlowStep>()
  /** 덩어리마다 이미 적은 생각. 같은 문장을 두 번 적지 않는다. */
  const saidByStep = new Map<number, Set<string>>()
  const outputs = new Map<string, string>()

  for (const log of logs) {
    if (log.type !== 'TOOL_RESULT') continue
    const payload = log.payload as Record<string, unknown> | null | undefined
    if (payload === null || typeof payload !== 'object') continue
    const id = (payload as Record<string, unknown>).tool_call_id
    const content = (payload as Record<string, unknown>).content
    if (typeof id === 'string' && typeof content === 'string') outputs.set(id, content)
  }

  for (const log of logs) {
    if (log.type !== 'TOOL') continue
    const call = toolCallOf(log)
    if (call === null || HIDDEN.has(call.tool)) continue
    const step = stepOf(log)
    if (step === null) continue

    let block = byStep.get(step)
    if (block === undefined) {
      block = { step, lines: [], passed: null, reason: null, attempts: 0 }
      byStep.set(step, block)
      saidByStep.set(step, new Set())
      steps.push(block)
    }
    const said = saidByStep.get(step) ?? new Set<string>()

    // 한 덩어리 안에서 같은 문장은 한 번만 적는다. 되풀이해 시도한 호출은 `thought` 를
    // 글자 그대로 다시 싣는다 — try 46 의 TC 20 에서 한 문장이 세 번 나왔다. 사이에 조작이
    // 끼므로 바로 앞만 봐서는 못 걸러낸다. 몇 번 시도했는지는 조작 줄이 이미 말한다.
    if (call.tool === 'report_step') {
      const passed = call.args.passed
      if (typeof passed === 'boolean') block.passed = passed
      if (call.thought !== null) block.reason = call.thought
      continue
    }

    if (call.thought !== null && !said.has(call.thought)) {
      said.add(call.thought)
      block.lines.push({ kind: 'thought', id: log.id, key: `${log.id}#t`, text: call.thought })
    }

    const payload = log.payload as Record<string, unknown> | null | undefined
    const callId =
      payload !== null && typeof payload === 'object'
        ? (payload as Record<string, unknown>).tool_call_id
        : null
    const output = typeof callId === 'string' ? (outputs.get(callId) ?? null) : null
    block.lines.push({ kind: 'action', id: log.id, key: `${log.id}#a`, action: actionOf(call, names, output) })
    block.attempts += 1
  }

  return steps
}

/** PULSE는 조작 대상 이름 조회에 사용하고 행으로 표시하지 않는다. */
export function filterFlowLogs(logs: readonly QaLog[], executionMode: ExecutionMode): QaLog[] {
  const types = executionMode === 'FREE'
    ? new Set<QaLog['type']>(['TOOL', 'TOOL_RESULT', 'STATUS', 'CASE_VERDICT', 'PULSE'])
    : new Set<QaLog['type']>(['TOOL', 'TOOL_RESULT', 'STATUS', 'PULSE'])
  return logs.filter((log) => types.has(log.type))
}

/** FREE는 TC별로 다시 모으지 않고 행동과 판정을 도착 순서대로 표시한다. */
export function buildFreeFlow(logs: readonly QaLog[], names: ObjectNames, scenarioSteps: ScenarioStep[]): (FlowStep & { id: string; caseId: string | null })[] {
  const outputs = new Map<string, string>()
  for (const log of logs) {
    const payload = asRecord(log.payload)
    if (log.type === 'TOOL_RESULT' && typeof payload?.tool_call_id === 'string' && typeof payload.content === 'string') outputs.set(payload.tool_call_id, payload.content)
  }
  return logs.flatMap((log) => {
    const payload = asRecord(log.payload)
    const step = stepOf(log)
    const block: FlowStep & { id: string; caseId: string | null } = {
      id: log.id, step: step ?? 0, lines: [], passed: null, reason: null, attempts: 0, caseId: null,
    }
    if (log.type === 'STATUS' && step !== null && (payload?.status === 'COMPLETED' || payload?.status === 'FAILED')) {
      block.passed = payload.status === 'COMPLETED'
      block.reason = log.message
      const caseId = scenarioSteps[step - 1]?.case_id
      block.caseId = caseId == null ? null : String(caseId)
      return [block]
    }
    if (log.type === 'CASE_VERDICT') {
      const status = payload?.verification_status
      const caseId = payload?.case_id
      if ((typeof caseId !== 'string' && typeof caseId !== 'number') ||
          (status !== 'VERIFIED' && status !== 'FAILED' && status !== 'REGRESSION')) return []
      block.caseId = String(caseId)
      block.passed = status === 'VERIFIED'
      block.reason = log.message
      return [block]
    }
    if (log.type !== 'TOOL') return []
    const call = toolCallOf(log)
    // 판정은 STATUS로 표시하므로 보고용 호출을 조작으로 중복 표시하지 않는다.
    if (call === null || HIDDEN.has(call.tool) || call.tool === 'report_case' || call.tool === 'report_step') return []
    if (call.thought !== null) block.lines.push({ kind: 'thought', id: log.id, key: `${log.id}#t`, text: call.thought })
    const output = typeof payload?.tool_call_id === 'string' ? outputs.get(payload.tool_call_id) ?? null : null
    block.lines.push({ kind: 'action', id: log.id, key: `${log.id}#a`, action: actionOf(call, names, output) })
    block.attempts = 1
    return [block]
  })
}
