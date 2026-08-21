import { useCallback, useEffect, useState } from 'react'
import { getContentMap } from './contentMapApi'
import type { ContentMapView } from './contentMapTypes'

export type ContentMapStatus = 'loading' | 'ready' | 'error'

type LoadedState = {
  status: Exclude<ContentMapStatus, 'loading'>
  view: ContentMapView | null
  /** 언제 읽어 온 값인지. 연결이 끊겼을 때 화면이 이 시각을 인용한다. */
  fetchedAt: number
  /**
   * 어떤 요청이 만든 상태인지. 지금 것이 아니면 이전 빌드나 이전 새로고침의
   * 것이므로, `loading` 을 이펙트에서 쓰지 않고 렌더 중에 유도할 수 있다 —
   * 이펙트에서 쓰면 로드마다 렌더가 한 번씩 더 돈다.
   */
  source: string
}

/** 실제 요청은 이 값을 만들 수 없다. 그래서 첫 렌더가 loading 으로 읽힌다. */
const initialState: LoadedState = { status: 'ready', view: null, fetchedAt: 0, source: '' }

/**
 * 한 빌드의 콘텐츠 맵.
 *
 * `reload` 는 토큰을 올릴 뿐 fetch 를 직접 부르지 않는다. 재시도와 새로고침이
 * 첫 로드와 같은 경로를 타야 둘이 서로 어긋나지 않는다.
 *
 * `online` 은 브라우저가 말하는 네트워크 상태다. 끊긴 동안에도 마지막으로
 * 읽은 맵은 화면에 남지만, 화면은 그것을 지금의 사실처럼 보여 주지 않는다 —
 * 마지막 프레임을 라이브인 척하지 않는다는 DESIGN.md 규칙이 여기에도 그대로
 * 적용된다.
 */
export function useContentMap(projectId: string, buildId: string) {
  const [reloadToken, setReloadToken] = useState(0)
  const [state, setState] = useState<LoadedState>(initialState)
  const [online, setOnline] = useState(() => navigator.onLine)
  const key = `${projectId}:${buildId}`
  const source = `${key}#${reloadToken}`

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    getContentMap(projectId, buildId, controller.signal)
      .then((view) => setState({ status: 'ready', view, fetchedAt: Date.now(), source }))
      .catch((error: unknown) => {
        // abort 는 이 이펙트가 교체됐다는 뜻이다. 더 새로운 요청이 상태를
        // 갖고 있으므로 여기서 에러를 쓰면 그 결과를 덮어쓰게 된다.
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState((previous) => {
          // 직전 스냅샷은 버리지 않는다 — 새로고침이 실패했다고 이미 읽어 둔
          // 맵을 지우면 사용자는 있던 정보까지 잃는다. 단, **같은 빌드의**
          // 스냅샷일 때만이다. 빌드를 옮기다 실패했는데 앞 빌드의 씬을 남기면
          // 이 빌드의 제목 아래에 다른 빌드의 콘텐츠 맵이 놓인다.
          const sameBuild = previous.source.startsWith(`${key}#`)
          return {
            status: 'error',
            view: sameBuild ? previous.view : null,
            fetchedAt: sameBuild ? previous.fetchedAt : 0,
            source,
          }
        })
      })

    return () => controller.abort()
  }, [buildId, key, projectId, source])

  const settled = state.source === source
  const sameBuild = state.source.startsWith(`${key}#`)
  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return {
    // 같은 빌드의 직전 스냅샷은 새로고침이 도는 동안에도 남긴다. 새로고침이
    // 화면을 한 줄짜리 로딩으로 바꾸면 읽던 자리를 잃고, 레이아웃이 통째로
    // 흔들린다. 반대로 다른 빌드로 옮길 때는 반드시 비운다 — 남기면 이 빌드
    // 제목 아래에 다른 빌드의 콘텐츠 맵이 놓인다.
    view: sameBuild ? state.view : null,
    fetchedAt: sameBuild ? state.fetchedAt : 0,
    status: settled ? state.status : ('loading' as ContentMapStatus),
    online,
    reload,
    /**
     * 새로고침이 몇 번째인지. 이 화면에는 콘텐츠 맵 말고도 다시 확인해야 하는
     * 것이 하나 더 있다 — 어떤 게임이 붙어 있는지. 그 값도 스냅샷이라
     * 새로고침 버튼이 둘 다 갱신하지 않으면 "붙어 있는 게임이 없습니다"가
     * 페이지를 통째로 다시 열기 전까지 영영 풀리지 않는다.
     */
    reloadToken,
  }
}
