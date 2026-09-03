import { useCallback, useEffect, useState } from 'react'
import { listCliTokens } from './cliTokenApi'
import type { CliToken, CliTokenCreated } from './cliTokenTypes'

type CliTokensState = {
  status: 'loading' | 'ready' | 'error'
  tokens: CliToken[]
}

const loadingState: CliTokensState = { status: 'loading', tokens: [] }
const errorState: CliTokensState = { status: 'error', tokens: [] }

/**
 * 이 계정이 발급한 CLI 토큰 목록. `useMembers.ts` 와 같은 세 단계를 쓴다 — mount 시 한 번 읽고
 * (`read`), 읽기 실패 뒤 재시도 버튼이 전체를 `loading` 으로 되돌려 다시 읽고(`reload`), 폐기처럼
 * 동작 하나가 끝난 뒤에는 화면을 비우지 않고 목록만 조용히 다시 맞춘다(`refresh`).
 */
export function useCliTokens() {
  const [state, setState] = useState<CliTokensState>(loadingState)

  const read = useCallback((signal?: AbortSignal) => listCliTokens(signal), [])

  useEffect(() => {
    const controller = new AbortController()

    read(controller.signal)
      .then((tokens) => setState({ status: 'ready', tokens }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState(errorState)
      })

    return () => controller.abort()
  }, [read])

  const reload = useCallback(() => {
    setState(loadingState)
    read()
      .then((tokens) => setState({ status: 'ready', tokens }))
      .catch(() => setState(errorState))
  }, [read])

  /**
   * 폐기 뒤에 부른다. `DELETE` 는 204 라 서버가 실제로 찍은 `revokedAt` 을 응답에서 알 수 없어
   * 다시 읽어야 한다. 실패해도 화면에 있는 목록은 그대로 둔다 — 폐기 자체는 이미 성공했고, 그
   * 결과가 목록에 늦게 반영될 뿐이다.
   */
  const refresh = useCallback(() => {
    read()
      .then((tokens) => setState({ status: 'ready', tokens }))
      .catch(() => undefined)
  }, [read])

  /**
   * 발급 응답을 목록 맨 앞에 꽂는다. 방금 만든 토큰은 `lastUsedAt` 이 `null`(아직 한 번도 안
   * 쓰였다), `revokedAt` 이 `null`(막 만들었다) 임을 서버에 다시 묻지 않아도 안다 — 재조회 없이
   * 응답 자체로 새 줄을 만든다.
   */
  const applyCreated = useCallback((created: CliTokenCreated) => {
    const token: CliToken = {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      lastUsedAt: null,
      expiresAt: created.expiresAt,
      revokedAt: null,
    }
    setState((current) => ({ status: 'ready', tokens: [token, ...current.tokens] }))
  }, [])

  return {
    status: state.status,
    tokens: state.tokens,
    reload,
    refresh,
    applyCreated,
  }
}
