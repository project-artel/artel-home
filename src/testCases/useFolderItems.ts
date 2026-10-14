import { useCallback, useEffect, useState } from 'react'
import { listFolderItems, type FolderItem } from './testCaseFolderApi'

/**
 * 고른 폴더의 항목을 고른 버전으로 푼 목록(ARTEL-1024). [folderId] 가 null 이면 아무것도 읽지 않는다.
 * 버전 없이(`null`) 읽으면 서버가 가장 최근 버전으로 푼다.
 */
export function useFolderItems(projectId: string, folderId: string | null, gameBuildId: string | null) {
  const [items, setItems] = useState<FolderItem[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const key = folderId === null ? null : `${folderId}:${gameBuildId ?? ''}`

  useEffect(() => {
    if (folderId === null) return undefined
    const controller = new AbortController()
    listFolderItems(projectId, folderId, gameBuildId, controller.signal)
      .then((list) => {
        setItems(list.items)
        setLoadedKey(`${folderId}:${gameBuildId ?? ''}`)
        setFailed(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setFailed(true)
      })
    return () => controller.abort()
  }, [projectId, folderId, gameBuildId, reloadKey])

  const refresh = useCallback(() => setReloadKey((value) => value + 1), [])
  // 다른 폴더로 넘어간 직후에는 앞 폴더의 줄을 보이지 않는다.
  const ready = key !== null && loadedKey === key
  return { items: ready ? items : [], ready, failed, refresh }
}
