import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDocumentSnapshotEvent, parseDocumentStatusEvent } from './documentEventsApi.ts'

test('parseDocumentStatusEvent reads a document event', () => {
  const parsed = parseDocumentStatusEvent(
    JSON.stringify({
      type: 'document',
      document: { documentId: '41', parseStatus: 'EXTRACTING', stale: false },
    }),
  )
  assert.deepEqual(parsed, { documentId: '41', parseStatus: 'EXTRACTING', stale: false })
})

test('parseDocumentStatusEvent reads stale as true only when the server says so', () => {
  const parsed = parseDocumentStatusEvent(
    JSON.stringify({
      type: 'document',
      document: { documentId: '41', parseStatus: 'EXTRACTING', stale: true },
    }),
  )
  assert.equal(parsed?.stale, true)
})

/**
 * 서버의 `ParseStatus` 는 닫힌 enum 이다 (`PENDING` | `EXTRACTING` |
 * `EXTRACTED` | `FAILED`). 이 빌드가 모르는 값이 와도 던지거나 프레임을
 * 버리지 않고 `PENDING` 으로 내려앉는다 — `projectApi.ts` 의 `parseDocument`
 * 가 REST 문서 목록에서 따르는 규칙과 같다.
 */
test('parseDocumentStatusEvent reads an unknown parseStatus as PENDING, not a parse failure', () => {
  const parsed = parseDocumentStatusEvent(
    JSON.stringify({
      type: 'document',
      document: { documentId: '41', parseStatus: 'SOMETHING_NEW', stale: false },
    }),
  )
  assert.deepEqual(parsed, { documentId: '41', parseStatus: 'PENDING', stale: false })
})

test('parseDocumentStatusEvent reads a missing documentId as null, dropping the frame', () => {
  assert.equal(
    parseDocumentStatusEvent(
      JSON.stringify({ type: 'document', document: { parseStatus: 'EXTRACTED', stale: false } }),
    ),
    null,
  )
})

test('parseDocumentStatusEvent reads malformed JSON as null', () => {
  assert.equal(parseDocumentStatusEvent('not json'), null)
})

test('parseDocumentSnapshotEvent reads every document in the snapshot', () => {
  const parsed = parseDocumentSnapshotEvent(
    JSON.stringify({
      type: 'snapshot',
      documents: [
        { documentId: '1', parseStatus: 'EXTRACTED', stale: false },
        { documentId: '2', parseStatus: 'FAILED', stale: false },
      ],
    }),
  )
  assert.deepEqual(parsed, [
    { documentId: '1', parseStatus: 'EXTRACTED', stale: false },
    { documentId: '2', parseStatus: 'FAILED', stale: false },
  ])
})

test('parseDocumentSnapshotEvent drops one malformed entry without failing the rest', () => {
  const parsed = parseDocumentSnapshotEvent(
    JSON.stringify({
      type: 'snapshot',
      documents: [
        { documentId: '1', parseStatus: 'PENDING', stale: false },
        { parseStatus: 'PENDING', stale: false },
      ],
    }),
  )
  assert.deepEqual(parsed, [{ documentId: '1', parseStatus: 'PENDING', stale: false }])
})

test('parseDocumentSnapshotEvent reads an unknown parseStatus as PENDING', () => {
  const parsed = parseDocumentSnapshotEvent(
    JSON.stringify({
      type: 'snapshot',
      documents: [{ documentId: '1', parseStatus: 'SOMETHING_NEW', stale: false }],
    }),
  )
  assert.deepEqual(parsed, [{ documentId: '1', parseStatus: 'PENDING', stale: false }])
})

test('parseDocumentSnapshotEvent reads a missing documents array as null', () => {
  assert.equal(parseDocumentSnapshotEvent(JSON.stringify({ type: 'snapshot' })), null)
})
