import { useState } from 'react'
import { composeNicknameTag } from '../../auth/authTypes'
import { ConfirmActionDialog } from '../../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../../i18n/useI18n'
import { apiErrorMessage } from '../apiErrorMessage'
import { formatDate } from '../formatters'
import { removeMember, revokeInvitation, sendInvitation } from '../memberApi'
import {
  INVITATION_EMAIL_MAX_LENGTH,
  isInvitationExpired,
  type ProjectInvitation,
  type ProjectMember,
} from '../memberTypes'
import { ProjectApiError } from '../projectApi'
import { PROJECT_ROLES, type ProjectRole } from '../projectTypes'
import { useMembers } from '../useMembers'
import { useWorkspace } from './workspaceContext'

/**
 * 누가 이 프로젝트에 있고, 누구를 부르는 중인지.
 *
 * 소유자만 부르고 거두고 내보낼 수 있다. 역할은 `useWorkspace()`가 이미 들고 있는
 * `project.myRole`에서 오고, 멤버 목록에서 되짚지 않는다 — 목록에는 "이 줄이 나인가"를 말하는
 * 필드가 없다.
 *
 * 소유자가 아닌 사람에게는 초대 폼도 초대 목록도 내보내기 버튼도 그리지 않는다. 서버가 어차피
 * 막지만, 눌러 봐야 403이 나는 버튼은 죽은 UI다.
 */
export function MembersSection() {
  const { project } = useWorkspace()
  const isOwner = project.myRole === 'OWNER'
  const { status, members, invitations, refresh, reload } = useMembers(project.id, project.myRole)
  const [removing, setRemoving] = useState<ProjectMember | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const { t } = useI18n()
  const copy = t.projects.members

  return (
    <div className="section-columns">
      <section className="panel" aria-labelledby="members-title">
        <header className="panel-header panel-header--split">
          <h2 id="members-title">{copy.title}</h2>
          {status === 'ready' && <span className="badge">{copy.count(members.length)}</span>}
        </header>

        {status === 'loading' && (
          <ul className="member-list" aria-busy="true" aria-label={copy.loadingLabel}>
            {[0, 1].map((row) => (
              <li className="member-row member-row--skeleton" key={row} aria-hidden="true">
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line--short" />
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && (
          <div className="panel-message" role="alert">
            <p>{copy.loadFailed}</p>
            <button className="button button--secondary" onClick={reload} type="button">
              {t.projects.shared.retry}
            </button>
          </div>
        )}

        {status === 'ready' && (
          <ul className="member-list">
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                onRemove={isOwner ? () => setRemoving(member) : null}
              />
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <InvitePanel
          invitations={invitations}
          onAnnounce={setAnnouncement}
          onChanged={refresh}
          projectId={project.id}
          status={status}
        />
      )}

      {/* 멤버 내보내기·초대 보내기·초대 취소가 모두 목록을 소리 없이 바꾼다. 화면을 보지 않는
          사람에게는 그 변화가 전해지지 않으므로 한 자리에서 말한다. */}
      <p aria-live="polite" className="visually-hidden">{announcement}</p>

      {removing !== null && (
        <ConfirmActionDialog
          body={
            <>
              <strong>{removing.displayName}</strong>
              {copy.removeConfirmSuffix}
            </>
          }
          cancelLabel={t.projects.shared.cancel}
          confirmLabel={copy.remove}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await removeMember(project.id, removing.userId)
            setAnnouncement(copy.removedAnnouncement(removing.displayName))
            setRemoving(null)
            refresh()
          }}
          pendingLabel={copy.removing}
          title={copy.removeTitle}
          toFailureMessage={(error) =>
            error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.removeFailed
          }
        />
      )}
    </div>
  )
}

/**
 * 이메일이 없는 계정은 감추지 않고 그대로 드러낸다. 그 사람은 초대를 받을 수 없는데, 목록이
 * 이메일 칸을 비워 두면 왜 부를 수 없는지가 화면 어디에도 없다.
 */
function MemberRow({
  member,
  onRemove,
}: {
  member: ProjectMember
  onRemove: (() => void) | null
}) {
  const { t } = useI18n()
  const copy = t.projects.members

  return (
    <li className="member-row">
      <div className="member-row-main">
        <span className="member-row-name">
          {member.displayName}
          {/* 계정 설정에서 정한 이름을 로그인 이름 옆에 덧붙인다 — 둘 다 이 사람을 가리키는
              이름이라, 로그인 이름을 지우고 nickname 으로 바꾸면 초대·로그를 그 사람으로 찾을
              다른 경로가 사라진다. */}
          <span className="member-row-nickname">{copy.nickname(member.nickname)}</span>
        </span>
        {member.email !== null ? (
          <span className="member-row-email">{member.email}</span>
        ) : (
          <span className="detail-empty">{copy.noEmail}</span>
        )}
      </div>
      <div className="member-row-meta">
        <span className="badge">{t.projects.roles[member.role]}</span>
        <span className="member-row-user-tag mono">{composeNicknameTag(member.nickname, member.userTag)}</span>
        <span className="member-row-joined">{copy.joined(formatDate(member.joinedAt))}</span>
        {onRemove !== null && (
          <button
            className="button button--danger-quiet button--compact"
            onClick={onRemove}
            type="button"
          >
            {copy.remove}
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * 부르는 자리. 폼과 아직 답을 기다리는 초대가 한 panel 에 있다 — 보낸 뒤 어디를 봐야 하는지
 * 찾지 않아도 되게, 방금 보낸 것이 바로 아래 줄에 선다.
 */
function InvitePanel({
  invitations,
  onAnnounce,
  onChanged,
  projectId,
  status,
}: {
  invitations: ProjectInvitation[]
  onAnnounce: (message: string) => void
  onChanged: () => void
  projectId: string
  status: 'loading' | 'ready' | 'error'
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('MEMBER')
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const { t } = useI18n()
  const copy = t.projects.members

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setFailure(null)

    try {
      await sendInvitation(projectId, { email, role })
      setEmail('')
      setRole('MEMBER')
      onAnnounce(copy.sentAnnouncement(email.trim()))
      onChanged()
    } catch (error: unknown) {
      // 서버가 거절하는 이유가 여섯 가지라 code 로 문장을 고른다. 사전에 없는 code 는
      // `apiErrorMessage` 가 서버 문장으로 떨어뜨린다.
      setFailure(
        error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.sendFailed,
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="invite-title">
      <header className="panel-header">
        <h2 id="invite-title">{copy.inviteTitle}</h2>
      </header>
      <p className="section-intro">{copy.inviteCopy}</p>

      <form className="invite-form" onSubmit={send} noValidate>
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}

        <div className="invite-form-fields">
          <label className="field">
            <span className="field-label">{copy.emailLabel}</span>
            <input
              autoComplete="off"
              className="field-input"
              disabled={sending}
              maxLength={INVITATION_EMAIL_MAX_LENGTH}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={copy.emailPlaceholder}
              type="email"
              value={email}
            />
          </label>

          <label className="field field--compact">
            <span className="field-label">{copy.roleLabel}</span>
            <select
              className="field-input"
              disabled={sending}
              onChange={(event) => setRole(event.target.value as ProjectRole)}
              value={role}
            >
              {PROJECT_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t.projects.roles[option]}
                </option>
              ))}
            </select>
          </label>

          <button
            className="button button--primary"
            disabled={sending || email.trim().length === 0}
            type="submit"
          >
            {sending ? copy.sending : copy.send}
          </button>
        </div>
      </form>

      <h3 className="panel-subtitle">{copy.pendingTitle}</h3>
      {/* 못 읽었을 때 "없다"고 말하지 않는다. 기다리는 초대가 정말 없는 것과 알 수 없는 것은
          다른 상태이고, 소유자는 그 둘을 구분해야 다시 시도할지 정할 수 있다. */}
      {status === 'loading' ? (
        <span className="skeleton-line" aria-hidden="true" />
      ) : status === 'error' ? (
        // `detail-empty` 를 쓰지 않는다. 그 흐린 회색은 "없다" 를 말하는 색이라, 실패가 빈 상태와
        // 똑같이 보이면 못 읽었다는 사실이 눈에 걸리지 않는다. 위 멤버 panel 이 이미 alert 를
        // 띄우고 있으므로 여기는 role 을 두지 않는다.
        <div className="inline-error">
          <span aria-hidden="true">!</span>
          {copy.pendingUnknown}
        </div>
      ) : invitations.length === 0 ? (
        <p className="detail-empty">{copy.noPending}</p>
      ) : (
        <ul className="invitation-list">
          {invitations.map((invitation) => (
            <SentInvitationRow
              invitation={invitation}
              key={invitation.id}
              onAnnounce={onAnnounce}
              onRevoked={onChanged}
              projectId={projectId}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function SentInvitationRow({
  invitation,
  onAnnounce,
  onRevoked,
  projectId,
}: {
  invitation: ProjectInvitation
  onAnnounce: (message: string) => void
  onRevoked: () => void
  projectId: string
}) {
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const { t } = useI18n()
  const copy = t.projects.members

  // 서버는 만료된 초대를 목록에서 빼지만, 화면이 오래 떠 있으면 그 사이에 지날 수 있다.
  const expired = isInvitationExpired(invitation)

  async function revoke() {
    setPending(true)
    setFailure(null)

    try {
      await revokeInvitation(projectId, invitation.id)
      onAnnounce(copy.revokedAnnouncement(invitation.email))
      onRevoked()
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? apiErrorMessage(error, t) : copy.revokeFailed)
      setPending(false)
    }
  }

  return (
    <li className="invitation-row">
      <div className="invitation-row-main">
        <span className="invitation-row-email">{invitation.email}</span>
        <span className="invitation-row-meta">
          {expired ? copy.expired : copy.expires(formatDate(invitation.expiresAt))}
        </span>
      </div>
      <div className="invitation-row-actions">
        <span className="badge">{t.projects.roles[invitation.role]}</span>
        <button
          className="button button--secondary button--compact"
          disabled={pending}
          onClick={() => void revoke()}
          type="button"
        >
          {pending ? copy.revoking : copy.revoke}
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
