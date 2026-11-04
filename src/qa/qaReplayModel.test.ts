import assert from 'node:assert/strict'
import test from 'node:test'
import { attemptRange, logAt, replayBounds, segmentAt } from './qaReplayModel'
import { DEFAULT_QA_LOG_FILTER, filterQaLogs, qaLogContains } from './qaLogFilter'
import { parseQaLog } from './qaApi'
import type { Attempt, Playback, Segment } from './evaluation/evaluationApi'
import type { QaLog, QaTry } from './qaTypes'

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 4) + seconds * 1000).toISOString()
const milliseconds = (seconds: number) => Date.parse(at(seconds))
const segment = (id: string, start: number, end: number, state = 'READY'): Segment => ({ id, startedAt: at(start), endedAt: at(end), state, url: 'https://example.test/video.mp4' })
const log = (id: string, time: number, type: QaLog['type'] = 'LOG'): QaLog => ({ id, qaTryId: '1', messageId: null, correlationId: null, direction: 'ORCHE_TO_AGENT', type, message: 'Message', payload: { nested: 'needle' }, createdAt: at(time) })
const attempt: Attempt = { id: 'attempt', qaTryId: '1', testCaseId: '3', startedAt: at(5), finishedAt: at(15), verdict: 'PASSED', logId: null, review: null, note: null, createdAt: at(5) }

test('재생은 실제 시각으로 segment 경계와 gap을 구분한다', () => {
  const segments = [segment('a', 0, 10), segment('b', 12, 20), segment('c', 20, 30, 'PENDING')]
  assert.equal(segmentAt(segments, milliseconds(0))?.id, 'a')
  assert.equal(segmentAt(segments, milliseconds(9.9))?.id, 'a')
  assert.equal(segmentAt(segments, milliseconds(10)), null)
  assert.equal(segmentAt(segments, milliseconds(12))?.id, 'b')
  assert.equal(segmentAt(segments, milliseconds(20)), null)
  assert.equal(segmentAt([{ ...segments[0], url: null }], milliseconds(5)), null)
})

test('여러 시나리오가 공유하는 녹화에서도 선택 try의 범위만 표시한다', () => {
  const qaTry = { startedAt: at(5), completedAt: at(20) } as QaTry
  const playback = { recording: { startedAt: at(0), endedAt: at(30) }, segments: [], gaps: [] } as unknown as Playback
  assert.deepEqual(replayBounds(qaTry, playback), { start: milliseconds(5), end: milliseconds(20) })
  assert.equal(replayBounds({ ...qaTry, completedAt: 'invalid' }, playback), null)
})

test('TC 구간을 try 범위에 맞추고 시작 시각 없는 기록은 추정하지 않는다', () => {
  const bounds = { start: milliseconds(8), end: milliseconds(12) }
  assert.deepEqual(attemptRange(attempt, bounds), bounds)
  assert.equal(attemptRange({ ...attempt, startedAt: null }, bounds), null)
  assert.equal(attemptRange({ ...attempt, startedAt: at(20) }, bounds), null)
  assert.deepEqual(attemptRange({ ...attempt, finishedAt: null }, bounds), bounds)
})

test('시점 로그는 미래 로그를 선택하지 않으며 같은 시각에는 마지막 행을 선택한다', () => {
  const logs = [log('1', 1), log('2', 5), log('3', 5), log('4', 8)]
  assert.equal(logAt(logs, milliseconds(0)), null)
  assert.equal(logAt(logs, milliseconds(5))?.id, '3')
  assert.equal(logAt(logs, milliseconds(7))?.id, '3')
})

test('raw 기본 필터는 pulse를 숨기고 사용자가 포함할 수 있다', () => {
  const pulse = log('2', 2, 'PULSE')
  assert.equal(parseQaLog(pulse)?.type, 'PULSE')
  const logs = [log('1', 1), pulse]
  assert.deepEqual(filterQaLogs(logs, DEFAULT_QA_LOG_FILTER).map(row => row.id), ['1'])
  assert.equal(filterQaLogs(logs, { ...DEFAULT_QA_LOG_FILTER, includePulse: true }).length, 2)
})

test('필터와 find는 payload·메시지·ID를 대소문자 구분 없이 검색한다', () => {
  const logs = [log('1', 1), { ...log('2', 2, 'ERROR'), direction: 'ORCHE_INTERNAL' as const, payload: null }]
  assert.equal(qaLogContains(logs[0], ' NEEDLE '), true)
  assert.equal(qaLogContains(logs[0], '1'), true)
  assert.equal(qaLogContains(logs[1], 'needle'), false)
  assert.deepEqual(filterQaLogs(logs, { ...DEFAULT_QA_LOG_FILTER, type: 'ERROR', direction: 'ORCHE_INTERNAL', text: 'MESSAGE' }).map(row => row.id), ['2'])
  assert.equal(filterQaLogs(logs, { ...DEFAULT_QA_LOG_FILTER, type: 'ERROR', text: 'needle' }).length, 0)
})
