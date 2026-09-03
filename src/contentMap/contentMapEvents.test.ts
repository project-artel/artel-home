/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseContentMapDocumentEvent,
  parseContentMapDocumentFrame,
  parseContentMapIngestEvent,
  parseContentMapScanEvent,
  parseContentMapSnapshotEvent,
  parseIngestProgress,
  parseLastScan,
} from './contentMapApi.ts'
import { documentIngestState, scanElapsedSeconds } from './contentMapTypes.ts'

/*
 * `.../content-map/events` (SSE) 프레임 파서와, 그 위에서 화면이 쓰는 순수
 * 계산 두 개(`documentIngestState`, `scanElapsedSeconds`).
 *
 * 서버(ARTEL-763)가 아직 만들어지는 중이라 실제 프레임으로 검증할 수 없다.
 * 여기 있는 페이로드는 `contract-contentmap.md` 그대로 손으로 쓴 것이고, 이
 * 시험이 증명하는 것은 "계약대로 오면 이렇게 읽는다"이지 "서버가 이렇게
 * 준다"가 아니다.
 *
 * 지켜야 하는 것 하나: `scan` 이 정상적으로 `null` 일 수 있는 값이라는 것과,
 * 프레임 자체를 못 읽었다는 것을 같은 `null` 로 뭉개면 안 된다 — 전자는
 * "서버가 이 빌드의 스캔을 모른다", 후자는 "프레임이 깨졌으니 버린다"로
 * 화면의 갈래가 다르다.
 */

test('parseLastScan 은 REQUESTED 스캔을 읽는다', () => {
  const scan = parseLastScan({
    state: 'REQUESTED',
    gameInstanceId: 42,
    gameInstanceName: 'Editor',
    requestedAt: '2026-09-03T01:00:00Z',
    finishedAt: null,
    ingestedDocuments: null,
    error: null,
  })

  assert.deepEqual(scan, {
    state: 'REQUESTED',
    gameInstanceId: '42',
    gameInstanceName: 'Editor',
    requestedAt: '2026-09-03T01:00:00Z',
    finishedAt: null,
    ingestedDocuments: null,
    error: null,
  })
})

test('parseLastScan 은 state·gameInstanceId·requestedAt 이 없으면 null 이다', () => {
  assert.equal(parseLastScan({ gameInstanceId: 1, requestedAt: '2026-09-03T01:00:00Z' }), null)
  assert.equal(parseLastScan({ state: 'REQUESTED', requestedAt: '2026-09-03T01:00:00Z' }), null)
  assert.equal(parseLastScan({ state: 'REQUESTED', gameInstanceId: 1 }), null)
  assert.equal(parseLastScan(null), null)
})

test('parseLastScan 은 모르는 state 를 낮추지 않고 버린다', () => {
  assert.equal(
    parseLastScan({ state: 'RUNNING', gameInstanceId: 1, requestedAt: '2026-09-03T01:00:00Z' }),
    null,
  )
})

test('parseIngestProgress 는 세 수를 그대로 읽는다', () => {
  assert.deepEqual(
    parseIngestProgress({ receivedDocuments: 5, ingestedDocuments: 3, failedDocuments: 1 }),
    { receivedDocuments: 5, ingestedDocuments: 3, failedDocuments: 1 },
  )
})

test('parseIngestProgress 는 음수·비수치를 0으로 낮춘다', () => {
  assert.deepEqual(
    parseIngestProgress({ receivedDocuments: -3, ingestedDocuments: 'two', failedDocuments: null }),
    { receivedDocuments: 0, ingestedDocuments: 0, failedDocuments: 0 },
  )
})

test('parseContentMapDocumentEvent 는 documentId 를 문자열로 정규화한다', () => {
  const document = parseContentMapDocumentEvent({
    documentId: 8,
    receivedAt: '2026-09-03T01:00:00Z',
    ingestedAt: null,
    ingestFailedAt: '2026-09-03T01:05:00Z',
    ingestError: 'schema mismatch',
  })

  assert.deepEqual(document, {
    documentId: '8',
    receivedAt: '2026-09-03T01:00:00Z',
    ingestedAt: null,
    ingestFailedAt: '2026-09-03T01:05:00Z',
    ingestError: 'schema mismatch',
  })
})

test('parseContentMapDocumentEvent 는 documentId 가 없으면 null 이다', () => {
  assert.equal(parseContentMapDocumentEvent({ receivedAt: '2026-09-03T01:00:00Z' }), null)
})

test('documentIngestState 는 ingestedAt·ingestFailedAt 으로 세 갈래를 가른다', () => {
  const base = { documentId: '1', receivedAt: '2026-09-03T01:00:00Z' }
  assert.equal(
    documentIngestState({ ...base, ingestedAt: null, ingestFailedAt: null, ingestError: null }),
    'pending',
  )
  assert.equal(
    documentIngestState({
      ...base,
      ingestedAt: '2026-09-03T01:01:00Z',
      ingestFailedAt: null,
      ingestError: null,
    }),
    'ingested',
  )
  assert.equal(
    documentIngestState({
      ...base,
      ingestedAt: null,
      ingestFailedAt: '2026-09-03T01:01:00Z',
      ingestError: 'boom',
    }),
    'failed',
  )
  // ingestedAt 이 있으면 ingestFailedAt 도 같이 와도 ingested 로 읽는다 — 재시도가
  // 결국 성공한 문서는 실패 이력이 아니라 지금의 상태로 그려야 한다.
  assert.equal(
    documentIngestState({
      ...base,
      ingestedAt: '2026-09-03T01:02:00Z',
      ingestFailedAt: '2026-09-03T01:01:00Z',
      ingestError: null,
    }),
    'ingested',
  )
})

test('scanElapsedSeconds 는 REQUESTED 스캔을 지금 시각까지 잰다', () => {
  const scan = parseLastScan({
    state: 'REQUESTED',
    gameInstanceId: 1,
    gameInstanceName: 'Editor',
    requestedAt: '2026-09-03T01:00:00Z',
    finishedAt: null,
  })
  assert.ok(scan !== null)
  const now = Date.parse('2026-09-03T01:00:42Z')
  assert.equal(scanElapsedSeconds(scan, now), 42)
})

test('scanElapsedSeconds 는 끝난 스캔을 finishedAt 까지만 잰다 — nowMs 가 더 지나도 그대로다', () => {
  const scan = parseLastScan({
    state: 'SUCCEEDED',
    gameInstanceId: 1,
    gameInstanceName: 'Editor',
    requestedAt: '2026-09-03T01:00:00Z',
    finishedAt: '2026-09-03T01:00:10Z',
  })
  assert.ok(scan !== null)
  const muchLater = Date.parse('2026-09-03T02:00:00Z')
  assert.equal(scanElapsedSeconds(scan, muchLater), 10)
})

test('parseContentMapSnapshotEvent 는 scan·ingest·documents 를 함께 읽는다', () => {
  const frame = parseContentMapSnapshotEvent(
    JSON.stringify({
      type: 'snapshot',
      scan: {
        state: 'SUCCEEDED',
        gameInstanceId: 7,
        gameInstanceName: 'Player',
        requestedAt: '2026-09-03T01:00:00Z',
        finishedAt: '2026-09-03T01:00:30Z',
        ingestedDocuments: 2,
      },
      ingest: { receivedDocuments: 2, ingestedDocuments: 2, failedDocuments: 0 },
      documents: [
        {
          documentId: 1,
          receivedAt: '2026-09-03T01:00:01Z',
          ingestedAt: '2026-09-03T01:00:05Z',
        },
        {
          documentId: 2,
          receivedAt: '2026-09-03T01:00:02Z',
          ingestedAt: '2026-09-03T01:00:06Z',
        },
      ],
    }),
  )

  assert.ok(frame !== null)
  assert.equal(frame.scan?.state, 'SUCCEEDED')
  assert.deepEqual(frame.ingest, { receivedDocuments: 2, ingestedDocuments: 2, failedDocuments: 0 })
  assert.deepEqual(
    frame.documents.map((document) => document.documentId),
    ['1', '2'],
  )
})

test('parseContentMapSnapshotEvent 는 재시작 뒤의 snapshot(scan: null) 을 스캔이 없다로 읽지 않는다', () => {
  const frame = parseContentMapSnapshotEvent(
    JSON.stringify({
      type: 'snapshot',
      scan: null,
      ingest: { receivedDocuments: 3, ingestedDocuments: 1, failedDocuments: 0 },
      documents: [],
    }),
  )

  assert.ok(frame !== null)
  // scan 은 legitimate null — "이 서버는 모른다"는 사실이지 파싱 실패가 아니다.
  assert.equal(frame.scan, null)
  assert.deepEqual(frame.ingest, { receivedDocuments: 3, ingestedDocuments: 1, failedDocuments: 0 })
})

test('parseContentMapSnapshotEvent 는 JSON 이 아닌 프레임을 버린다', () => {
  assert.equal(parseContentMapSnapshotEvent('not json'), null)
})

test('parseContentMapScanEvent 는 scan: null 과 프레임 파싱 실패를 가른다', () => {
  const knownNull = parseContentMapScanEvent(JSON.stringify({ type: 'scan', scan: null }))
  assert.deepEqual(knownNull, { scan: null })

  const malformed = parseContentMapScanEvent('{not valid json')
  assert.equal(malformed, null)
})

test('parseContentMapScanEvent 는 정상 스캔을 읽는다', () => {
  const frame = parseContentMapScanEvent(
    JSON.stringify({
      type: 'scan',
      scan: {
        state: 'FAILED',
        gameInstanceId: 3,
        gameInstanceName: 'Player',
        requestedAt: '2026-09-03T01:00:00Z',
        finishedAt: '2026-09-03T01:00:05Z',
        error: 'SDK disconnected mid-scan',
      },
    }),
  )

  assert.deepEqual(frame, {
    scan: {
      state: 'FAILED',
      gameInstanceId: '3',
      gameInstanceName: 'Player',
      requestedAt: '2026-09-03T01:00:00Z',
      finishedAt: '2026-09-03T01:00:05Z',
      ingestedDocuments: null,
      error: 'SDK disconnected mid-scan',
    },
  })
})

test('parseContentMapIngestEvent 는 ingest 가 없으면 프레임을 버린다', () => {
  assert.equal(parseContentMapIngestEvent(JSON.stringify({ type: 'ingest' })), null)
})

test('parseContentMapIngestEvent 는 진행 두 수를 읽는다', () => {
  const frame = parseContentMapIngestEvent(
    JSON.stringify({
      type: 'ingest',
      ingest: { receivedDocuments: 4, ingestedDocuments: 2, failedDocuments: 1 },
    }),
  )
  assert.deepEqual(frame, { ingest: { receivedDocuments: 4, ingestedDocuments: 2, failedDocuments: 1 } })
})

test('parseContentMapDocumentFrame 는 문서 한 행을 읽는다', () => {
  const frame = parseContentMapDocumentFrame(
    JSON.stringify({
      type: 'document',
      document: {
        documentId: 9,
        receivedAt: '2026-09-03T01:00:00Z',
        ingestedAt: null,
        ingestFailedAt: '2026-09-03T01:00:10Z',
        ingestError: 'unreadable evidence',
      },
    }),
  )

  assert.deepEqual(frame, {
    document: {
      documentId: '9',
      receivedAt: '2026-09-03T01:00:00Z',
      ingestedAt: null,
      ingestFailedAt: '2026-09-03T01:00:10Z',
      ingestError: 'unreadable evidence',
    },
  })
})

test('parseContentMapDocumentFrame 는 documentId 가 없는 document 를 버린다', () => {
  assert.equal(
    parseContentMapDocumentFrame(JSON.stringify({ type: 'document', document: { receivedAt: 'x' } })),
    null,
  )
})
