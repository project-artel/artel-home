import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { listReceivedInvitations } from './memberApi'
import type { ProjectInvitation } from './memberTypes'

type InboxState = {
  status: 'loading' | 'ready' | 'error'
  invitations: ProjectInvitation[]
}

/**
 * 로그인한 계정의 이메일로 온 초대.
 *
 * 계정에 이메일이 없으면 조회를 아예 하지 않는다. 서버는 언제나 빈 배열을 주는데, 그것을 그대로
 * 그리면 "받은 초대가 없다"로 읽혀 초대한 쪽과 받는 쪽이 서로를 기다린다. [canReceive]가 그 둘을
 * 가르고, 화면이 "이메일이 없어 초대를 받을 수 없다"를 대신 말한다.
 *
 * 판정을 `/api/auth/me`의 `email`로 하는 것은 서버 규칙을 화면이 한 벌 더 갖는 것이다. 다른 길이
 * 없다 — 빈 목록만으로는 "초대가 없다"와 "받을 수 없다"가 구분되지 않는다.
 *
 * 세션을 아직 읽는 중일 때 [canReceive]는 false지만 [knowsAccount]도 false다. 둘을 나눠 두지
 * 않으면 로그인 직후 한 순간 "이메일이 없어 초대를 받을 수 없다"가 떴다가 사라진다 —
 * `AuthState`의 `loading`에서도 `user`가 null이기 때문이다.
 */
export function useInvitations() {
  const auth = useAuth()
  const knowsAccount = auth.status === 'authenticated'
  const email = knowsAccount ? auth.user.email : null
  const canReceive = typeof email === 'string'
  const [state, setState] = useState<InboxState>({ status: 'loading', invitations: [] })

  // 읽지 않는 경우에 상태를 쓰지 않는다. `canReceive` 는 세션에서 바로 나오는 값이라, effect 로
  // 한 박자 늦게 반영하면 렌더가 한 번 더 돈다.
  // `email` 을 의존성에 두는 것은 계정이 바뀌었는데 둘 다 이메일이 있는 경우를 위해서다.
  // `canReceive` 만 보면 그때 값이 바뀌지 않아 앞 계정의 초대가 남는다.
  useEffect(() => {
    if (!canReceive) return

    const controller = new AbortController()

    listReceivedInvitations(controller.signal)
      .then((invitations) => setState({ status: 'ready', invitations }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', invitations: [] })
      })

    return () => controller.abort()
  }, [canReceive, email])

  const reload = useCallback(() => {
    setState({ status: 'loading', invitations: [] })
    listReceivedInvitations()
      .then((invitations) => setState({ status: 'ready', invitations }))
      .catch(() => setState({ status: 'error', invitations: [] }))
  }, [])

  /** 답한 초대를 목록에서 뺀다. 서버가 이미 그것을 `PENDING` 밖으로 옮긴 뒤에만 부른다. */
  const forget = useCallback((invitationId: string) => {
    setState((previous) => ({
      status: previous.status,
      invitations: previous.invitations.filter((invitation) => invitation.id !== invitationId),
    }))
  }, [])

  return {
    canReceive,
    knowsAccount,
    // 초대를 받을 수 없는 계정에는 읽을 것이 없으므로 언제나 다 읽은 상태다.
    status: canReceive ? state.status : 'ready',
    invitations: canReceive ? state.invitations : [],
    forget,
    reload,
  }
}
