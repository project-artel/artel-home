import type { LastScan } from '../../contentMap/contentMapTypes'
import type { QaRun } from '../../qa/qaTypes'
import type { JobState, ToolContext } from '../chat/toolTypes'
import type { TasksCopy } from '../tasksCopy'
import { jobHref, qaPollDelay, translateQaRun, translateScan, type JobTranslation } from './jobTranslation'
import {
  removeWatchRecord,
  saveWatchRecord,
  watchKey,
  type WatchKind,
  type WatchRecord,
} from './watchRecords'

/*
 * `watch_job` 의 본체. 서버를 읽는 방법(`JobObserver`)과 시간(`Clock`)을 주입받으므로 timer 없이
 * 테스트한다. 브라우저에 붙이는 쪽은 `watchJob.ts` 에 있다.
 */

export type WatchContext = Pick<ToolContext, 'projectId' | 'conversationId' | 'upsertJob' | 'postEvent' | 'signal'>

export type Clock = {
  now: () => number
  /** `signal` 이 abort 되면 기다림을 멈추고 false 를 돌려준다. */
  sleep: (milliseconds: number, signal: AbortSignal) => Promise<boolean>
}

/** 상태가 바뀔 때마다 `report` 를 부르고, job 이 끝났거나 `signal` 이 abort 되면 돌아온다. */
export type JobObserver = (
  record: WatchRecord,
  report: (translation: JobTranslation) => void,
  signal: AbortSignal,
) => Promise<void>

/** 이 시간이 지나도 끝나지 않는 job 은 지켜보기를 그만둔다. */
export const WATCH_DEADLINE_MS: Record<WatchKind, number> = {
  qa_run: 4 * 60 * 60 * 1000,
  content_map_scan: 45 * 60 * 1000,
}

export type WatchStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type WatchDependencies = {
  clock: Clock
  storage: WatchStorageLike
  copy: () => TasksCopy
  observers: Record<WatchKind, JobObserver>
}

/** 지금 이 탭에서 지켜보는 job. 같은 job 을 두 번 지켜보지 않게 한다. */
const activeWatches = new Set<string>()

function activeKey(conversationId: number, kind: WatchKind, id: string): string {
  return `${conversationId}:${watchKey(kind, id)}`
}

export function isWatching(conversationId: number, kind: WatchKind, id: string): boolean {
  return activeWatches.has(activeKey(conversationId, kind, id))
}

function cardOf(record: WatchRecord, translation: JobTranslation): JobState {
  return {
    key: watchKey(record.kind, record.id),
    kind: record.kind,
    id: record.id,
    label: record.label,
    state: translation.state,
    ...(translation.progress === undefined ? {} : { progress: translation.progress }),
    ...(translation.detail === undefined ? {} : { detail: translation.detail }),
    href: jobHref(record.kind, record.id),
  }
}

export function defaultLabel(kind: WatchKind, id: string, copy: TasksCopy): string {
  return kind === 'qa_run' ? copy.jobs.qaRunLabel(id) : copy.jobs.scanLabel(id)
}

/**
 * job 하나를 끝까지 지켜본다. 기다리지 않고 돌아오는 쪽은 `startWatch` 다.
 * 끝나면 기록을 지우고 event 를 한 번만 보낸다. abort 로 멈춘 경우에는 기록을 남겨 새로 고친 뒤 이어간다.
 */
export async function runWatch(record: WatchRecord, context: WatchContext, dependencies: WatchDependencies): Promise<void> {
  const copy = dependencies.copy()
  let settled = false

  const report = (translation: JobTranslation) => {
    if (settled) return
    context.upsertJob(cardOf(record, translation))
    if (translation.state === 'running') return
    settled = true
    removeWatchRecord(dependencies.storage, context.projectId, context.conversationId, record.kind, record.id, dependencies.clock.now())
    context.postEvent(
      translation.state === 'finished' ? 'job_finished' : 'job_failed',
      translation.detail ?? '',
      { kind: record.kind, id: record.id, ...translation.data },
    )
  }

  context.upsertJob(cardOf(record, { state: 'running' }))

  // 기한이 되면 observer 를 abort 시켜 멈춘다. 기한 abort 와 대화가 멈춘 abort 는 따로 구별한다.
  const deadline = new AbortController()
  const finished = new AbortController()
  const stop = AbortSignal.any([context.signal, deadline.signal])
  const remaining = WATCH_DEADLINE_MS[record.kind] - (dependencies.clock.now() - record.startedAtMs)
  void dependencies.clock
    .sleep(Math.max(remaining, 0), AbortSignal.any([context.signal, finished.signal]))
    .then((elapsed) => {
      if (elapsed) deadline.abort()
    })

  try {
    await dependencies.observers[record.kind](record, report, stop)
  } catch {
    report({ state: 'failed', detail: copy.jobs.observeFailed(record.label), data: { kind: record.kind, id: record.id } })
  } finally {
    finished.abort()
  }
  if (!settled && deadline.signal.aborted && !context.signal.aborted) {
    report({ state: 'failed', detail: copy.jobs.timedOut(record.label), data: { kind: record.kind, id: record.id, timedOut: 1 } })
  }
}

/** 기록을 남기고 지켜보기를 백그라운드로 시작한다. 이미 지켜보는 job 이면 아무것도 하지 않는다. */
export function startWatch(record: WatchRecord, context: WatchContext, dependencies: WatchDependencies): boolean {
  const key = activeKey(context.conversationId, record.kind, record.id)
  if (activeWatches.has(key)) return false
  activeWatches.add(key)
  saveWatchRecord(dependencies.storage, context.projectId, context.conversationId, record, dependencies.clock.now())
  void runWatch(record, context, dependencies).finally(() => activeWatches.delete(key))
  return true
}

/**
 * QA 실행을 `getRun` 으로 다시 읽는다. 읽기가 실패해도 포기하지 않고 간격을 늘려 계속한다(QaRunPage 와
 * 같다). 서버가 잠시 내려간 사이에 끝난 실행을 놓치지 않기 위해서다.
 */
export function createQaRunObserver(
  getRun: (qaRunId: string, signal: AbortSignal) => Promise<QaRun>,
  clock: Clock,
  copy: () => TasksCopy,
): JobObserver {
  return async (record, report, signal) => {
    let failures = 0
    while (!signal.aborted) {
      try {
        const translation = translateQaRun(await getRun(record.id, signal), copy().jobs)
        failures = 0
        report(translation)
        if (translation.state !== 'running') return
      } catch {
        if (signal.aborted) return
        failures += 1
      }
      if (!(await clock.sleep(qaPollDelay(failures), signal))) return
    }
  }
}

/** 화면 지도 스캔을 events stream 으로 따라간다. `subscribe` 는 구독을 끊는 함수를 돌려준다. */
export function createScanObserver(
  subscribe: (projectId: string, buildId: string, onScan: (scan: LastScan | null) => void) => () => void,
  projectId: string,
  copy: () => TasksCopy,
): JobObserver {
  return (record, report, signal) =>
    new Promise<void>((resolve) => {
      let unsubscribe: () => void = () => {}
      const finish = () => {
        unsubscribe()
        signal.removeEventListener('abort', finish)
        resolve()
      }
      if (signal.aborted) {
        resolve()
        return
      }
      signal.addEventListener('abort', finish)
      unsubscribe = subscribe(projectId, record.id, (scan) => {
        const translation = translateScan(scan, record.id, record.startedAtMs, copy().jobs)
        report(translation)
        if (translation.state !== 'running') finish()
      })
    })
}
