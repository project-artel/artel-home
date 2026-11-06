import { useEffect, useState } from 'react'
import { getKnowledgeGraph } from '../knowledge/knowledgeApi'
import { KNOWLEDGE_NODE_LIMIT, type KnowledgeNode } from '../knowledge/knowledgeTypes'
import { documentKnowledge } from './documentKnowledge'
import type { ProjectDocument } from './projectTypes'

export type DocumentKnowledgeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: KnowledgeNode[]; truncated: boolean }

type Loaded = { source: string; state: DocumentKnowledgeState }

/**
 * 현재 버전에서 추출된 knowledge(ARTEL-1098). 추출이 끝난(`EXTRACTED`) 버전만 읽는다 — 그 전에는
 * 읽어도 그 버전의 항목이 아직 없다.
 *
 * 다시 읽는 때는 "어느 버전의 어느 상태" 가 바뀔 때다. SSE 가 `EXTRACTING → EXTRACTED` 를 알리면
 * 키가 바뀌어 그때 한 번 읽는다. `useKnowledgeGraph` 처럼 키를 state 에 함께 들어, 앞 키의 결과가
 * 남아 있으면 그것을 읽는 중으로 본다.
 */
export function useDocumentKnowledge(projectId: string, document: ProjectDocument | undefined): DocumentKnowledgeState {
  const readable = document !== undefined && document.parseStatus === 'EXTRACTED'
  const source = readable ? `${projectId}#${document.id}#${document.parseStatus}` : ''
  const fileName = document?.fileName ?? ''
  const uploadedAt = document?.uploadedAt ?? ''
  const [loaded, setLoaded] = useState<Loaded>({ source: '', state: { status: 'idle' } })

  useEffect(() => {
    if (!readable) return
    const controller = new AbortController()
    getKnowledgeGraph(projectId, KNOWLEDGE_NODE_LIMIT, controller.signal)
      .then((graph) =>
        setLoaded({
          source,
          state: { status: 'ready', items: documentKnowledge(graph, { fileName, uploadedAt }) ?? [], truncated: graph.truncated },
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ source, state: { status: 'error' } })
      })
    return () => controller.abort()
  }, [projectId, readable, source, fileName, uploadedAt])

  if (!readable) return { status: 'idle' }
  return loaded.source === source ? loaded.state : { status: 'loading' }
}
