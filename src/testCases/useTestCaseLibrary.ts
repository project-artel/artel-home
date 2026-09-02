import { useCallback, useEffect, useState } from 'react'
import { listTestCases } from './testCaseApi'
import type { TestCase } from './testCaseTypes'

export type TestCaseLibraryStatus = 'loading' | 'ready' | 'failed'

export type TestCaseLibrary = {
  cases: TestCase[]
  status: TestCaseLibraryStatus
  reload: () => void
  /** 서버가 돌려준 케이스로 같은 자리의 행을 갈아 끼운다. 목록 순서는 그대로 둔다. */
  applySaved: (saved: TestCase) => void
  applyCreated: (created: TestCase) => void
  removeCase: (caseId: string) => void
}

type LoadedCases = {
  cases: TestCase[]
  failed: boolean
  /**
   * 이 상태를 만든 읽기. 지금 읽어야 할 것과 다르면 아직 이번 읽기의 답이 오지 않은 것이고,
   * 그것이 곧 `loading` 이다. effect 안에서 상태를 `loading` 으로 되돌리지 않고 렌더에서
   * 판단하려고 두었다 — `useIssuePages` 가 `source` 로 하는 것과 같다.
   */
  source: string | null
}

const NOTHING_LOADED: LoadedCases = { cases: [], failed: false, source: null }

/**
 * 프로젝트의 케이스 전량을 한 번 읽고, 이후의 편집을 서버 응답으로 그 자리에 반영한다.
 *
 * 저장·생성·삭제마다 목록을 다시 읽지 않는 이유는 순서 때문이다. 다시 읽으면 서버의
 * `id DESC` 가 그대로 돌아오면서 사용자가 고른 정렬과 스크롤 위치가 함께 날아간다.
 * 세 endpoint 모두 저장된 케이스를 돌려주므로 그것으로 행 하나만 갈아 끼우면 된다.
 *
 * 이 화면 말고는 전량 목록을 읽는 곳이 없어 workspace 가 아니라 여기서 읽는다.
 */
export function useTestCaseLibrary(projectId: string): TestCaseLibrary {
  const [loaded, setLoaded] = useState<LoadedCases>(NOTHING_LOADED)
  const [reloadToken, setReloadToken] = useState(0)
  const source = `${projectId}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    listTestCases(projectId, controller.signal)
      .then((cases) => setLoaded({ cases, failed: false, source }))
      .catch((error: unknown) => {
        // 언마운트나 projectId 변경으로 끊은 요청은 실패가 아니다. 여기서 걸러 내지 않으면
        // 화면을 떠나는 순간 오류 문구가 한 번 그려진다.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ cases: [], failed: true, source })
      })

    return () => controller.abort()
  }, [projectId, source])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const applySaved = useCallback((saved: TestCase) => {
    setLoaded((current) => ({
      ...current,
      cases: current.cases.map((testCase) => (testCase.id === saved.id ? saved : testCase)),
    }))
  }, [])

  // 목록이 최근 것부터이므로 새 케이스는 맨 앞이다. 뒤에 붙이면 방금 만든 것을 찾으려고
  // 끝까지 스크롤해야 한다.
  const applyCreated = useCallback((created: TestCase) => {
    setLoaded((current) => ({ ...current, cases: [created, ...current.cases] }))
  }, [])

  const removeCase = useCallback((caseId: string) => {
    setLoaded((current) => ({
      ...current,
      cases: current.cases.filter((testCase) => testCase.id !== caseId),
    }))
  }, [])

  const status: TestCaseLibraryStatus =
    loaded.source !== source ? 'loading' : loaded.failed ? 'failed' : 'ready'

  return { cases: loaded.cases, status, reload, applySaved, applyCreated, removeCase }
}
