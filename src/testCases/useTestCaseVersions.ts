import { useCallback, useEffect, useState } from 'react'
import {
  listTestCaseVersions,
  listVersionCases,
  type VersionCaseRow,
  type VersionLibrary,
} from './testCaseVersions'

export type VersionsStatus = 'loading' | 'ready' | 'failed'

const EMPTY_LIBRARY: VersionLibrary = { versions: [], groups: [], unversionedTotal: 0 }

/**
 * 프로젝트의 버전 목록(ARTEL-1022)과 버전 묶음 · "버전 없음" 수(ARTEL-1024). 버전이 없는 프로젝트는 빈 목록이고,
 * 라이브러리는 예전처럼 정체 목록을 그린다.
 */
export function useTestCaseVersionList(projectId: string) {
  const [library, setLibrary] = useState<VersionLibrary>(EMPTY_LIBRARY)
  const [status, setStatus] = useState<VersionsStatus>('loading')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    listTestCaseVersions(projectId, controller.signal)
      .then((loaded) => {
        setLibrary(loaded)
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setStatus('failed')
      })
    return () => controller.abort()
  }, [projectId, reloadKey])

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])
  return { ...library, status, refresh }
}

/** 고른 버전의 케이스 표. [gameBuildId] 가 null 이면 아무것도 읽지 않는다. */
export function useVersionCases(projectId: string, gameBuildId: string | null, compareTo: string | null) {
  const [rows, setRows] = useState<VersionCaseRow[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const key = gameBuildId === null ? null : `${gameBuildId}:${compareTo ?? ''}`

  useEffect(() => {
    if (gameBuildId === null) return undefined
    const controller = new AbortController()
    listVersionCases(projectId, gameBuildId, compareTo, controller.signal)
      .then((items) => {
        setRows(items)
        setLoadedKey(`${gameBuildId}:${compareTo ?? ''}`)
        setFailed(false)
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setFailed(true)
      })
    return () => controller.abort()
  }, [projectId, gameBuildId, compareTo, reloadKey])

  const refresh = useCallback(() => setReloadKey((value) => value + 1), [])
  // 다른 버전으로 넘어간 직후에는 앞 버전의 줄을 보이지 않는다.
  const ready = key !== null && loadedKey === key
  // 한 번이라도 읽었으면 화면 전체를 다시 기다리게 하지 않는다. 버전을 바꿀 때 표 자리만 기다린다 — 화면 전체가
  // "불러오는 중" 으로 바뀌면 버전을 누를 때마다 페이지를 새로 여는 것처럼 보였다.
  const loadedOnce = loadedKey !== null
  return { rows: ready ? rows : [], ready, loadedOnce, failed, refresh }
}
