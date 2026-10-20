import { useEffect, useState } from 'react'
import { getQaRunVerdicts, type QaTryVerdicts } from '../qaVerdictApi'

/**
 * 실행 하나의 판정을 시나리오 실행(qa_try)별로 나눈 것(ARTEL-1135). 판정은 시나리오 단위로 보지만 API 는 실행
 * 단위라, 한 번만 불러 나눠 준다 — 시나리오마다 부르면 같은 응답을 시나리오 수만큼 받는다.
 *
 * `null` 은 아직 모른다는 뜻이다. 불러오지 못했으면 빈 지도다 — 근거 칸이 안 보일 뿐 히스토리는 그대로 쓴다.
 */
export function useRunVerdicts(qaRunId: string): ReadonlyMap<string, QaTryVerdicts> | null {
  const [loaded, setLoaded] = useState<{ qaRunId: string; byTry: ReadonlyMap<string, QaTryVerdicts> } | null>(null)

  useEffect(() => {
    if (qaRunId === '') return undefined
    const controller = new AbortController()
    getQaRunVerdicts(qaRunId, controller.signal)
      .then((result) =>
        setLoaded({ qaRunId, byTry: new Map((result?.tries ?? []).map((qaTry) => [qaTry.qaTryId, qaTry])) }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ qaRunId, byTry: new Map() })
      })
    return () => controller.abort()
  }, [qaRunId])

  return loaded?.qaRunId === qaRunId ? loaded.byTry : null
}
