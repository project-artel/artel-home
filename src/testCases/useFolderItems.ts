import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectChange } from '../live/useProjectChange'
import { usePolling } from '../live/usePolling'
import { listFolderItems, type FolderItem } from './testCaseFolderApi'

/**
 * 고른 폴더의 항목을 고른 버전으로 푼 목록(ARTEL-1024). [folderId] 가 null 이면 아무것도 읽지 않는다.
 * 버전 없이(`null`) 읽으면 서버가 가장 최근 버전으로 푼다.
 *
 * 열려 있는 동안 프로젝트 변경 stream 이 `TEST_CASES` 를 알리면 다시 읽고, stream 이 끊긴 동안에는
 * polling 으로 다시 읽는다. 다시 읽는 중에는 지난 목록을 그대로 보이고, 다시 읽기가 실패해도
 * 지난 목록을 지우지 않는다. 요청이 끝나지 않았으면 다음 다시 읽기는 건너뛴다.
 */
export function useFolderItems(projectId: string, folderId: string | null, gameBuildId: string | null) {
  const [items, setItems] = useState<FolderItem[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const key = folderId === null ? null : `${folderId}:${gameBuildId ?? ''}`
  const loadedKeyRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (folderId === null) return undefined
    const controller = new AbortController()
    const requestKey = `${folderId}:${gameBuildId ?? ''}`
    inFlightRef.current = true
    listFolderItems(projectId, folderId, gameBuildId, controller.signal)
      .then((list) => {
        setItems(list.items)
        loadedKeyRef.current = requestKey
        setLoadedKey(requestKey)
        setFailed(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        // A failed poll keeps the rows already shown for this folder.
        if (loadedKeyRef.current === requestKey) return
        setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) inFlightRef.current = false
      })
    return () => {
      controller.abort()
      inFlightRef.current = false
    }
  }, [projectId, folderId, gameBuildId, reloadKey])

  const refresh = useCallback(() => setReloadKey((value) => value + 1), [])
  const refreshUnlessInFlight = () => {
    if (!inFlightRef.current) refresh()
  }
  const open = folderId !== null
  const live = useProjectChange(open ? projectId : null, 'TEST_CASES', refreshUnlessInFlight)
  usePolling(refreshUnlessInFlight, undefined, open && !live)
  // 다른 폴더로 넘어간 직후에는 앞 폴더의 줄을 보이지 않는다.
  const ready = key !== null && loadedKey === key
  return { items: ready ? items : [], ready, failed, refresh }
}
