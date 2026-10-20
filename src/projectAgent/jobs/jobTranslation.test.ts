import assert from 'node:assert/strict'
import test from 'node:test'
import type { LastScan } from '../../contentMap/contentMapTypes'
import type { QaRun, QaTry, QaTryStatus } from '../../qa/qaTypes'
import { messages } from '../../i18n/messages'
import {
  QA_POLL_BACKOFF_MAX_MS,
  jobHref,
  qaPollDelay,
  translateQaRun,
  translateScan,
} from './jobTranslation'

const copy = messages.en.projectAgent.tasks.jobs

function tryWith(status: QaTryStatus, id: string): QaTry {
  return {
    id,
    testScenarioId: id,
    gameInstanceId: '1',
    agentSessionId: null,
    status,
    startedAt: null,
    completedAt: null,
    qaRunId: '55',
  }
}

function runWith(status: QaTryStatus, tries: QaTryStatus[]): QaRun {
  return {
    id: '55',
    testRunId: '3',
    gameInstanceId: '1',
    status,
    startedAt: null,
    completedAt: null,
    tries: tries.map((one, index) => tryWith(one, String(index))),
  }
}

test('a QA run in progress reports finished scenarios over the total', () => {
  const result = translateQaRun(runWith('RUNNING', ['COMPLETED', 'COMPLETED', 'RUNNING', 'PENDING']), copy)
  assert.equal(result.state, 'running')
  assert.equal(result.progress, 'Scenario 2/4')
  assert.equal(result.detail, undefined)
})

test('a QA run without tries yet says it is waiting', () => {
  assert.equal(translateQaRun(runWith('STARTING', []), copy).progress, copy.qaPending)
})

test('a completed QA run finishes with the completed and failed counts', () => {
  const result = translateQaRun(runWith('COMPLETED', ['COMPLETED', 'COMPLETED', 'FAILED']), copy)
  assert.equal(result.state, 'finished')
  assert.equal(result.detail, 'QA run 55 completed: 2 of 3 scenarios completed, 1 failed.')
  assert.deepEqual(result.data, { qaRunId: '55', status: 'COMPLETED', total: 3, completed: 2, failed: 1 })
})

test('failed and cancelled QA runs end as failures', () => {
  const failed = translateQaRun(runWith('FAILED', ['COMPLETED', 'FAILED', 'PENDING']), copy)
  assert.equal(failed.state, 'failed')
  assert.equal(failed.detail, 'QA run 55 failed after 2 of 3 scenarios.')
  const cancelled = translateQaRun(runWith('CANCELLED', ['COMPLETED', 'CANCELLED']), copy)
  assert.equal(cancelled.state, 'failed')
  assert.equal(cancelled.detail, 'QA run 55 was cancelled after 2 of 2 scenarios.')
})

test('poll delay starts at 3 seconds and backs off to 30 seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(qaPollDelay), [3000, 3000, 6000, 12_000, 24_000, QA_POLL_BACKOFF_MAX_MS, QA_POLL_BACKOFF_MAX_MS])
})

const STARTED = Date.parse('2026-10-20T10:00:00Z')

function scan(overrides: Partial<LastScan>): LastScan {
  return {
    state: 'REQUESTED',
    gameInstanceId: '9',
    gameInstanceName: 'Editor',
    requestedAt: '2026-10-20T10:00:05Z',
    finishedAt: null,
    ingestedDocuments: null,
    error: null,
    testCases: null,
    ...overrides,
  }
}

test('no scan yet means the game has not started one', () => {
  assert.equal(translateScan(undefined, '7', STARTED, copy).state, 'running')
  assert.equal(translateScan(null, '7', STARTED, copy).progress, copy.scanWaiting)
})

test('a finished scan that was requested before the watch began is not this scan', () => {
  const old = scan({ state: 'SUCCEEDED', requestedAt: '2026-10-20T09:00:00Z', ingestedDocuments: 12 })
  assert.equal(translateScan(old, '7', STARTED, copy).state, 'running')
  const recent = scan({ state: 'SUCCEEDED', requestedAt: '2026-10-20T09:59:30Z', ingestedDocuments: 12 })
  assert.equal(translateScan(recent, '7', STARTED, copy).state, 'finished')
})

test('a requested scan shows how many documents were read', () => {
  assert.equal(translateScan(scan({ ingestedDocuments: 4 }), '7', STARTED, copy).progress, 'Scanning, 4 documents read')
  assert.equal(translateScan(scan({}), '7', STARTED, copy).progress, 'Scanning')
})

test('a succeeded scan without test case generation finishes with the document count', () => {
  const result = translateScan(scan({ state: 'SUCCEEDED', ingestedDocuments: 31 }), '7', STARTED, copy)
  assert.equal(result.state, 'finished')
  assert.equal(result.detail, 'The scan of build 7 finished and 31 documents were read.')
})

test('with test case generation the job waits until generation ends', () => {
  const pending = scan({ state: 'SUCCEEDED', ingestedDocuments: 31, testCases: { state: 'PENDING', created: null, carriedOver: null, reason: null } })
  const waiting = translateScan(pending, '7', STARTED, copy)
  assert.equal(waiting.state, 'running')
  assert.equal(waiting.progress, copy.scanGeneratingTestCases)

  const generated = scan({ state: 'SUCCEEDED', ingestedDocuments: 31, testCases: { state: 'GENERATED', created: 120, carriedOver: 8, reason: null } })
  const done = translateScan(generated, '7', STARTED, copy)
  assert.equal(done.state, 'finished')
  assert.equal(done.detail, 'The scan of build 7 finished with 31 documents, and 120 test cases were created (8 carried over).')
  assert.equal(done.data?.created, 120)
})

test('skipped generation finishes and failed generation fails', () => {
  const skipped = scan({ state: 'SUCCEEDED', testCases: { state: 'SKIPPED', created: null, carriedOver: null, reason: null } })
  assert.equal(translateScan(skipped, '7', STARTED, copy).state, 'finished')
  const failed = scan({ state: 'SUCCEEDED', testCases: { state: 'FAILED', created: null, carriedOver: null, reason: 'no screens' } })
  const result = translateScan(failed, '7', STARTED, copy)
  assert.equal(result.state, 'failed')
  assert.ok(result.detail?.endsWith('no screens'))
})

test('a failed scan carries the server reason', () => {
  const result = translateScan(scan({ state: 'FAILED', error: 'game disconnected' }), '7', STARTED, copy)
  assert.equal(result.state, 'failed')
  assert.equal(result.detail, 'The scan of build 7 failed: game disconnected')
  assert.equal(translateScan(scan({ state: 'FAILED' }), '7', STARTED, copy).detail, 'The scan of build 7 failed.')
})

test('result links are project-relative', () => {
  assert.equal(jobHref('qa_run', '55'), 'qa-runs/55')
  assert.equal(jobHref('content_map_scan', 'b 1'), 'content-map?build=b%201')
})
