import { asRecord } from '../projects/projectApi'
import type { QaLog } from './qaTypes'

/**
 * timeline 에서 cheat 와 behavior 를 읽어 내는 순수 규칙들(ARTEL-1051 계약 3·4·5절).
 *
 * `invoke_cheat` · `start_behavior` 는 별도 log 종류가 없고 기존 `ACTION` 행으로 남는다. 그 payload 는
 * `{ actions: [{ id, jsonrpc, method, params: [{...}] }] }` 이고, 결과는 `ACTION_RESULT` 의
 * `{ requestId, results: [{ id, success, returnValue, error }] }` 이다. behavior 가 끝나는 것만
 * `BEHAVIOR_ENDED` 라는 자기 행 종류를 갖는다.
 */

export const INVOKE_CHEAT_METHOD = 'invoke_cheat'
export const START_BEHAVIOR_METHOD = 'start_behavior'

/** 계약 3절·4절이 정한 `BEHAVIOR_ENDED.reason` 아홉 값. */
export const BEHAVIOR_END_REASONS = [
  'stopped',
  'not_allowed',
  'completed',
  'failed',
  'timeout',
  'replaced',
  'target_gone',
  'unavailable',
  'run_ended',
] as const

export type BehaviorEndReason = (typeof BEHAVIOR_END_REASONS)[number]

/** 막대 색을 고르는 분류. 색만으로 말하지 않도록 화면은 reason 문구를 함께 단다. */
export type BehaviorBarTone = 'success' | 'neutral' | 'warning' | 'critical' | 'running'

const REASON_TONES: Record<BehaviorEndReason, Exclude<BehaviorBarTone, 'running'>> = {
  completed: 'success',
  stopped: 'neutral',
  replaced: 'neutral',
  run_ended: 'neutral',
  target_gone: 'warning',
  unavailable: 'warning',
  not_allowed: 'warning',
  timeout: 'warning',
  failed: 'critical',
}

function isEndReason(value: unknown): value is BehaviorEndReason {
  return typeof value === 'string' && (BEHAVIOR_END_REASONS as readonly string[]).includes(value)
}

type ActionItem = {
  id: number | null
  method: string
  params: Record<string, unknown>
}

function actionItemsOf(payload: unknown): ActionItem[] {
  const actions = asRecord(payload)?.actions
  if (!Array.isArray(actions)) return []

  return actions.flatMap((entry) => {
    const record = asRecord(entry)
    if (record === null || typeof record.method !== 'string') return []
    const params = Array.isArray(record.params) ? asRecord(record.params[0]) : null
    return [{
      id: typeof record.id === 'number' ? record.id : null,
      method: record.method,
      params: params ?? {},
    }]
  })
}

/** `ACTION` 행 하나가 부르는 cheat 이름들. cheat 호출이 없는 행은 빈 목록이다. */
export function cheatNamesOf(log: QaLog): string[] {
  if (log.type !== 'ACTION') return []
  return actionItemsOf(log.payload).flatMap((item) => {
    if (item.method !== INVOKE_CHEAT_METHOD) return []
    return [typeof item.params.name === 'string' ? item.params.name : '']
  })
}

/** step 의 `STATUS` 가 싣는 `used_cheats` 항목. */
export type UsedCheat = {
  name: string
  success: boolean
  target: string | null
}

/**
 * `STATUS` payload 의 `used_cheats`. 필드가 없거나 비어 있으면 빈 목록이다 — 이 기능 이전의 run 과
 * cheat 를 안 쓴 step 이 같은 모양으로 읽힌다.
 */
export function usedCheatsOf(payload: unknown): UsedCheat[] {
  const used = asRecord(payload)?.used_cheats
  if (!Array.isArray(used)) return []

  return used.flatMap((entry) => {
    const record = asRecord(entry)
    if (record === null || typeof record.name !== 'string' || record.name.length === 0) return []
    return [{
      name: record.name,
      success: record.success !== false,
      target: typeof record.target === 'string' ? record.target : null,
    }]
  })
}

export type BehaviorBar = {
  /** 시작 결과나 종료 행에서 얻는다. 시작 행만 있고 결과를 아직 못 받았으면 null. */
  behaviorId: number | null
  name: string
  target: string | null
  startMs: number
  /** 아직 안 끝났으면 null. */
  endMs: number | null
  reason: BehaviorEndReason | null
  tone: BehaviorBarTone
  /** 종료 행의 `detail`. 없으면 null. */
  detail: string | null
  /** 마지막으로 읽힌 report 한 줄. 없으면 null. */
  report: string | null
  /** SDK 가 센 실행 시간(초). 종료 행에 있을 때만. */
  seconds: number | null
  /** 시작 `ACTION` 행. 이 막대에서 타임라인으로 이동할 때 쓴다. */
  startLogId: string | null
}

export type BehaviorLane = {
  /** `name` 또는 `name @ target`. 같은 behavior 를 서로 다른 대상에 돌리면 줄이 갈린다. */
  key: string
  name: string
  target: string | null
  bars: BehaviorBar[]
}

export type BehaviorLanes = {
  lanes: BehaviorLane[]
  /** 모든 막대를 담는 구간. 막대가 없으면 둘 다 0. */
  startMs: number
  endMs: number
}

function timeOf(log: QaLog): number {
  const time = new Date(log.createdAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

function asBehaviorId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function lastLine(text: string): string | null {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  return lines.length === 0 ? null : lines[lines.length - 1]
}

type PendingStart = {
  log: QaLog
  actionId: number | null
  name: string
  target: string | null
  startMs: number
  behaviorId: number | null
  report: string | null
  failed: boolean
}

function laneKeyOf(name: string, target: string | null): string {
  return target === null ? name : `${name} @ ${target}`
}

/**
 * 로그에서 behavior 막대를 만든다.
 *
 * 시작은 `ORCHE_TO_SDK` 방향의 `start_behavior` 행이다. 에이전트 쪽 사본(`AGENT_TO_ORCHE`)까지 세면 한 번의
 * 시작이 두 번으로 읽힌다. 시작과 `behaviorId` 는 같은 `requestId`(이 행의 id) 와 액션 `id` 로 `ACTION_RESULT`
 * 에서 이어진다. 끝은 `BEHAVIOR_ENDED` 의 `behaviorId` 로 찾는다.
 *
 * 세 가지 어긋남을 버리지 않고 그린다.
 * - 종료 행만 있는 behavior(시작 행이 불러오지 않은 앞 페이지에 있음)는 종료 시각에서 `seconds` 만큼 앞을 시작으로 둔다.
 * - 시작은 있고 종료가 없으면 돌고 있는 것이다. 막대는 `endMs` 가 null 이고 화면이 마지막 로그 시각까지 그린다.
 * - 시작에 실패한 호출(`success: false`)은 막대가 아니다. 돈 적이 없다.
 *
 * @param logs id 오름차순으로 온 로그(화면이 들고 있는 순서).
 */
export function buildBehaviorLanes(logs: readonly QaLog[]): BehaviorLanes {
  const starts: PendingStart[] = []
  const endedById = new Map<number, QaLog>()

  for (const log of logs) {
    if (log.type === 'ACTION' && log.direction === 'ORCHE_TO_SDK') {
      for (const item of actionItemsOf(log.payload)) {
        if (item.method !== START_BEHAVIOR_METHOD) continue
        starts.push({
          log,
          actionId: item.id,
          name: typeof item.params.name === 'string' ? item.params.name : '',
          target: typeof item.params.target === 'string' ? item.params.target : null,
          startMs: timeOf(log),
          behaviorId: null,
          report: null,
          failed: false,
        })
      }
    } else if (log.type === 'BEHAVIOR_ENDED') {
      const behaviorId = asBehaviorId(asRecord(log.payload)?.behaviorId)
      if (behaviorId !== null) endedById.set(behaviorId, log)
    }
  }

  // 결과 연결. 같은 결과가 hop 마다 두 줄 남지만 먼저 읽힌 것만 쓴다.
  const startsByRequest = new Map<string, PendingStart[]>()
  for (const start of starts) {
    const bucket = startsByRequest.get(start.log.id) ?? []
    bucket.push(start)
    startsByRequest.set(start.log.id, bucket)
  }
  const resolved = new Set<PendingStart>()
  for (const log of logs) {
    if (log.type !== 'ACTION_RESULT') continue
    const payload = asRecord(log.payload)
    const requestId = payload?.requestId
    const results = payload?.results
    if (requestId === undefined || !Array.isArray(results)) continue
    for (const start of startsByRequest.get(String(requestId)) ?? []) {
      if (resolved.has(start)) continue
      const result = results
        .map(asRecord)
        .find((entry) => entry !== null && entry.id === start.actionId)
      if (result === undefined || result === null) continue
      resolved.add(start)
      if (result.success === false) {
        start.failed = true
        continue
      }
      const value = asRecord(result.returnValue)
      start.behaviorId = asBehaviorId(value?.behaviorId)
      start.report = typeof value?.report === 'string' ? lastLine(value.report) : null
    }
  }

  const bars: BehaviorBar[] = []
  const startedIds = new Set<number>()

  for (const start of starts) {
    if (start.failed) continue
    if (start.behaviorId !== null) startedIds.add(start.behaviorId)
    const ended = start.behaviorId === null ? undefined : endedById.get(start.behaviorId)
    bars.push(barOf(start.name, start.target, start.startMs, start.behaviorId, start.report, ended, start.log.id))
  }

  // 종료 행만 남은 behavior.
  for (const [behaviorId, ended] of endedById) {
    if (startedIds.has(behaviorId)) continue
    const payload = asRecord(ended.payload)
    const seconds = typeof payload?.seconds === 'number' ? payload.seconds : 0
    const name = typeof payload?.name === 'string' ? payload.name : ''
    const target = typeof payload?.target === 'string' ? payload.target : null
    bars.push(barOf(name, target, timeOf(ended) - seconds * 1000, behaviorId, null, ended, null))
  }

  const lanes = new Map<string, BehaviorLane>()
  for (const bar of bars) {
    const key = laneKeyOf(bar.name, bar.target)
    const lane = lanes.get(key) ?? { key, name: bar.name, target: bar.target, bars: [] }
    lane.bars.push(bar)
    lanes.set(key, lane)
  }

  const ordered = [...lanes.values()]
    .map((lane) => ({ ...lane, bars: [...lane.bars].sort((a, b) => a.startMs - b.startMs) }))
    .sort((a, b) => a.bars[0].startMs - b.bars[0].startMs)

  if (bars.length === 0) return { lanes: [], startMs: 0, endMs: 0 }

  const lastLogMs = logs.reduce((latest, log) => Math.max(latest, timeOf(log)), 0)
  const startMs = Math.min(...bars.map((bar) => bar.startMs))
  const endMs = Math.max(lastLogMs, ...bars.map((bar) => bar.endMs ?? bar.startMs))
  return { lanes: ordered, startMs, endMs }
}

function barOf(
  name: string,
  target: string | null,
  startMs: number,
  behaviorId: number | null,
  startReport: string | null,
  ended: QaLog | undefined,
  startLogId: string | null,
): BehaviorBar {
  if (ended === undefined) {
    return {
      behaviorId,
      name,
      target,
      startMs,
      endMs: null,
      reason: null,
      tone: 'running',
      detail: null,
      report: startReport,
      seconds: null,
      startLogId,
    }
  }

  const payload = asRecord(ended.payload)
  const reason = isEndReason(payload?.reason) ? payload.reason : null
  const detail = typeof payload?.detail === 'string' && payload.detail.length > 0 ? payload.detail : null
  const report = typeof payload?.report === 'string' ? lastLine(payload.report) : startReport
  return {
    behaviorId,
    name,
    target,
    startMs,
    // 종료 행이 시작보다 앞서 보이는 시계 어긋남이 막대를 거꾸로 세우지 않게 한다.
    endMs: Math.max(startMs, timeOf(ended)),
    reason,
    tone: reason === null ? 'neutral' : REASON_TONES[reason],
    detail,
    report,
    seconds: typeof payload?.seconds === 'number' ? payload.seconds : null,
    startLogId,
  }
}

/** 막대 위치. 전체 구간 대비 퍼센트이고, 구간이 0이면 막대는 전체 폭을 쓴다. */
export function barPlacement(
  bar: BehaviorBar,
  startMs: number,
  endMs: number,
): { left: number; width: number } {
  const span = endMs - startMs
  if (span <= 0) return { left: 0, width: 100 }
  const left = ((bar.startMs - startMs) / span) * 100
  const right = (((bar.endMs ?? endMs) - startMs) / span) * 100
  return { left, width: Math.max(right - left, 0.8) }
}

export type BehaviorEnded = {
  name: string
  reason: BehaviorEndReason | null
  detail: string | null
}

/** `BEHAVIOR_ENDED` 행 하나가 말하는 것. 행 본문이 비어 있을 때 한 줄을 지어내는 데 쓴다. */
export function behaviorEndedOf(payload: unknown): BehaviorEnded | null {
  const record = asRecord(payload)
  if (record === null) return null
  return {
    name: typeof record.name === 'string' ? record.name : '',
    reason: isEndReason(record.reason) ? record.reason : null,
    detail: typeof record.detail === 'string' && record.detail.length > 0 ? record.detail : null,
  }
}
