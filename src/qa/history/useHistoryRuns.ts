import { useEffect, useState } from 'react'
import { listProjectQaRuns, type QaRunSummary } from '../launch/qaLaunchApi'
import { RUNS_PER_TEST_RUN } from './historyModel'

export type TestRunHistory =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; runs: QaRunSummary[]; complete: boolean }

/**
 * 테스트 런마다의 실행 목록(ARTEL-1100). 화면에 보이는 카드의 런만, 처음 보일 때 한 번 읽는다 —
 * 버전을 오가도 이미 읽은 런은 다시 부르지 않는다.
 *
 * 한 런에서 [RUNS_PER_TEST_RUN] 개를 다 채워 받았으면 더 있을 수 있으니 `complete` 가 false 다.
 * 회차는 그때 세지 않는다(`runOrdinals`).
 */
export function useHistoryRuns(projectId: string, testRunIds: readonly string[], reloadToken: number) {
  const [loaded, setLoaded] = useState<{ key: string; byRun: ReadonlyMap<string, TestRunHistory> }>({
    key: '',
    byRun: new Map(),
  })
  const cacheKey = `${projectId}#${reloadToken}`
  const byRun = loaded.key === cacheKey ? loaded.byRun : new Map<string, TestRunHistory>()
  const missing = testRunIds.filter((id) => !byRun.has(id)).join(',')

  useEffect(() => {
    if (missing === '') return undefined
    const controller = new AbortController()
    for (const testRunId of missing.split(',')) {
      listProjectQaRuns(projectId, RUNS_PER_TEST_RUN, controller.signal, testRunId)
        .then((runs) => store(testRunId, { status: 'ready', runs, complete: runs.length < RUNS_PER_TEST_RUN }))
        .catch(() => {
          // 취소는 오류가 아니다. 앞 런의 결과가 와서 남은 목록이 바뀌면 이 묶음을 취소하고 다시
          // 보내는데, 취소된 요청이 `AbortError` 가 아닌 모양으로 올라올 때가 있어 오류 종류가 아니라
          // "내가 취소했나" 로 가른다 — 그러지 않으면 아직 읽는 중인 카드가 실패로 굳는다.
          if (controller.signal.aborted) return
          store(testRunId, { status: 'error' })
        })
    }

    function store(testRunId: string, value: TestRunHistory) {
      setLoaded((current) => {
        const next = new Map(current.key === cacheKey ? current.byRun : [])
        next.set(testRunId, value)
        return { key: cacheKey, byRun: next }
      })
    }
    return () => controller.abort()
  }, [projectId, missing, cacheKey])

  return (testRunId: string): TestRunHistory => byRun.get(testRunId) ?? { status: 'loading' }
}
