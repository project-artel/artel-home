import { useCallback, useState } from 'react'

/**
 * 즐겨찾기한 프로젝트 id(ARTEL-1208). 서버에 칸이 없어 이 브라우저에 계정별로 둔다. 다른 기기로는 따라가지 않는다.
 * 저장소를 쓸 수 없는 창(사생활 보호 등)에서는 이번 방문 동안만 기억한다.
 */
export function useFavoriteProjects(userId: string | null) {
  const key = userId === null ? null : `artel.favoriteProjects.${userId}`
  const [state, setState] = useState<{ key: string | null; ids: ReadonlySet<string> }>(() => ({ key, ids: read(key) }))
  // 계정이 바뀌면 그 계정의 목록을 다시 읽는다.
  const ids = state.key === key ? state.ids : read(key)
  if (state.key !== key) setState({ key, ids })

  const toggle = useCallback(
    (projectId: string) => {
      setState((current) => {
        const next = new Set(current.ids)
        if (next.has(projectId)) next.delete(projectId)
        else next.add(projectId)
        write(current.key, next)
        return { key: current.key, ids: next }
      })
    },
    [],
  )

  return { favorites: ids, toggle }
}

function read(key: string | null): ReadonlySet<string> {
  if (key === null) return new Set()
  try {
    const raw = window.localStorage.getItem(key)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((one): one is string => typeof one === 'string') : [])
  } catch {
    return new Set()
  }
}

function write(key: string | null, ids: ReadonlySet<string>) {
  if (key === null) return
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]))
  } catch {
    // 저장하지 못해도 이번 방문 동안은 화면에 남는다.
  }
}
