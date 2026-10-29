import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { getRunLocks, type ScenarioLock } from './runLockApi'

const NONE: ScenarioLock[] = []

/**
 * 런에서 Artel Bot 이 고치는 중이라 잠긴 시나리오들(ARTEL-1265). 처음 한 번 읽고, 프로젝트 변경 stream 이
 * `RUN_LOCKS` 를 알리면 다시 읽는다. 런이 없으면(TS 를 런 밖에서 연 편집 화면) 잠긴 것이 없다.
 *
 * @return 시나리오 id → 잠금
 */
export function useRunLocks(projectId: string, runId: string | null): ReadonlyMap<string, ScenarioLock> {
  const [locks, setLocks] = useState<ScenarioLock[]>(NONE)
  const read = useCallback((signal?: AbortSignal) => {
    if (runId === null) return Promise.resolve()
    return getRunLocks(projectId, runId, signal).then(setLocks, () => undefined)
  }, [projectId, runId])
  useEffect(() => {
    const controller = new AbortController()
    void read(controller.signal)
    return () => controller.abort()
  }, [read])
  useProjectChange(projectId, 'RUN_LOCKS', () => void read())
  const shown = runId === null ? NONE : locks
  return useMemo(() => new Map(shown.map((lock) => [lock.scenarioId, lock])), [shown])
}
