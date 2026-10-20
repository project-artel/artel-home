import { useEffect, useState } from 'react'
import { listTestCases } from '../testCases/testCaseApi'
import type { TestCase } from '../testCases/testCaseTypes'
import { listVersionCases } from '../testCases/testCaseVersions'

/**
 * 런이 보는 TC 의 id → TC. 화면이 열릴 때 한 번 읽는다 — 스텝마다 따로 부르면 TC 수만큼 요청이 나간다.
 * 편집기의 씬 · 판정 칸, 아래 칸의 사전조건 · 기대 결과, TC 연결 창, 스튜디오의 ⌘K TC 명세 창이 모두 이것을 읽는다.
 * 못 읽으면 비어 있다.
 *
 * 빌드 버전이 있으면 그 버전에 든 TC 와 **그 버전의 판정**이다(ARTEL-1115). 프로젝트 전량의 판정은 다른 버전에서
 * 나온 것일 수 있다. 버전이 없으면 프로젝트의 TC 다.
 */
export function useRunCases(projectId: string, gameBuildId: string | null): ReadonlyMap<string, TestCase> {
  const [loaded, setLoaded] = useState<{ key: string; cases: ReadonlyMap<string, TestCase> }>({ key: '', cases: new Map() })
  const key = `${projectId}#${gameBuildId ?? ''}`
  useEffect(() => {
    const controller = new AbortController()
    const request = gameBuildId === null
      ? listTestCases(projectId, controller.signal)
      : listVersionCases(projectId, gameBuildId, null, controller.signal).then((rows) =>
          rows
            .filter((row) => row.presence !== 'ONLY_OTHER')
            .map((row) => ({ ...row.testCase, verificationStatus: row.verificationStatus ?? row.testCase.verificationStatus })),
        )
    request
      .then((list) => setLoaded({ key, cases: new Map(list.map((testCase) => [testCase.id, testCase])) }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, gameBuildId, key])
  // 버전이 바뀐 사이에는 앞 버전의 TC 를 보이지 않는다 — 연결 창이 다른 버전의 TC 를 내밀게 된다.
  return loaded.key === key ? loaded.cases : EMPTY_CASES
}

const EMPTY_CASES: ReadonlyMap<string, TestCase> = new Map()
