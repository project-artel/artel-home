import assert from 'node:assert/strict'
import test from 'node:test'
import { listQaVerdicts } from './qaApi'
import { deriveCaseVerdicts, deriveQaProgress } from './qaProgress'
import { mergeQaVerdicts } from './qaVerdicts'
import { loadQaTrySnapshot } from './qaTrySnapshot'
import type { QaLog } from './qaTypes'
import { createEmptyStep } from '../testScenarios/scenarioTypes'

function log(id: number, type: QaLog['type'], payload: unknown = {}): QaLog {
  return { id: String(id), qaTryId: '1', type, payload, direction: 'AGENT_TO_ORCHE',
    messageId: null, correlationId: null, message: '', createdAt: '2026-10-27T00:00:00Z' }
}

const verdicts = [
  log(1, 'STATUS', { step: 1, status: 'COMPLETED' }),
  log(2, 'STATUS', { step: 2, status: 'FAILED' }),
  log(3, 'CASE_VERDICT', { case_id: 11, verification_status: 'VERIFIED' }),
]
const tail = Array.from({ length: 50 }, (_, i) => log(i + 4, 'LOG'))
const steps = [1, 2, 3].map(() => createEmptyStep())
function progress(logs: QaLog[], status: 'RUNNING' | 'CANCELLED' = 'RUNNING') {
  return deriveQaProgress({ scenarioSteps: steps, executionMode: 'FREE', logs, status, historyComplete: true })
}

test('최근 50개에 판정이 없어도 재진입 조회로 통과와 실패를 복원한다', async (t) => {
  const requested: string[] = []
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input)
    requested.push(url)
    return new Response(JSON.stringify(url.endsWith('/1') ? {
      id: '1', testScenarioId: '7', gameInstanceId: '3', status: 'RUNNING',
    } : url.includes('/verdicts') ? verdicts : {
      items: tail, hasMore: true, nextBeforeId: '4',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  const live = progress([...verdicts, ...tail])
  // 재진입마다 새 응답으로 복원한다. 이전 컴포넌트의 메모리는 사용하지 않는다.
  for (let visit = 0; visit < 2; visit++) {
    const { page, verdictLogs: restored } = await loadQaTrySnapshot('1')
    assert.equal(page.items.length, 50)
    assert.equal(progress(page.items).reported, 0)
    assert.deepEqual(progress(restored), live)
    assert.deepEqual(progress(restored).steps.map((s) => s.state), ['passed', 'failed', 'pending'])
    assert.equal(deriveCaseVerdicts(restored).get('11'), 'VERIFIED')
  }
  assert.equal(requested.filter((url) => url.endsWith('/verdicts')).length, 2)
})

test('로그 cursor를 확보한 후 판정을 조회하여 조회 사이의 판정 누락을 막는다', async (t) => {
  let releaseLogs!: () => void
  const logsGate = new Promise<void>((resolve) => { releaseLogs = resolve })
  let verdictRequested = false
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('/logs')) {
      await logsGate
      return Response.json({ items: tail, hasMore: true, nextBeforeId: '4' })
    }
    if (url.includes('/verdicts')) {
      verdictRequested = true
      return Response.json([...verdicts, log(54, 'STATUS', { step: 3, status: 'COMPLETED' })])
    }
    return Response.json({ id: '1', testScenarioId: '7', gameInstanceId: '3', status: 'RUNNING' })
  })
  const loading = loadQaTrySnapshot('1')
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(verdictRequested, false)
  releaseLogs()
  const snapshot = await loading
  assert.equal(snapshot.page.items.at(-1)?.id, '53')
  assert.equal(progress(snapshot.verdictLogs).steps[2].state, 'passed')
  assert.equal(mergeQaVerdicts(snapshot.verdictLogs, [log(54, 'STATUS', { step: 3, status: 'COMPLETED' })]).length, 4)
})

test('조회와 SSE가 겹쳐도 중복되지 않고 최신 판정이 유지된다', () => {
  const changed = log(60, 'STATUS', { step: 2, status: 'COMPLETED' })
  const merged = mergeQaVerdicts(verdicts, [changed, verdicts[1], ...tail])
  assert.equal(merged.length, 4)
  assert.equal(progress(merged).steps[1].state, 'passed')
  assert.equal(progress(mergeQaVerdicts(merged, [verdicts[1]])).steps[1].state, 'passed')
})

test('요약 없이 취소된 실행도 과거 판정을 복원한다', () => {
  assert.deepEqual(progress(verdicts, 'CANCELLED').steps.map((s) => s.state), ['passed', 'failed', 'unreported'])
})

test('판정 응답이 잘못되면 미판정 목록으로 숨기지 않고 실패한다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([{}]), { status: 200 }))
  await assert.rejects(listQaVerdicts('1'))
})
