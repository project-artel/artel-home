import { useEffect, useState } from 'react'
import {
  contentMapEventsUrl,
  parseContentMapDocumentFrame,
  parseContentMapIngestEvent,
  parseContentMapScanEvent,
  parseContentMapSnapshotEvent,
} from './contentMapApi'
import type {
  ContentMapDocumentEvent,
  ContentMapStreamState,
  IngestProgress,
  LastScan,
} from './contentMapTypes'

export type ContentMapEventsState = {
  streamState: ContentMapStreamState
  /**
   * `undefined` — 이 빌드 구독의 첫 `snapshot` 을 아직 못 받았다(연결하는 중).
   * `null` — 스냅샷은 받았는데 이 서버는 이 빌드의 스캔을 모른다(재시작).
   * `LastScan` — 아는 스캔이 있다.
   */
  scan: LastScan | null | undefined
  /** `undefined` — 첫 `snapshot` 을 아직 못 받았다. `ingest` 자체는 정상적으로 `null` 일 수 없다 — 문서가 0개여도 세 수는 0으로 존재한다. */
  ingest: IngestProgress | undefined
  documents: Map<string, ContentMapDocumentEvent>
}

/**
 * 한 빌드의 스캔 상태와 문서 적재 진행. `.../content-map/events` 를 구독해서 받는다.
 *
 * `useQaTry.ts:122-167` 의 SSE effect 를 본떴다. 다만 이 훅은 `ARTEL-761` 이
 * `src/projects/**`에 만드는 SSE 훅과 아무것도 공유하지 않는다 — 같은 선례를
 * 각자 본뜨는 것과, 한 helper 를 같이 쓰는 것은 다르다. 후자는 두 트랙이
 * 동시에 건드리는 파일 하나를 만든다.
 *
 * **화면이 마운트돼 있는 동안 계속 붙어 있는다.** 이 stream 은 화면 단위
 * 구독이지 스캔 하나의 작업 단위가 아니다 — 서버도 스캔이 끝났다고 먼저
 * 끊지 않는다(`contract-contentmap.md` `## 4`). 그래서 스캔 상태와 무관하게
 * `projectId`·`buildId` 가 바뀌지 않는 한 계속 구독하고, 언마운트에서만
 * `source.close()` 한다.
 */
export function useContentMapEvents(projectId: string, buildId: string): ContentMapEventsState {
  const [streamState, setStreamState] = useState<ContentMapStreamState>('connecting')
  const [scan, setScan] = useState<LastScan | null | undefined>(undefined)
  const [ingest, setIngest] = useState<IngestProgress | undefined>(undefined)
  const [documents, setDocuments] = useState<Map<string, ContentMapDocumentEvent>>(new Map())

  // `projectId`·`buildId` 가 바뀌어도 위 useState 초기값을 다시 쓰지 않는다 —
  // effect 안에서 곧바로 setState 를 부르면 렌더가 한 번 더 도는데(react-hooks
  // `set-state-in-effect`), 이 훅의 유일한 호출부인 `ContentMapSection.tsx` 가
  // `key={selectedBuild.id}` 로 빌드마다 통째로 다시 마운트하므로 이 effect 는
  // 실전에서 같은 마운트 안에서 다시 돌지 않는다. `useQaTry.ts` 의 stream
  // effect 도 재실행에서 이전 로그를 지우지 않는 것과 같은 판단이다.
  useEffect(() => {
    const source = new EventSource(contentMapEventsUrl(projectId, buildId), {
      withCredentials: true,
    })

    source.addEventListener('open', () => setStreamState('live'))

    source.addEventListener('snapshot', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const frame = parseContentMapSnapshotEvent(event.data)
      if (frame === null) return
      setScan(frame.scan)
      // 스냅샷의 `ingest` 가 깨져 왔으면(malformed) 없는 값을 지어내지 않고
      // "아직 모른다"로 남긴다 — 0으로 채우면 실제로는 모르는 것을 "받은
      // 문서가 없다"로 잘못 말하게 된다.
      if (frame.ingest !== null) setIngest(frame.ingest)
      setDocuments(new Map(frame.documents.map((document) => [document.documentId, document])))
    })

    source.addEventListener('scan', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const frame = parseContentMapScanEvent(event.data)
      if (frame === null) return
      setScan(frame.scan)
    })

    source.addEventListener('ingest', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const frame = parseContentMapIngestEvent(event.data)
      if (frame === null) return
      setIngest(frame.ingest)
    })

    source.addEventListener('document', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const frame = parseContentMapDocumentFrame(event.data)
      if (frame === null) return
      setDocuments((current) => {
        const next = new Map(current)
        next.set(frame.document.documentId, frame.document)
        return next
      })
    })

    source.addEventListener('error', () => {
      // readyState CLOSED = terminal(404, 또는 stream 도중 cookie 가 만료된 401):
      // 브라우저가 다시 붙지 않으므로 "영원히 연결 중"이 아니라 offline 으로
      // 확정한다. useQaTry.ts:156-162 와 같은 판단이다.
      setStreamState(source.readyState === EventSource.CLOSED ? 'offline' : 'degraded')
    })

    return () => {
      source.close()
    }
  }, [projectId, buildId])

  return { streamState, scan, ingest, documents }
}
