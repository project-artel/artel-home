import { useEffect, useState } from 'react'
import { asRecord } from '../projects/projectApi'
import { generationEventsUrl, parseTestCaseGeneration, type TestCaseGeneration } from './testCaseGeneration'

/**
 * 한 빌드의 지도 TC 생성 진행(ARTEL-1188). [buildId] 가 null 이면 붙지 않는다.
 *
 * 화면 지도와 같은 SSE 에서 `snapshot` 과 `testCaseGeneration` 만 읽는다. `useContentMapEvents` 를 쓰지 않는 이유는 그
 * 훅이 스캔 · 문서 적재 상태까지 들고 있어서다. 생성 창은 진행 하나만 필요하다.
 */
export function useTestCaseGeneration(projectId: string, buildId: string | null): TestCaseGeneration | null {
  const [generation, setGeneration] = useState<{ buildId: string; value: TestCaseGeneration | null } | null>(null)

  useEffect(() => {
    if (buildId === null) return
    const source = new EventSource(generationEventsUrl(projectId, buildId), { withCredentials: true })
    const read = (event: Event) => {
      try {
        const record = asRecord(JSON.parse((event as MessageEvent<string>).data))
        if (record === null) return
        setGeneration({ buildId, value: parseTestCaseGeneration(record.testCaseGeneration) })
      } catch {
        // 깨진 프레임은 버린다. 마지막으로 안 상태를 지우지 않는다.
      }
    }
    source.addEventListener('snapshot', read)
    source.addEventListener('testCaseGeneration', read)
    return () => source.close()
  }, [projectId, buildId])

  return generation !== null && generation.buildId === buildId ? generation.value : null
}
