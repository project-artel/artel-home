import assert from 'node:assert/strict'
import test from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { elapsedSeconds, parseQaTryDetail, type QaTryDetail } from './qaTryDetailApi'

const DETAIL_FIELDS = {
  qaTryId: '110',
  status: 'COMPLETED',
  scenarioTitle: '게임 시작 -> 1 스테이지 완료까지',
  model: 'bedrock/claude-haiku-4-5',
  promptVersion: 'v16',
  reasoningEffort: null,
  startedAt: '2026-09-04T02:12:06Z',
  completedAt: '2026-09-04T02:17:39Z',
  stepsPassed: 17,
  stepsTotal: 17,
  issues: 0,
  feedback: 0,
  usage: {
    calls: 78,
    pricedCalls: 78,
    costUsd: 0.989549,
    costEstimated: true,
    inputTokens: 7134126,
    cachedInputTokens: 6952301,
    cacheWriteTokens: 0,
    outputTokens: 22498,
  },
  toolCalls: [
    { tool: 'observe_scene', calls: 19 },
    { tool: 'report_step', calls: 17 },
  ],
}

function parse(overrides: Record<string, unknown> = {}): QaTryDetail {
  return parseQaTryDetail({ ...DETAIL_FIELDS, ...overrides }, '110', 200)
}

/**
 * 이 파일이 지키는 것 하나로 줄이면: **"없음"과 "0"은 다른 값이다.**
 *
 * 비용이 없다는 것은 공짜가 아니라 아무도 단가를 말한 적 없다는 뜻이고, step 이 없다는 것은
 * 0점이 아니라 판정 자체가 없다는 뜻이다. 둘 중 어느 쪽이든 0으로 떨어뜨리면 화면은 그럴듯한
 * 숫자를 그리고, 그 숫자가 틀렸다는 것을 아무도 눈치채지 못한다.
 */
test('parseQaTryDetail reads a run that finished', () => {
  const detail = parse()

  assert.equal(detail.qaTryId, '110')
  assert.equal(detail.stepsPassed, 17)
  assert.equal(detail.stepsTotal, 17)
  assert.equal(detail.usage.calls, 78)
  assert.equal(detail.toolCalls.length, 2)
})

test('parseQaTryDetail keeps a missing cost as null rather than zero', () => {
  const detail = parse({ usage: { ...DETAIL_FIELDS.usage, costUsd: null, pricedCalls: 0 } })

  assert.equal(detail.usage.costUsd, null)
  assert.equal(detail.usage.pricedCalls, 0)
})

/** `cost_usd` 는 서버에서 `NUMERIC` 이라 직렬화가 바뀌면 문자열로 온다. */
test('parseQaTryDetail reads a cost that arrived as a string', () => {
  const detail = parse({ usage: { ...DETAIL_FIELDS.usage, costUsd: '0.060586' } })

  assert.equal(detail.usage.costUsd, 0.060586)
})

test('parseQaTryDetail keeps missing steps as null rather than zero', () => {
  // 취소된 run 이 실제로 이렇게 온다. 0 으로 채우면 "0 / 17 실패" 처럼 읽힌다.
  const detail = parse({ status: 'CANCELLED', stepsPassed: null, stepsTotal: null })

  assert.equal(detail.stepsPassed, null)
  assert.equal(detail.stepsTotal, null)
})

test('parseQaTryDetail treats a missing costEstimated as not estimated', () => {
  const usage: Record<string, unknown> = { ...DETAIL_FIELDS.usage }
  delete usage.costEstimated

  // 모르면 추정이라고 말하지 않는다. 추정 표시는 우리가 계산했다는 주장이라 근거가 있어야 한다.
  assert.equal(parse({ usage }).usage.costEstimated, false)
})

test('parseQaTryDetail drops tool entries with no name', () => {
  const detail = parse({
    toolCalls: [
      { tool: 'press_key', calls: 7 },
      { tool: '', calls: 3 },
      { calls: 2 },
      null,
    ],
  })

  assert.deepEqual(detail.toolCalls, [{ tool: 'press_key', calls: 7 }])
})

test('parseQaTryDetail reads a missing tool list as empty, not a parse failure', () => {
  assert.deepEqual(parse({ toolCalls: undefined }).toolCalls, [])
})

test('parseQaTryDetail refuses a body with no status or start', () => {
  assert.throws(() => parse({ status: '' }), ProjectApiError)
  assert.throws(() => parse({ startedAt: undefined }), ProjectApiError)
})

/**
 * `usage` 가 없는 것은 모양이 우리가 아는 것이 아니라는 뜻이다. 0 으로 채우고 그리면 실제로
 * 나간 돈이 화면에서 공짜가 된다 — 이 화면에서 그것이 최악의 결과다.
 */
test('parseQaTryDetail refuses a body with no usage rather than filling it with zeros', () => {
  assert.throws(() => parse({ usage: undefined }), ProjectApiError)
})

test('elapsedSeconds measures the run it was given', () => {
  assert.equal(elapsedSeconds(parse()), 333)
})

/**
 * 도는 중인 run 에 "지금까지" 를 계산해 주지 않는다. 이 화면은 열 때 한 번 부르고 끝이라 그
 * 값은 그대로 멈춰 있고, 시계처럼 보이는 수가 멈춰 있으면 화면이 못 지키는 약속이 된다.
 */
test('elapsedSeconds is null while a run is still going', () => {
  assert.equal(elapsedSeconds(parse({ status: 'RUNNING', completedAt: null })), null)
})
