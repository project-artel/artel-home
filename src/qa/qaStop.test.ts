import assert from 'node:assert/strict'
import test from 'node:test'
import { notStartedCount, stopLinesOf, stopNoticeOf } from './qaStop'
import type { QaLog, QaLogType, QaRun, QaTry } from './qaTypes'

function log(id: string, type: QaLogType, payload: unknown): QaLog {
  return {
    id,
    qaTryId: '7',
    messageId: null,
    correlationId: null,
    direction: type === 'ERROR' ? 'AGENT_TO_ORCHE' : 'ORCHE_INTERNAL',
    type,
    message: '',
    payload,
    createdAt: '2026-11-04T01:00:00Z',
  }
}

const creditError = log('11', 'ERROR', {
  code: 'llm_credit_exhausted',
  message: 'Anthropic credit is exhausted, so the run stopped.',
  detail: { provider: 'anthropic', provider_message: 'Your credit balance is too low to access the Anthropic API.' },
})

function qaTry(id: string, stopCode: string | null): QaTry {
  return {
    id,
    testScenarioId: id,
    gameInstanceId: '1',
    agentSessionId: null,
    status: stopCode === null ? 'COMPLETED' : 'UNDECIDED',
    startedAt: null,
    completedAt: null,
    qaRunId: '59',
    stop: stopCode === null ? null : { code: stopCode, provider: 'anthropic', message: null },
  }
}

function run(stopCode: string | null, tries: QaTry[] = []): QaRun {
  return {
    id: '59',
    testRunId: '895',
    gameInstanceId: '1',
    gameBuildId: null,
    status: stopCode === null ? 'COMPLETED' : 'UNDECIDED',
    startedAt: null,
    completedAt: null,
    tries,
    testRunGameBuildId: null,
    stop: stopCode === null ? null : { code: stopCode, provider: 'anthropic', message: 'm' },
    discarded: stopCode !== null,
  }
}

test('멈춘 오류 프레임과 실행 안 함 STATUS 만 줄이 된다', () => {
  const lines = stopLinesOf([
    log('10', 'ERROR', { code: 'run_incomplete', message: 'The run stopped on an error' }),
    creditError,
    log('12', 'STATUS', { status: 'UNDECIDED', stop: { code: 'not_started', cause: 'llm_credit_exhausted' } }),
    log('13', 'STATUS', { status: 'COMPLETED', step: 1 }),
  ])
  assert.deepEqual(lines, [
    { kind: 'error', id: '11', code: 'llm_credit_exhausted' },
    { kind: 'notStarted', id: '12', cause: 'llm_credit_exhausted' },
  ])
})

test('런 조회의 까닭이 먼저고 그 전에는 방금 온 오류 프레임이다', () => {
  const live = { code: 'llm_credit_exhausted' }
  assert.deepEqual(stopNoticeOf(run('llm_auth_failed'), live), { code: 'llm_auth_failed' })
  assert.deepEqual(stopNoticeOf(run(null), live), live)
  assert.equal(stopNoticeOf(run(null), null), null)
})

test('시작하지 못한 시나리오 수', () => {
  assert.equal(notStartedCount(run('llm_credit_exhausted', [qaTry('1', 'llm_credit_exhausted'), qaTry('2', 'not_started'), qaTry('3', 'not_started')])), 2)
})
