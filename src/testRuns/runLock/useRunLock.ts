import { useCallback, useEffect, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { getRunLock, UNLOCKED, type RunLock } from './runLockApi'

/**
 * 런의 Artel Bot 잠금(ARTEL-1265). 처음 한 번 읽고, 프로젝트 변경 stream 이 `RUN_LOCKS` 를 알리면 다시 읽는다.
 * 런이 없으면(TS 를 런 밖에서 연 편집 화면) 늘 풀려 있다.
 */
export function useRunLock(projectId: string, runId: string | null): RunLock {
  const [lock, setLock] = useState<RunLock>(UNLOCKED)
  const read = useCallback((signal?: AbortSignal) => {
    if (runId === null) return Promise.resolve()
    return getRunLock(projectId, runId, signal).then(setLock, () => undefined)
  }, [projectId, runId])
  useEffect(() => {
    const controller = new AbortController()
    void read(controller.signal)
    return () => controller.abort()
  }, [read])
  useProjectChange(projectId, 'RUN_LOCKS', () => void read())
  return runId === null ? UNLOCKED : lock
}
