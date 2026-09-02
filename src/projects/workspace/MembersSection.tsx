import { useId, useRef, useState } from 'react'
import { composeNicknameTag } from '../../auth/authTypes'
import { ConfirmActionDialog } from '../../design-system/primitives/ConfirmActionDialog'
import { useI18n } from '../../i18n/useI18n'
import { apiErrorMessage } from '../apiErrorMessage'
import { formatDate } from '../formatters'
import { removeMember, revokeInvitation, sendInvitation } from '../memberApi'
import {
  INVITATION_CANDIDATE_QUERY_MIN_LENGTH,
  INVITATION_EMAIL_MAX_LENGTH,
  isInvitationExpired,
  type InvitationCandidate,
  type InvitationDraft,
  type ProjectInvitation,
  type ProjectMember,
} from '../memberTypes'
import { ProjectApiError } from '../projectApi'
import { PROJECT_ROLES, type ProjectRole } from '../projectTypes'
import { useInvitationCandidates } from '../useInvitationCandidates'
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

/** 초대 입력창이 현재 가리키는 대상. 텍스트를 편집하면 [candidate] 는 항상 비워진다 —
 * 골라 놓은 사람과 지금 보이는 글자가 어긋난 채로 남는 상태를 만들지 않는다. */
type InviteTargetValue = {
  text: string
  candidate: InvitationCandidate | null
}

const emptyInviteTarget: InviteTargetValue = { text: '', candidate: null }

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
  const [target, setTarget] = useState<InviteTargetValue>(emptyInviteTarget)
  const [role, setRole] = useState<ProjectRole>('MEMBER')
  const [failure, setFailure] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const { t } = useI18n()
  const copy = t.projects.members
  const inviteTargetFieldId = useId()

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setFailure(null)

    try {
      const draft: InvitationDraft =
        target.candidate !== null
          ? { kind: 'appUserId', appUserId: target.candidate.appUserId, role }
          : { kind: 'email', email: target.text, role }
      const sentTo =
        target.candidate !== null
          ? composeNicknameTag(target.candidate.nickname, target.candidate.userTag)
          : target.text.trim()

      await sendInvitation(projectId, draft)
      setTarget(emptyInviteTarget)
      setRole('MEMBER')
      onAnnounce(copy.sentAnnouncement(sentTo))
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
          <label className="field" htmlFor={inviteTargetFieldId}>
            <span className="field-label">{copy.inviteTargetLabel}</span>
            <InviteTargetCombobox
              disabled={sending}
              id={inviteTargetFieldId}
              onChange={setTarget}
              placeholder={copy.inviteTargetPlaceholder}
              projectId={projectId}
              value={target}
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
            disabled={sending || (target.candidate === null && target.text.trim().length === 0)}
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

/**
 * 초대 대상을 nickname·tag·로그인 이름으로 찾는 자동완성. `combobox` 접근성 패턴을 따른다 —
 * `input` 이 `role="combobox"` 를 지니고, 후보 목록은 `role="listbox"` 인 별도 popup 이며,
 * 방향키로 그 목록을 옮겨 다니는 동안 focus 는 계속 `input` 에 남고 `aria-activedescendant`
 * 로만 어느 줄이 골라졌는지 말한다.
 *
 * 이미 고른 사람이 있을 때는([value.candidate] 이 있을 때는) 방향키로 다시 열지 않는다 — 글자를
 * 편집해야 선택이 풀리고 검색이 다시 시작된다.
 */
function InviteTargetCombobox({
  disabled,
  id,
  onChange,
  placeholder,
  projectId,
  value,
}: {
  disabled: boolean
  id: string
  onChange: (value: InviteTargetValue) => void
  placeholder: string
  projectId: string
  value: InviteTargetValue
}) {
  const { t } = useI18n()
  const copy = t.projects.members
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // 이미 고른 사람이 있으면 그 이름으로는 다시 찾지 않는다 — 고른 직후 같은 글자로 또 요청을
  // 보내는 것을 막는다. `useInvitationCandidates` 는 두 글자 미만을 `idle` 로 보므로 빈 문자열을
  // 넘기면 검색이 그친다.
  //
  // [activeIndex] 를 새 결과에 맞춰 되돌리는 effect 를 따로 두지 않는다: [candidates] 가
  // 바뀌는 경로는 둘뿐이고, 둘 다 이미 그 자리에서 -1 로 되돌린다 — 글자를 고치면
  // [handleChange] 가, 사람을 고르면 [selectCandidate] 가. 그 사이 요청이 도는 동안은
  // [candidates] 가 빈 배열이라 방향키 분기 자체가 index 를 건드리지 않는다.
  const searchQuery = value.candidate === null ? value.text : ''
  const { status: candidateStatus, candidates } = useInvitationCandidates(projectId, searchQuery)

  function selectCandidate(candidate: InvitationCandidate) {
    onChange({ text: composeNicknameTag(candidate.nickname, candidate.userTag), candidate })
    setOpen(false)
    setActiveIndex(-1)
    inputRef.current?.focus()
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const text = event.target.value
    onChange({ text, candidate: null })
    setOpen(text.trim().length >= INVITATION_CANDIDATE_QUERY_MIN_LENGTH)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (value.candidate !== null) return

    // 후보가 없거나 아직 로딩 중이어도 Escape 로는 늘 닫을 수 있어야 한다 — 방향키 분기보다
    // 먼저 본다.
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
      }
      return
    }

    if (!open) {
      if (event.key === 'ArrowDown' && value.text.trim().length >= INVITATION_CANDIDATE_QUERY_MIN_LENGTH) {
        event.preventDefault()
        setOpen(true)
      }
      return
    }

    // 열려 있어도 고를 후보가 아직 없으면(로딩·빈 결과) 방향키·Enter 는 아무것도 하지 않는다.
    // Enter 는 그대로 두어 원래 하던 대로 form 을 제출한다 — 자동완성이 뜬 채로 이메일 주소를
    // 직접 쳐 넣고 보내는 경우가 그렇다.
    if (candidates.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(index + 1, candidates.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(index - 1, 0))
        break
      case 'Enter':
        if (activeIndex >= 0) {
          event.preventDefault()
          selectCandidate(candidates[activeIndex])
        }
        break
      default:
        break
    }
  }

  const activeCandidate = activeIndex >= 0 ? (candidates[activeIndex] ?? null) : null

  return (
    <div className="invite-combobox">
      <input
        aria-activedescendant={activeCandidate !== null ? optionId(id, activeCandidate) : undefined}
        aria-autocomplete="list"
        aria-controls={candidates.length > 0 ? listboxId : undefined}
        aria-expanded={open}
        autoComplete="off"
        className="field-input"
        disabled={disabled}
        id={id}
        maxLength={INVITATION_EMAIL_MAX_LENGTH}
        onBlur={() => setOpen(false)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        type="text"
        value={value.text}
      />

      {open && (
        <div className="invite-candidate-popup">
          {candidateStatus === 'loading' ? (
            <p className="invite-candidate-status" role="status">
              {copy.candidateLoading}
            </p>
          ) : candidateStatus === 'error' ? (
            <p className="invite-candidate-status invite-candidate-status--error" role="status">
              {copy.candidateSearchFailed}
            </p>
          ) : candidates.length === 0 ? (
            <p className="invite-candidate-status" role="status">
              {copy.candidateEmpty}
            </p>
          ) : (
            <ul aria-label={copy.candidateListLabel} className="invite-candidate-list" id={listboxId} role="listbox">
              {candidates.map((candidate, index) => (
                <li
                  aria-selected={index === activeIndex}
                  className={`invite-candidate-row${index === activeIndex ? ' invite-candidate-row--active' : ''}`}
                  id={optionId(id, candidate)}
                  key={candidate.appUserId}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    selectCandidate(candidate)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                >
                  <span className="invite-candidate-name mono">
                    {composeNicknameTag(candidate.nickname, candidate.userTag)}
                  </span>
                  <span className="invite-candidate-login">
                    {candidate.login !== null ? candidate.login : copy.candidateNoLogin}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function optionId(fieldId: string, candidate: InvitationCandidate): string {
  return `${fieldId}-option-${candidate.appUserId}`
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
