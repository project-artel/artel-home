import { useCallback, useEffect, useRef, useState } from 'react'
import { getKnowledgeItem } from './knowledgeApi'

export type KnowledgeItemBodyEntry =
  | { status: 'loading'; description: null }
  | { status: 'ready'; description: string }
  | { status: 'error'; description: null }

type SettledEntry = Extract<KnowledgeItemBodyEntry, { status: 'ready' | 'error' }>

/**
 * The body of one knowledge item, fetched through the single-item endpoint the
 * graph list deliberately omits it from (ARTEL-753).
 *
 * `cache` only ever holds a *settled* result — `'ready'` or `'error'`,
 * `'loading'` is never written to it. Loading is derived at render time as
 * "selected, but not yet in `cache`", the same idiom `useKnowledgeGraph.ts`
 * uses for its own loading state. That keeps every `setCache` call inside a
 * promise callback rather than the effect body itself, which is what this
 * repository's `react-hooks/set-state-in-effect` lint rule requires — two of
 * the baseline's nine pre-existing lint errors are exactly that rule fired on
 * a synchronous `setState('loading')` inside an effect, and this hook must not
 * add a third violation of it. The same applies to `react-hooks/refs`: the
 * in-flight registry below is a `ref` read only inside effects and callbacks,
 * never during render.
 *
 * Caching is keyed by item id and never evicted while this hook stays mounted,
 * so re-selecting an item already read never sends a second request. A stale
 * response cannot overwrite a newer selection either — not by comparing
 * request identities, but structurally: every response is written into its own
 * id's slot, and the render only ever reads the slot for `selectedId`, so a
 * late write to a different slot has nothing to overwrite.
 */
export function useKnowledgeItemBody(
  projectId: string,
  selectedId: string | null,
): { entry: KnowledgeItemBodyEntry | null; retry: () => void } {
  const [cache, setCache] = useState(() => new Map<string, SettledEntry>())
  // 진행 중인 요청의 등록부. 렌더에서는 절대 읽지 않는다 — effect 안에서 "이 id 를 이미
  // 요청했는가"를 판단하고 언마운트 때 정리하는 데만 쓴다.
  const inFlightRef = useRef(new Map<string, AbortController>())

  const load = useCallback(
    (id: string) => {
      // 재시도가 아직 끝나지 않은 같은 id 의 요청을 대체하는 경우.
      inFlightRef.current.get(id)?.abort()
      const controller = new AbortController()
      inFlightRef.current.set(id, controller)

      // 두 콜백 모두 "이 컨트롤러가 여전히 이 id 에 등록된 그 요청인가"로 스스로를 지킨다.
      // abort 된 요청뿐 아니라, abort 가 불리기 직전에 이미 정착해 버린 요청까지 같은 검사
      // 하나로 걸러진다 — 응답이 왔을 때 그 컨트롤러가 이미 다른 컨트롤러로 교체돼 있으면(재시도)
      // 또는 아예 지워져 있으면(언마운트) 오래된 응답으로 보고 버린다.
      getKnowledgeItem(projectId, id, controller.signal)
        .then((detail) => {
          if (inFlightRef.current.get(id) !== controller) return
          setCache((previous) => new Map(previous).set(id, { status: 'ready', description: detail.description }))
        })
        .catch(() => {
          if (inFlightRef.current.get(id) !== controller) return
          setCache((previous) => new Map(previous).set(id, { status: 'error', description: null }))
        })
        .finally(() => {
          if (inFlightRef.current.get(id) === controller) inFlightRef.current.delete(id)
        })
    },
    [projectId],
  )

  useEffect(() => {
    if (selectedId === null) return
    if (cache.has(selectedId) || inFlightRef.current.has(selectedId)) return
    load(selectedId)
  }, [selectedId, cache, load])

  // 이 hook 을 들고 있던 화면이 사라질 때, 아직 끝나지 않은 요청을 전부 끊는다. 선택이 바뀔
  // 때는 끊지 않는다 — 끊으면 그 id 로 나중에 되돌아와도 캐시가 "로딩 중"에서 못 벗어난다.
  useEffect(() => {
    // 클린업이 실제로 도는 시점엔 `inFlightRef.current` 가 이미 다른 값일 수 있으므로, 이
    // 렌더에서 본 등록부를 변수로 붙잡아 클린업에 넘긴다.
    const controllers = inFlightRef.current
    return () => {
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [])

  const retry = useCallback(() => {
    if (selectedId === null) return
    // 정착된(실패) 결과를 지워서 화면이 곧바로 "로딩"으로 도출되게 한 다음 다시 부른다. 이
    // 함수는 이벤트 핸들러 안에서만 불리므로 여기서 state setter 를 동기 호출해도 무방하다.
    setCache((previous) => {
      if (!previous.has(selectedId)) return previous
      const next = new Map(previous)
      next.delete(selectedId)
      return next
    })
    load(selectedId)
  }, [selectedId, load])

  const settled = selectedId === null ? undefined : cache.get(selectedId)
  const entry: KnowledgeItemBodyEntry | null =
    selectedId === null ? null : (settled ?? { status: 'loading', description: null })

  return { entry, retry }
}
