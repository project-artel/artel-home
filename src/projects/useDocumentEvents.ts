import { useEffect, useState } from 'react'
import {
  documentEventsUrl,
  parseDocumentSnapshotEvent,
  parseDocumentStatusEvent,
  type DocumentParseStatusEvent,
} from './documentEventsApi'

export type DocumentStreamState = 'connecting' | 'live' | 'degraded' | 'offline'

/**
 * 프로젝트의 문서 `parse_status` stream (`/api/projects/{projectId}/documents/events`,
 * ARTEL-760) 을 부른 쪽이 mount 되어 있는 동안 구독하고, unmount 되면 닫는다.
 *
 * 프로젝트 하나에 `EventSource` 하나뿐이다 — `documentEventsUrl` 은 문서 id 를
 * 싣지 않고, 이 hook 은 `projectId` 당 정확히 하나의 연결만 연다. `DocumentsSection`
 * 만이 이 hook 을 부르므로, 연결은 문서 목록 화면이 떠 있는 동안만 살고 프로젝트
 * workspace 전체의 수명을 따르지 않는다.
 *
 * `applyDocumentStatus` 는 안정된 참조여야 한다 (`useCallback` 으로 감싼다) —
 * effect 의 dependency 라서, 매 렌더 다른 참조가 오면 연결을 매번 다시 연다.
 */
export function useDocumentEvents(
  projectId: string,
  applyDocumentStatus: (update: DocumentParseStatusEvent) => void,
): DocumentStreamState {
  // 'connecting' 은 초기값 자체가 그 뜻이라, effect 본문에서 다시 세팅하지
  // 않는다 — `applyDocumentStatus` 는 늘 안정된 참조이고 `projectId` 는 이
  // 화면이 사는 동안 바뀌지 않으므로, 이 effect 는 mount 당 한 번만 돈다.
  const [streamState, setStreamState] = useState<DocumentStreamState>('connecting')

  useEffect(() => {
    const source = new EventSource(documentEventsUrl(projectId), { withCredentials: true })

    source.addEventListener('open', () => setStreamState('live'))

    source.addEventListener('snapshot', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const documents = parseDocumentSnapshotEvent(event.data)
      documents?.forEach(applyDocumentStatus)
    })

    source.addEventListener('document', (event: Event) => {
      if (!(event instanceof MessageEvent)) return
      const document = parseDocumentStatusEvent(event.data)
      if (document !== null) applyDocumentStatus(document)
    })

    // readyState CLOSED 면 끝난 것이다 (project 404, 또는 stream 도중 만료된 쿠키):
    // 브라우저가 스스로 재연결하지 않으므로, 오지 않을 재연결을 있는 척하지 않고
    // offline 으로 확정하는 유일한 경우다. 그 밖의 transport 오류는 브라우저의
    // 자동 재연결에 맡기고 degraded 만 세운다 — `useQaTry.ts` 와 같은 규칙이다.
    source.addEventListener('error', () => {
      setStreamState(source.readyState === EventSource.CLOSED ? 'offline' : 'degraded')
    })

    return () => {
      source.close()
    }
  }, [applyDocumentStatus, projectId])

  return streamState
}
