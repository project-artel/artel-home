import { useCallback, useEffect, useState } from 'react'
import { listMembers, listSentInvitations } from './memberApi'
import type { ProjectInvitation, ProjectMember } from './memberTypes'
import type { ProjectRole } from './projectTypes'

type MembersState = {
  status: 'loading' | 'ready' | 'error'
  members: ProjectMember[]
  invitations: ProjectInvitation[]
}

const loadingState: MembersState = { status: 'loading', members: [], invitations: [] }
const errorState: MembersState = { status: 'error', members: [], invitations: [] }

/**
 * 한 프로젝트의 참여자와, 소유자라면 아직 답을 기다리는 초대를 함께 읽는다.
 *
 * [myRole] 은 `useWorkspace()` 의 `project.myRole` 에서 와야 한다. 이 hook 이 역할을 스스로
 * 알아내지 않는 이유는, 멤버 목록에 "이 줄이 나인가" 를 말하는 필드가 없어서다. 로그인한 사용자
 * id 와 맞춰 보는 두 번째 판단 경로를 만들면 `SettingsSection` 이 이미 믿고 있는 값과 어긋날 수
 * 있다.
 *
 * 소유자가 아니면 초대는 읽지 않는다. 부르면 403 이고, 그 오류를 화면에 띄울 자리도 없다.
 */
export function useMembers(projectId: string, myRole: ProjectRole) {
  const [state, setState] = useState<MembersState>(loadingState)
  const isOwner = myRole === 'OWNER'

  const read = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        listMembers(projectId, signal),
        isOwner ? listSentInvitations(projectId, signal) : Promise.resolve([]),
      ]),
    [isOwner, projectId],
  )

  useEffect(() => {
    const controller = new AbortController()

    read(controller.signal)
      .then(([members, invitations]) => {
        setState({ status: 'ready', members, invitations })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState(errorState)
      })

    return () => controller.abort()
  }, [read])

  const reload = useCallback(() => {
    setState(loadingState)
    read()
      .then(([members, invitations]) => setState({ status: 'ready', members, invitations }))
      .catch(() => setState(errorState))
  }, [read])

  /**
   * 한 번 읽고 나서 목록만 다시 맞춘다. 초대를 보내거나 취소한 뒤, 그리고 멤버를 내보낸 뒤에
   * 부른다 — 화면 전체를 skeleton 으로 되돌리지 않으려고 [reload] 와 나눠 두었다.
   */
  const refresh = useCallback(() => {
    read()
      .then(([members, invitations]) => setState({ status: 'ready', members, invitations }))
      // 실패해도 화면에 있는 목록은 그대로 둔다. 방금 한 동작 자체는 성공했고, 그 결과가
      // 목록에 늦게 반영될 뿐이다.
      .catch(() => undefined)
  }, [read])

  return {
    status: state.status,
    members: state.members,
    invitations: state.invitations,
    refresh,
    reload,
  }
}
