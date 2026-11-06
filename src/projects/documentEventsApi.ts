import { orchestrationUrlFor } from '../auth/authApi'
import { asNullableString, asRecord, isOneOf, projectPath } from './projectApi'
import { PARSE_STATUSES, type ParseStatus } from './projectTypes'

/**
 * 문서 하나의 `parse_status` — ARTEL-759 cross-repository 계약의
 * `DocumentParseStatusResponse` 그대로다. `/api/projects/{projectId}/documents/events`
 * (ARTEL-760) 의 두 이벤트가 모두 이 타입으로 읽힌다: `snapshot` 은 `documents`
 * 배열에 프로젝트 문서마다 하나씩, `document` 는 하나만 싣는다.
 */
export type DocumentParseStatusEvent = {
  documentId: string
  parseStatus: ParseStatus
  stale: boolean
}

/** 문서마다가 아니라 프로젝트 하나에 `EventSource` 하나 — 계약이 그렇게 요구한다. */
export function documentEventsUrl(projectId: string): string {
  return orchestrationUrlFor(projectPath(projectId, '/documents/events'))
}

/**
 * 이 빌드가 모르는 `parseStatus` 값은 프레임을 버리는 대신 `PENDING` 으로
 * 내려앉는다 — `isOneOf` 가 이 저장소의 관례다 (`projectApi.ts`). 프레임을
 * 아예 못 쓰게 만드는 것은 `documentId` 가 없을 때뿐이다.
 */
function parseDocumentParseStatus(data: unknown): DocumentParseStatusEvent | null {
  const record = asRecord(data)
  if (record === null) return null

  const documentId = asNullableString(record.documentId)
  if (documentId === null) return null

  return {
    documentId,
    parseStatus: isOneOf(record.parseStatus, PARSE_STATUSES) ? record.parseStatus : 'PENDING',
    stale: record.stale === true,
  }
}

/**
 * `event: snapshot` — 구독 직후 정확히 한 번 오고, 그 프로젝트 문서 전부의
 * 지금 상태를 싣는다. 추출은 서버에서 fire-and-forget 이라 화면이 붙기 전에
 * 이미 끝났을 수 있는데, 화면이 그 사실을 따라잡는 자리가 여기다.
 */
export function parseDocumentSnapshotEvent(data: string): DocumentParseStatusEvent[] | null {
  try {
    const record = asRecord(JSON.parse(data))
    const rawDocuments = record !== null && Array.isArray(record.documents) ? record.documents : null
    if (rawDocuments === null) return null

    return rawDocuments
      .map(parseDocumentParseStatus)
      .filter((document): document is DocumentParseStatusEvent => document !== null)
  } catch {
    return null
  }
}

/** `event: document` — `parse_status` 가 바뀔 때마다, 문서 하나에 대해 온다. */
export function parseDocumentStatusEvent(data: string): DocumentParseStatusEvent | null {
  try {
    const record = asRecord(JSON.parse(data))
    return parseDocumentParseStatus(record?.document)
  } catch {
    return null
  }
}
