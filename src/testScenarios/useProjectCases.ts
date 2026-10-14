import { useEffect, useState } from 'react'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase } from '../testCases/testCaseTypes'

export type ProjectCases = {
  status: 'loading' | 'ready' | 'error'
  cases: TestCase[]
}

/** The project's test cases, read once while `enabled`. A failed read leaves `status: 'error'`. */
export function useProjectCases(projectId: string, enabled = true): ProjectCases {
  const [loaded, setLoaded] = useState<{ projectId: string; result: ProjectCases } | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    listTestCases(projectId, controller.signal)
      .then((cases) => setLoaded({ projectId, result: { status: 'ready', cases } }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ projectId, result: { status: 'error', cases: [] } })
      })
    return () => controller.abort()
  }, [projectId, enabled])

  return loaded !== null && loaded.projectId === projectId ? loaded.result : { status: 'loading', cases: [] }
}
