import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { formatDate } from './formatters'
import { acceptInvitation, declineInvitation } from './memberApi'
import { isInvitationExpired, type ProjectInvitation } from './memberTypes'
import { ProjectApiError } from './projectApi'
import { useInvitations } from './useInvitations'

/**
 * 나를 부른 프로젝트들. 프로젝트 목록 바로 위에 산다 — 수락의 결과가 "이 프로젝트가 내 목록에
 * 나타난다"라서, 답한 자리와 답이 보이는 자리가 붙어 있어야 한다.
 *
 * 초대가 없으면 아무것도 그리지 않는다. 빈 panel 이 늘 떠 있으면 목록 화면의 첫 줄이 언제나
 * "초대 없음"이 된다.
 *
 * @property onAccepted 수락 뒤 프로젝트 목록을 다시 읽는다. 목록을 손으로 이어 붙이지 않는 이유는
 *   정렬과 총 개수를 서버가 정하기 때문이다
 */
export function InvitationInbox({ onAccepted }: { onAccepted: () => void }) {
  const { canReceive, invitations, forget, knowsAccount, reload, status } = useInvitations()
  const [announcement, setAnnouncement] = useState('')
  const { t } = useI18n()
  const copy = t.projects.inbox

  // 세션을 아직 읽는 중이면 아무 말도 하지 않는다. 이때 "이메일이 없다"를 띄우면 로그인 직후
  // 한 순간 잘못된 안내가 떴다가 사라진다.
  if (!knowsAccount) return null

  return (
    <>
      {panelFor()}

      {/*
        답한 줄은 목록에서 사라지기만 한다. 화면을 보지 않는 사람에게는 그것이 아무 일도 일어나지
        않은 것과 같아, 무엇에 답했는지 말해 준다.

        region 이 panel 밖에 있는 것이 핵심이다. 안에 두면 마지막 초대에 답하는 순간 panel 이
        통째로 사라지면서 region 도 함께 unmount 되고, 보조 기술은 붙어 있는 동안 바뀐 글만
        읽으므로 한 렌더에 나타났다 사라진 글은 읽히지 않는다.
      */}
      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </>
  )

  function panelFor() {
    if (!canReceive) {
      return (
        <section className="panel invitation-inbox" aria-labelledby="inbox-title">
          <header className="panel-header">
            <h2 id="inbox-title">{copy.title}</h2>
          </header>
          <p className="section-intro">{copy.noEmailCopy}</p>
        </section>
      )
    }

    // 못 읽은 것과 초대가 없는 것은 다른 상태다. 실패를 조용히 감추면, 나를 부른 프로젝트가
    // 있는데 없는 것처럼 보인다.
    if (status === 'error') {
      return (
        <section className="panel invitation-inbox" aria-labelledby="inbox-title">
          <header className="panel-header">
            <h2 id="inbox-title">{copy.title}</h2>
          </header>
          <div className="panel-message" role="alert">
            <p>{copy.loadFailed}</p>
            <button className="button button--secondary" onClick={reload} type="button">
              {t.projects.shared.retry}
            </button>
          </div>
        </section>
      )
    }

    if (status !== 'ready' || invitations.length === 0) return null

    return (
      <section className="panel invitation-inbox" aria-labelledby="inbox-title">
        <header className="panel-header panel-header--split">
          <h2 id="inbox-title">{copy.title}</h2>
          <span className="badge">{copy.count(invitations.length)}</span>
        </header>
        <p className="section-intro">{copy.copy}</p>

        <ul className="invitation-list">
          {invitations.map((invitation) => (
            <ReceivedInvitationRow
              invitation={invitation}
              key={invitation.id}
              onAccepted={() => {
                setAnnouncement(copy.acceptedAnnouncement(invitation.projectName))
                forget(invitation.id)
                onAccepted()
              }}
              onDeclined={() => {
                setAnnouncement(copy.declinedAnnouncement(invitation.projectName))
                forget(invitation.id)
              }}
            />
          ))}
        </ul>
      </section>
    )
  }
}

function ReceivedInvitationRow({
  invitation,
  onAccepted,
  onDeclined,
}: {
  invitation: ProjectInvitation
  onAccepted: () => void
  onDeclined: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null)
  const { t } = useI18n()
  const copy = t.projects.inbox

  // 서버가 만료된 것을 걸러 주지만, 화면이 오래 떠 있으면 그 사이에 지날 수 있다. 미리 막지 않고
  // 표시만 한다 — 눌러 보면 서버가 409 로 정확히 말해 준다.
  const expired = isInvitationExpired(invitation)

  async function answer(kind: 'accept' | 'decline') {
    setPending(kind)
    setFailure(null)

    try {
      if (kind === 'accept') {
        await acceptInvitation(invitation.id)
        onAccepted()
      } else {
        await declineInvitation(invitation.id)
        onDeclined()
      }
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.answerFailed)
      setPending(null)
    }
  }

  return (
    <li className="invitation-row">
      <div className="invitation-row-main">
        <span className="invitation-row-project">{invitation.projectName}</span>
        <span className="invitation-row-meta">
          {invitation.invitedBy !== null
            ? copy.invitedBy(invitation.invitedBy, t.projects.roles[invitation.role])
            : copy.invitedAs(t.projects.roles[invitation.role])}
          {' · '}
          {expired ? copy.expired : copy.expires(formatDate(invitation.expiresAt))}
        </span>
      </div>
      <div className="invitation-row-actions">
        <button
          className="button button--secondary button--compact"
          disabled={pending !== null}
          onClick={() => void answer('decline')}
          type="button"
        >
          {pending === 'decline' ? copy.declining : copy.decline}
        </button>
        <button
          className="button button--primary button--compact"
          disabled={pending !== null}
          onClick={() => void answer('accept')}
          type="button"
        >
          {pending === 'accept' ? copy.accepting : copy.accept}
        </button>
      </div>
      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}
    </li>
  )
}
