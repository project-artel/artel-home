import { useId, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { apiErrorMessage } from './apiErrorMessage'
import { formatDate } from './formatters'
import { acceptInvitation, declineInvitation } from './memberApi'
import { isInvitationExpired, type ProjectInvitation } from './memberTypes'
import { ProjectApiError } from './projectApi'
import { ProjectCover } from './ProjectCover'
import type { useInvitations } from './useInvitations'

/**
 * 나를 부른 프로젝트들(ARTEL-1208). 프로젝트 카드 아래에 흐린 카드로 놓는다. 아직 내 프로젝트가 아니라는 것을
 * 모양으로 말하고, 카드를 누르면 참여할지 묻는 창이 뜬다. 수락하면 바로 그 프로젝트로 들어간다.
 *
 * 초대가 없으면 아무것도 그리지 않는다. 빈 칸이 늘 떠 있으면 목록 화면에 "초대 없음" 이 언제나 남는다.
 *
 * @property onAccepted 수락 뒤 프로젝트 목록을 다시 읽고 그 프로젝트로 옮긴다
 */
export function InvitationInbox({
  inbox,
  onAccepted,
}: {
  inbox: ReturnType<typeof useInvitations>
  onAccepted: (projectId: string) => void
}) {
  const { invitations, forget, knowsAccount, reload, status } = inbox
  const [announcement, setAnnouncement] = useState('')
  const [open, setOpen] = useState<ProjectInvitation | null>(null)
  const { t } = useI18n()
  const copy = t.projects.inbox

  // 세션을 아직 읽는 중이면 아무것도 그리지 않는다. 조회도 아직 시작하지 않았다.
  if (!knowsAccount) return null

  return (
    <>
      {sectionFor()}

      {open !== null && (
        <AnswerDialog
          invitation={open}
          onAccepted={() => {
            setAnnouncement(copy.acceptedAnnouncement(open.projectName))
            forget(open.id)
            setOpen(null)
            onAccepted(open.projectId)
          }}
          onClose={() => setOpen(null)}
          onDeclined={() => {
            setAnnouncement(copy.declinedAnnouncement(open.projectName))
            forget(open.id)
            setOpen(null)
          }}
        />
      )}

      {/*
        답한 카드는 목록에서 사라지기만 한다. 화면을 보지 않는 사람에게는 그것이 아무 일도 일어나지
        않은 것과 같아, 무엇에 답했는지 말해 준다. region 이 칸 밖에 있어야 마지막 초대에 답해 칸이
        사라져도 읽힌다.
      */}
      <p aria-live="polite" className="visually-hidden">{announcement}</p>
    </>
  )

  function sectionFor() {
    // 못 읽은 것과 초대가 없는 것은 다른 상태다. 실패를 조용히 감추면, 나를 부른 프로젝트가
    // 있는데 없는 것처럼 보인다.
    if (status === 'error') {
      return (
        <section className="invitation-inbox" aria-labelledby="inbox-title">
          <header className="screen-subhead">
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
      <section className="invitation-inbox" aria-labelledby="inbox-title">
        <header className="screen-subhead">
          <h2 id="inbox-title">
            {copy.title}
            <span className="panel-count">{invitations.length}</span>
            <InfoHint>{copy.copy}</InfoHint>
          </h2>
          <span className="settings-hint">{copy.hint}</span>
        </header>
        <ul className="project-cards">
          {invitations.map((invitation) => {
            const expired = isInvitationExpired(invitation)
            return (
              <li key={invitation.id}>
                <button className="project-card project-card--invited" onClick={() => setOpen(invitation)} type="button">
                  <ProjectCover id={invitation.projectId} name={invitation.projectName}>
                    <span className="project-card-tag">{copy.tag}</span>
                  </ProjectCover>
                  <span className="project-card-body">
                    <span className="project-card-top">
                      <span className="project-card-name">{invitation.projectName}</span>
                      <span className="badge">{copy.roleChip(t.projects.roles[invitation.role])}</span>
                    </span>
                    {invitation.invitedBy !== null && (
                      <span className="project-card-description">{copy.invitedByShort(invitation.invitedBy)}</span>
                    )}
                    <span className="project-card-meta">
                      {expired ? copy.expired : copy.expires(formatDate(invitation.expiresAt))}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }
}

/** 카드를 누르면 뜨는 창. 수락하면 가입되고 바로 들어간다는 것을 먼저 말한다. */
function AnswerDialog({
  invitation,
  onAccepted,
  onDeclined,
  onClose,
}: {
  invitation: ProjectInvitation
  onAccepted: () => void
  onDeclined: () => void
  onClose: () => void
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState<'accept' | 'decline' | null>(null)
  const { t } = useI18n()
  const copy = t.projects.inbox
  const titleId = useId()
  const role = t.projects.roles[invitation.role]
  // 서버가 만료된 것을 걸러 주지만, 화면이 오래 떠 있으면 그 사이에 지날 수 있다. 미리 막지 않고
  // 표시만 한다. 눌러 보면 서버가 409 로 정확히 말해 준다.
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
    <Dialog labelledBy={titleId} onClose={onClose} title={copy.dialogTitle(invitation.projectName)}>
      <p className="dialog-copy">{copy.dialogBody(role)}</p>
      <p className="dialog-copy detail-empty">
        {invitation.invitedBy !== null ? copy.invitedBy(invitation.invitedBy, role) : copy.invitedAs(role)}
        {' · '}
        {expired ? copy.expired : copy.expires(formatDate(invitation.expiresAt))}
      </p>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <div className="dialog-actions">
        <button className="button button--secondary" disabled={pending !== null} onClick={onClose} type="button">
          {copy.later}
        </button>
        <button
          className="button button--danger-quiet"
          disabled={pending !== null}
          onClick={() => void answer('decline')}
          type="button"
        >
          {pending === 'decline' ? copy.declining : copy.decline}
        </button>
        <button
          className="button button--primary"
          disabled={pending !== null}
          onClick={() => void answer('accept')}
          type="button"
        >
          {pending === 'accept' ? copy.accepting : copy.acceptAndEnter}
        </button>
      </div>
    </Dialog>
  )
}
