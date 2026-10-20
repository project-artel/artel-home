import assert from 'node:assert/strict'
import test from 'node:test'
import type { LastScan } from '../../contentMap/contentMapTypes'
import { messages } from '../../i18n/messages'
import type { QaRun } from '../../qa/qaTypes'
import type { JobState } from '../chat/toolTypes'
import { createFakeClock, flushMicrotasks } from './fakeClock'
import { loadWatchRecords, type WatchRecord } from './watchRecords'
import {
  WATCH_DEADLINE_MS,
  createQaRunObserver,
  createScanObserver,
  isWatching,
  startWatch,
  type WatchContext,
  type WatchDependencies,
} from './watchRunner'

const copy = () => messages.en.projectAgent.tasks

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

function run(status: QaRun['status'], completed: number, total: number): QaRun {
  return {
    id: '55',
    testRunId: '3',
    gameInstanceId: '1',
    status,
    startedAt: null,
    completedAt: null,
    tries: Array.from({ length: total }, (_, index) => ({
      id: String(index),
      testScenarioId: String(index),
      gameInstanceId: '1',
      agentSessionId: null,
      status: index < completed ? ('COMPLETED' as const) : ('RUNNING' as const),
      startedAt: null,
      completedAt: null,
      qaRunId: '55',
    })),
  }
}

function harness(conversationId: number) {
  const clock = createFakeClock()
  const storage = memoryStorage()
  const jobs: JobState[] = []
  const events: { kind: string; summary: string; data: unknown }[] = []
  const controller = new AbortController()
  const context: WatchContext = {
    projectId: '1',
    conversationId,
    upsertJob: (job) => jobs.push(job),
    postEvent: (kind, summary, data) => events.push({ kind, summary, data }),
    signal: controller.signal,
  }
  return { clock, storage, jobs, events, controller, context }
}

const qaRecord = (startedAtMs: number): WatchRecord => ({ kind: 'qa_run', id: '55', label: 'QA run 55', startedAtMs })

test('a QA run is polled with backoff on failures and ends with one job_finished event', async () => {
  const h = harness(1)
  const responses: (QaRun | Error)[] = [new Error('down'), new Error('down'), run('RUNNING', 1, 3), run('COMPLETED', 3, 3)]
  const dependencies: WatchDependencies = {
    clock: h.clock,
    storage: h.storage,
    copy,
    observers: {
      qa_run: createQaRunObserver(async () => {
        const next = responses.shift()
        if (next instanceof Error || next === undefined) throw next ?? new Error('empty')
        return next
      }, h.clock, copy),
      content_map_scan: async () => undefined,
    },
  }
  assert.equal(startWatch(qaRecord(h.clock.now()), h.context, dependencies), true)
  assert.equal(isWatching(1, 'qa_run', '55'), true)
  // 같은 job 을 다시 지켜보지 않는다.
  assert.equal(startWatch(qaRecord(h.clock.now()), h.context, dependencies), false)
  assert.equal(loadWatchRecords(h.storage, '1', 1, h.clock.now()).length, 1)

  await flushMicrotasks()
  await h.clock.advance(3000) // 첫 실패 뒤 3초
  await h.clock.advance(6000) // 두 번째 실패 뒤 6초
  assert.equal(h.events.length, 0)
  await h.clock.advance(3000) // 성공하면 3초로 돌아간다
  await flushMicrotasks()

  assert.deepEqual(h.events.map((event) => event.kind), ['job_finished'])
  assert.equal(h.events[0].summary, 'QA run 55 completed: 3 of 3 scenarios completed, 0 failed.')
  assert.deepEqual(h.jobs.map((job) => job.state), ['running', 'running', 'finished'])
  assert.equal(h.jobs.at(-1)?.href, 'qa-runs/55')
  assert.equal(loadWatchRecords(h.storage, '1', 1, h.clock.now()).length, 0)
  assert.equal(isWatching(1, 'qa_run', '55'), false)
  // 첫 sleep 은 기한 timer 이고, 그 뒤는 읽기 실패 두 번과 성공 한 번 뒤의 대기다.
  assert.deepEqual(h.clock.requested.slice(1), [3000, 6000, 3000])
})

test('aborting the conversation stops the watch, sends no event and keeps the record', async () => {
  const h = harness(2)
  const dependencies: WatchDependencies = {
    clock: h.clock,
    storage: h.storage,
    copy,
    observers: {
      qa_run: createQaRunObserver(async () => run('RUNNING', 0, 2), h.clock, copy),
      content_map_scan: async () => undefined,
    },
  }
  startWatch(qaRecord(h.clock.now()), h.context, dependencies)
  await flushMicrotasks()
  h.controller.abort()
  await flushMicrotasks()
  await h.clock.advance(120_000)
  assert.equal(h.events.length, 0)
  assert.equal(loadWatchRecords(h.storage, '1', 2, h.clock.now()).length, 1)
  assert.equal(isWatching(2, 'qa_run', '55'), false)
})

test('a job that never ends fails once the deadline passes', async () => {
  const h = harness(3)
  const dependencies: WatchDependencies = {
    clock: h.clock,
    storage: h.storage,
    copy,
    observers: {
      qa_run: createQaRunObserver(async () => run('RUNNING', 0, 2), h.clock, copy),
      content_map_scan: async () => undefined,
    },
  }
  startWatch(qaRecord(h.clock.now()), h.context, dependencies)
  await flushMicrotasks()
  await h.clock.advance(WATCH_DEADLINE_MS.qa_run + 1000)
  await flushMicrotasks()
  assert.deepEqual(h.events.map((event) => event.kind), ['job_failed'])
  assert.ok(h.events[0].summary.includes('did not finish in time'))
})

test('a scan watch ignores the stale snapshot and finishes on the new scan', async () => {
  const h = harness(4)
  let push: (scan: LastScan | null) => void = () => undefined
  let unsubscribed = false
  const dependencies: WatchDependencies = {
    clock: h.clock,
    storage: h.storage,
    copy,
    observers: {
      qa_run: async () => undefined,
      content_map_scan: createScanObserver((_project, _build, onScan) => {
        push = onScan
        return () => {
          unsubscribed = true
        }
      }, '1', copy),
    },
  }
  const startedAt = h.clock.now()
  startWatch({ kind: 'content_map_scan', id: '7', label: 'Scan 7', startedAtMs: startedAt }, h.context, dependencies)
  await flushMicrotasks()

  const base: LastScan = {
    state: 'SUCCEEDED',
    gameInstanceId: '9',
    gameInstanceName: 'Editor',
    requestedAt: new Date(startedAt - 3_600_000).toISOString(),
    finishedAt: null,
    ingestedDocuments: 5,
    error: null,
    testCases: null,
  }
  push(base)
  assert.equal(h.events.length, 0)
  push({ ...base, state: 'REQUESTED', requestedAt: new Date(startedAt + 1000).toISOString(), ingestedDocuments: null })
  assert.equal(h.events.length, 0)
  push({ ...base, requestedAt: new Date(startedAt + 1000).toISOString(), ingestedDocuments: 20 })
  await flushMicrotasks()

  assert.deepEqual(h.events.map((event) => event.kind), ['job_finished'])
  assert.equal(h.events[0].summary, 'The scan of build 7 finished and 20 documents were read.')
  assert.equal(unsubscribed, true)
  assert.equal(h.jobs.at(-1)?.href, 'content-map?build=7')
})
