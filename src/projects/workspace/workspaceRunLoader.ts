import type { TestCaseCoverage } from '../../testCases/testCaseTypes'
import type { TestRun } from '../../testRuns/testRunApi'

export type WorkspaceRunData = { runs: TestRun[]; coverage: TestCaseCoverage }

/** 최초 조회와 SSE 재조회가 겹쳐도 마지막 요청만 공용 상태에 반영한다. */
export function createWorkspaceRunLoader(
  read: (signal: AbortSignal) => Promise<WorkspaceRunData>,
  apply: (data: WorkspaceRunData) => void,
) {
  let active: { controller: AbortController; promise: Promise<void> } | null = null
  return {
    refresh(): Promise<void> {
      active?.controller.abort()
      const request = { controller: new AbortController(), promise: Promise.resolve() }
      active = request
      request.promise = Promise.resolve().then(() => read(request.controller.signal)).then(
        (data) => {
          if (active !== request) return active?.promise
          apply(data)
        },
        (error: unknown) => {
          if (active !== request) return active?.promise
          throw error
        },
      )
      return request.promise
    },
    cancel() {
      active?.controller.abort()
      active = null
    },
  }
}
