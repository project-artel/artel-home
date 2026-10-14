import { useCallback, useEffect, useRef, useState } from 'react'
import { listTestCaseFolders, type TestCaseFolder } from './testCaseFolderApi'

export type TestCaseFoldersStatus = 'loading' | 'ready' | 'failed'

export type TestCaseFolders = {
  folders: TestCaseFolder[]
  status: TestCaseFoldersStatus
  reload: () => void
  /** tree 를 `loading` 으로 돌리지 않고 다시 읽는다. 실패하면 지금 목록을 둔다. */
  refresh: () => void
  /** 서버가 돌려준 폴더를 그 자리에 끼운다(없으면 더한다). 다시 읽기가 오기 전에도 tree 가 맞는다. */
  applyUpserted: (folder: TestCaseFolder) => void
}

type LoadedFolders = {
  folders: TestCaseFolder[]
  failed: boolean
  /** `useTestCaseLibrary` 의 `source` 와 같은 용도: 지금 읽을 것과 다르면 아직 답이 오지 않은 것이다. */
  source: string | null
}

const NOTHING_LOADED: LoadedFolders = { folders: [], failed: false, source: null }

/**
 * 프로젝트의 폴더 전량. 폴더는 test case 보다 훨씬 적어 한 번에 읽는다.
 * 읽기에 실패하면 test case 목록은 그대로 그리고, 폴더 tree 자리만 오류를 말한다.
 *
 * [gameBuildId] 를 주면 폴더마다 그 버전에서 보이는 항목 수를 함께 읽는다(ARTEL-1024). 버전을 바꿔도 tree 를
 * `loading` 으로 돌리지 않는다 — 수만 바뀌는데 tree 가 깜박이면 고른 폴더가 잠깐 풀린다.
 */
export function useTestCaseFolders(projectId: string, gameBuildId: string | null = null): TestCaseFolders {
  const [loaded, setLoaded] = useState<LoadedFolders>(NOTHING_LOADED)
  const [reloadToken, setReloadToken] = useState(0)
  const source = `${projectId}#${reloadToken}`

  useEffect(() => {
    const controller = new AbortController()

    listTestCaseFolders(projectId, controller.signal, gameBuildId)
      .then((folders) => setLoaded({ folders, failed: false, source }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setLoaded({ folders: [], failed: true, source })
      })

    return () => controller.abort()
  }, [projectId, source, gameBuildId])

  // 다시 읽기가 겹칠 때 먼저 보낸 느린 답이 나중 답을 덮지 않게 번호를 매긴다.
  const latestRefresh = useRef(0)

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const applyUpserted = useCallback((folder: TestCaseFolder) => {
    setLoaded((current) => ({
      ...current,
      folders: current.folders.some((one) => one.id === folder.id)
        ? current.folders.map((one) => (one.id === folder.id ? folder : one))
        : [...current.folders, folder],
    }))
  }, [])

  const refresh = useCallback(() => {
    const ticket = ++latestRefresh.current
    listTestCaseFolders(projectId, undefined, gameBuildId)
      .then((folders) => {
        if (ticket !== latestRefresh.current) return
        setLoaded((current) =>
          current.source === source ? { folders, failed: false, source } : current,
        )
      })
      .catch(() => {
        // 지금 tree 는 직전 읽기의 값이다. 다시 읽기가 실패했다고 tree 를 오류로 바꾸지 않는다.
      })
  }, [projectId, source, gameBuildId])

  const status: TestCaseFoldersStatus =
    loaded.source !== source ? 'loading' : loaded.failed ? 'failed' : 'ready'

  return { folders: loaded.folders, status, reload, refresh, applyUpserted }
}
