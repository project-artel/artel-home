import { useEffect, useRef, useState } from 'react'
import { addCasesToVersion } from '../../testCases/testCaseVersions'
import { MAX_BULK_SELECTION } from '../../testCases/testCaseTypes'
import { getRunCasesOutsideBuild, type RunCasesOutsideBuild } from '../../testRuns/testRunApi'

export function useRunVersionCases(projectId: string, runId: string, instanceId: string, buildKey: string) {
  const key = JSON.stringify([projectId, runId, instanceId, buildKey])
  const [loaded, setLoaded] = useState<{ key: string; outside: RunCasesOutsideBuild } | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const adding = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    generation.current += 1
    if (!runId || !instanceId) return
    const controller = new AbortController()
    getRunCasesOutsideBuild(projectId, runId, instanceId, controller.signal)
      .then((outside) => {
        if (controller.signal.aborted) return
        setLoaded({ key, outside })
        setFailedKey(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedKey(key)
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [projectId, runId, instanceId, key, revision])

  const outside = loaded?.key === key ? loaded.outside : null

  async function addAll() {
    if (adding.current || outside?.gameBuildId == null) return
    adding.current = true
    setPending(true)
    setFailedKey(null)
    const startedGeneration = generation.current
    try {
      // 클릭 직전에 다시 읽어 게임 버전이 바뀌었으면 추가 대상부터 갱신한다.
      const fresh = await getRunCasesOutsideBuild(projectId, runId, instanceId)
      if (generation.current !== startedGeneration) return
      if (fresh.gameBuildId !== outside.gameBuildId) {
        setLoaded({ key, outside: fresh })
        return
      }
      if (fresh.gameBuildId !== null && fresh.testCaseIds.length > 0) {
        for (let offset = 0; offset < fresh.testCaseIds.length; offset += MAX_BULK_SELECTION) {
          if (generation.current !== startedGeneration) return
          await addCasesToVersion(projectId, fresh.gameBuildId, fresh.testCaseIds.slice(offset, offset + MAX_BULK_SELECTION), true)
        }
      }
      const remaining = await getRunCasesOutsideBuild(projectId, runId, instanceId)
      if (generation.current !== startedGeneration) return
      setLoaded({ key, outside: remaining })
      if (remaining.testCaseIds.length > 0) setFailedKey(key)
    } catch {
      if (generation.current === startedGeneration) setFailedKey(key)
    } finally {
      adding.current = false
      setPending(false)
    }
  }

  return { outside, pending, failed: failedKey === key, addAll, retry: () => setRevision((value) => value + 1) }
}
