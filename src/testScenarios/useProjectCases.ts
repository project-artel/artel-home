import { useEffect, useState } from 'react'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase } from '../testCases/testCaseTypes'
import { useCaseListRevision } from './caseListRevision'

export type ProjectCases = {
  gameBuildId?: string | null
  status: 'loading' | 'ready' | 'error'
  cases: TestCase[]
}

/**
 * The project's test cases, read once while `enabled`. A failed read leaves `status: 'error'`.
 * With `gameBuildId` they are that version's cases, in that version's content (ARTEL-1070) — a TR
 * screen passes its run's version.
 *
 * `invalidateCaseLists` makes it read again. The previous list stays on screen while that read
 * is in flight, so a refresh does not flash the loading state.
 */
export function useProjectCases(projectId: string, enabled = true, gameBuildId: string | null = null): ProjectCases {
  const key = `${projectId}:${gameBuildId ?? ''}`
  const revision = useCaseListRevision(projectId)
  const [loaded, setLoaded] = useState<{ key: string; result: ProjectCases } | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    const requested = `${projectId}:${gameBuildId ?? ''}`
    listTestCases(projectId, controller.signal, { gameBuildId })
      .then((cases) => setLoaded({ key: requested, result: { status: 'ready', cases } }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ key: requested, result: { status: 'error', cases: [] } })
      })
    return () => controller.abort()
  }, [projectId, enabled, gameBuildId, revision])

  return { ...(loaded !== null && loaded.key === key ? loaded.result : { status: 'loading' as const, cases: [] }), gameBuildId }
}
