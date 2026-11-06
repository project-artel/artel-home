import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { listReceivedInvitations } from './memberApi'
import type { ProjectInvitation } from './memberTypes'

type InboxState = {
  status: 'loading' | 'ready' | 'error'
  invitations: ProjectInvitation[]
}

/**
 * 로그인한 계정에 온 초대. 그 계정의 확인된 이메일 주소로 온 초대와, 자동완성에서 그 계정을 골라
 * 보낸 초대를 서버가 함께 돌려준다.
 *
 * 계정에 이메일이 없어도 조회한다. 계정을 골라 보낸 초대는 주소 없이도 이 목록에 오기 때문이다.
 *
 * 세션을 아직 읽는 중일 때는 조회하지 않고 [knowsAccount] 를 false 로 둔다. `AuthState` 의
 * `loading` 에서도 `user` 가 null 이라, 그때 부르면 로그인하지 않은 요청이 나간다.
 */
export function useInvitations() {
  const auth = useAuth()
  const knowsAccount = auth.status === 'authenticated'
  const userId = knowsAccount ? auth.user.id : null
  const [state, setState] = useState<InboxState>({ status: 'loading', invitations: [] })

  // `userId` 를 의존성에 두는 것은 계정이 바뀐 경우를 위해서다. `knowsAccount` 만 보면 그때 값이
  // 바뀌지 않아 앞 계정의 초대가 남는다.
  useEffect(() => {
    if (userId === null) return

    const controller = new AbortController()

    listReceivedInvitations(controller.signal)
      .then((invitations) => setState({ status: 'ready', invitations }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ status: 'error', invitations: [] })
      })

    return () => controller.abort()
  }, [userId])

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
    knowsAccount,
    status: state.status,
    invitations: state.invitations,
    forget,
    reload,
  }
}
