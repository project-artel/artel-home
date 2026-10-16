import { useEffect, useState } from 'react'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase } from '../testCases/testCaseTypes'

export type ProjectCases = {
  status: 'loading' | 'ready' | 'error'
  cases: TestCase[]
}

/**
 * The project's test cases, read once while `enabled`. A failed read leaves `status: 'error'`.
 * With `gameBuildId` they are that version's cases, in that version's content (ARTEL-1070) — a TR
 * screen passes its run's version.
 */
export function useProjectCases(projectId: string, enabled = true, gameBuildId: string | null = null): ProjectCases {
  const key = `${projectId}:${gameBuildId ?? ''}`
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
  }, [projectId, enabled, gameBuildId])

  return loaded !== null && loaded.key === key ? loaded.result : { status: 'loading', cases: [] }
}
