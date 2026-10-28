import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clipDuration, clipElapsed, clipGaps, clipSeek, clipSegments, clipTimeLabel, evidenceExpired } from './videoEvidence'
import type { Attempt, Playback, Segment } from './evaluationApi'

const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 0, 0, seconds)).toISOString()
const attempt: Attempt = { id: 'attempt', qaTryId: '1', testCaseId: '42', startedAt: at(55), finishedAt: at(65), createdAt: at(55), verdict: 'PASSED', logId: '1', review: null, note: null }
const segment = (id: string, from: number, to: number, state = 'READY'): Segment => ({ id, startedAt: at(from), endedAt: at(to), state, url: 'https://example.test/video' })

test('TC 진행도는 원본 segment offset 대신 첫 재생 frame부터 0으로 표시한다', () => {
  const clips = clipSegments(attempt, [segment('a', 0, 60), segment('b', 60, 120)])
  assert.equal(clipDuration(clips), 25)
  assert.equal(clipElapsed(clips, 'a', 45), 0)
  assert.equal(clipElapsed(clips, 'a', 50), 5)
  assert.equal(clipElapsed(clips, 'b', 3), 18)
  assert.deepEqual(clipSeek(clips, 0), { id: 'a', time: 45 })
  assert.deepEqual(clipSeek(clips, 15), { id: 'b', time: 0 })
  assert.deepEqual(clipSeek(clips, 25), { id: 'b', time: 10 })
  assert.deepEqual(clipSeek(clips, 100), { id: 'b', time: 10 })
  assert.deepEqual(clipSeek(clips, -1), { id: 'a', time: 45 })
})

test('TC 전환 시 같은 segment라도 각 TC 시작을 상대 시간 0으로 계산한다', () => {
  const source = [segment('shared', 0, 120)]
  const first = clipSegments(attempt, source)
  const second = clipSegments({ ...attempt, id: 'other', startedAt: at(85), finishedAt: at(95) }, source)
  assert.deepEqual(clipSeek(first, 0), { id: 'shared', time: 45 })
  assert.deepEqual(clipSeek(second, 0), { id: 'shared', time: 75 })
  assert.equal(clipElapsed(second, 'shared', 75), 0)
})

test('누락 구간은 진행도 길이에서 제외하고 정확한 경계는 다음 영상으로 이동한다', () => {
  const clips = clipSegments(attempt, [segment('a', 48, 50), segment('b', 60, 67)])
  assert.equal(clipDuration(clips), 9)
  assert.deepEqual(clipSeek(clips, 2), { id: 'b', time: 0 })
  assert.equal(clipElapsed(clips, 'b', 0), 2)
  assert.equal(clipElapsed(clips, 'a', -5), 0)
  assert.equal(clipElapsed(clips, 'b', 100), 9)
  assert.equal(clipSeek([], 0), null)
  assert.equal(clipDuration([]), 0)
  assert.equal(clipTimeLabel(0), '0:00')
  assert.equal(clipTimeLabel(65.8), '1:05')
})

test('TC 시작 10초 전부터 보고 5초 후까지 segment 경계에서 자른다', () => {
  const result = clipSegments(attempt, [segment('a', 0, 60), segment('b', 60, 120)])
  assert.deepEqual(result.map(({ id, from, to }) => ({ id, from, to })), [
    { id: 'a', from: 45, to: 60 }, { id: 'b', from: 0, to: 10 },
  ])
})

test('만료·업로드 중인 영상과 검증 구간 밖의 영상을 제외한다', () => {
  assert.deepEqual(clipSegments(attempt, [segment('a', 0, 40), segment('b', 45, 70, 'UPLOADING'), segment('c', 45, 70, 'EXPIRED'), segment('d', 70, 120)]), [])
})

test('누락 구간도 해당 TC의 앞 10초와 뒤 5초 범위로 자른다', () => {
  assert.deepEqual(clipGaps(attempt, [
    { startedAt: at(0), endedAt: at(50), reason: 'VIDEO_MISSING' },
    { startedAt: at(68), endedAt: at(90), reason: 'UPLOAD_FAILED' },
    { startedAt: at(90), endedAt: at(100), reason: 'VIDEO_MISSING' },
  ]), [
    { startedAt: at(45), endedAt: at(50), reason: 'VIDEO_MISSING' },
    { startedAt: at(68), endedAt: at(70), reason: 'UPLOAD_FAILED' },
  ])
})

test('장기 대기 중인 QA도 해당 TC의 영상이 만료되면 삭제 상태로 표시한다', () => {
  const playback: Playback = { recording: { id: 'recording', startedAt: at(0), endedAt: null, expiresAt: null, error: null },
    segments: [segment('old', 0, 120, 'EXPIRED'), segment('later', 120, 180)], gaps: [] }
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(180))), true)
  assert.equal(evidenceExpired(attempt, { ...playback, segments: [] }, Date.parse(at(180))), false)
})

test('30일 경계를 넘으면 갱신 전에도 만료를 표시하고 일부 구간은 남아 있으면 재생한다', () => {
  const playback: Playback = { recording: null, segments: [segment('first', 0, 60), segment('second', 60, 120)], gaps: [] }
  const thirtyDays = 30 * 24 * 60 * 60 * 1000
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(90)) + thirtyDays), false)
  assert.equal(evidenceExpired(attempt, playback, Date.parse(at(120)) + thirtyDays), true)
})
