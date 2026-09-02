import { useEffect, useState } from 'react'
import { searchInvitationCandidates } from './memberApi'
import { INVITATION_CANDIDATE_QUERY_MIN_LENGTH, type InvitationCandidate } from './memberTypes'

const DEBOUNCE_MS = 250

type CandidateSearchState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  candidates: InvitationCandidate[]
}

/** `query` 가 두 글자 미만일 때 그리는 값. `query` 하나에서만 나오는 순수한 계산이라 state 도
 * effect 도 두지 않고 매 render 마다 다시 계산해 돌려준다. */
const idleState: CandidateSearchState = { status: 'idle', candidates: [] }

/**
 * 가장 최근에 응답이 돌아온 검색 하나. `query` 를 같이 들고 있는 이유는, `loading` 을 별도
 * state 로 두지 않기 위해서다 — effect 안에서 `setState({status:'loading', ...})` 를 곧바로
 * 부르면 "effect 가 그저 state 하나를 계산해 두는 것" 이 되어 React 가 권하지 않는 모양이 된다.
 * 대신 [fetchState.query] 가 지금 찾는 값과 다르면 그 자체로 loading 인 것이고, effect 는
 * `.then`/`.catch` 안에서만, 즉 실제로 응답이 왔을 때만 `setState` 를 부른다.
 */
type FetchState = {
  query: string
  status: 'ready' | 'error'
  candidates: InvitationCandidate[]
}

const initialFetchState: FetchState = { query: '', status: 'ready', candidates: [] }

/**
 * 초대 입력창 자동완성. 타이핑이 250ms 멎을 때까지 기다렸다가 딱 한 번 부른다 — keystroke 마다
 * 부르지 않는다. 두 글자 미만은 `idle` 로 그친다: 검색도, 요청도 하지 않는다.
 *
 * 두 글자 이상일 때만 effect 가 돈다. `query` 가 바뀔 때마다 새 effect 가 돈다 — 이전 effect 의
 * cleanup 이 그 effect 의 closure 안 `cancelled` 를 true 로 두므로, 늦게 돌아온 응답은 자기
 * 자신이 이미 지난 요청이라는 것을 알고 스스로 버린다. 응답이 보낸 순서와 다르게 도착해도(늦게
 * 보낸 요청이 먼저 답하는 경우) 마찬가지로 걸러진다 — 이 판정은 요청이 몇 번째인지 세는 값이 아니라
 * "그 사이 이 effect 가 살아 있었는가" 하나로만 이뤄지기 때문이다. 컴포넌트가 대기 중에 unmount
 * 될 때도 같은 cleanup 이 돌아서, 이미 사라진 화면에 state 를 쓰는 일이 없다.
 * `AbortController.abort()` 도 같이 부르지만 그것만으로는 충분하지 않다고 본다 — abort 가 네트워크
 * 요청을 실제로 끊는지는 fetch 구현에 달려 있고, 이미 응답이 도착해 `.then` 이 큐에 올라간
 * 뒤라면 abort 가 그 실행을 막지 못한다. `cancelled` 는 그 경우에도 항상 걸러 준다.
 */
export function useInvitationCandidates(projectId: string, query: string): CandidateSearchState {
  const trimmed = query.trim()
  const searchable = trimmed.length >= INVITATION_CANDIDATE_QUERY_MIN_LENGTH

  const [fetchState, setFetchState] = useState<FetchState>(initialFetchState)

  useEffect(() => {
    if (!searchable) return

    let cancelled = false
    const controller = new AbortController()

    const timer = setTimeout(() => {
      searchInvitationCandidates(projectId, trimmed, controller.signal)
        .then((candidates) => {
          if (cancelled) return
          setFetchState({ query: trimmed, status: 'ready', candidates })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          if (error instanceof DOMException && error.name === 'AbortError') return
          setFetchState({ query: trimmed, status: 'error', candidates: [] })
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [projectId, trimmed, searchable])

  if (!searchable) return idleState
  // 지금 찾는 값에 대한 응답이 아직 없으면 그 자체로 loading 이다 — 이전 검색 결과를 화면에
  // 남겨 두지 않는다.
  if (fetchState.query !== trimmed) return { status: 'loading', candidates: [] }
  return { status: fetchState.status, candidates: fetchState.candidates }
}
