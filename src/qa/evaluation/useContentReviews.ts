import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { contentReviews, type ContentReview } from './evaluationApi'

type Result = { key: string; rows: ContentReview[]; failed: boolean }

export function useContentReviews(projectId: string, testCaseId?: string) {
  const key = `${projectId}:${testCaseId ?? ''}`
  const [result, setResult] = useState<Result | null>(null)
  const sequence = useRef(0)
  const invalidate = useCallback(() => { sequence.current++ }, [])
  const reload = useCallback((signal?: AbortSignal) => {
    const current = ++sequence.current
    void contentReviews(projectId, testCaseId, signal).then(rows => {
      if (!signal?.aborted && current === sequence.current) setResult({ key, rows, failed: false })
    }).catch(() => {
      if (!signal?.aborted && current === sequence.current) setResult({ key, rows: [], failed: true })
    })
  }, [projectId, testCaseId, key])
  useEffect(() => {
    const controller = new AbortController()
    reload(controller.signal)
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === projectId) reload(controller.signal) }
    window.addEventListener('artel:case-content-review', changed)
    return () => { controller.abort(); invalidate(); window.removeEventListener('artel:case-content-review', changed) }
  }, [reload, projectId, invalidate])
  useProjectChange(projectId, ['TEST_CASES', 'QA_RUNS'], () => reload())
  const current = result?.key === key ? result : null
  return { rows: current?.rows ?? [], status: !current ? 'loading' as const : current.failed ? 'failed' as const : 'ready' as const, reload }
}
