import type { ProjectRole } from './projectTypes'

/**
 * 초대가 놓인 자리. 서버가 저장하는 값 넷이다.
 *
 * 만료가 값으로 없는 것은 빠뜨린 것이 아니다. 서버는 `expiresAt` 과 현재 시각을 비교해 조회할 때
 * 정하고, 화면도 [isInvitationExpired] 로 같은 판정을 한다. 목록에 나온 초대는 서버가 이미
 * 걸러낸 것이라 대개 유효하지만, 화면이 오래 떠 있는 동안 지날 수 있다.
 */
export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED'] as const

export type InvitationStatus = (typeof INVITATION_STATUSES)[number]

export const INVITATION_EMAIL_MAX_LENGTH = 320

export type ProjectMember = {
  /** 불투명 서버 식별자. 파싱하지 않는다. */
  userId: string
  displayName: string
  /**
   * 없을 수 있다. GitHub 에서 공개 이메일을 받지 못한 계정이 그렇고, 그런 사람은 초대를 받을
   * 수도 없다. 감추지 않고 그대로 그려, 왜 그 사람을 부를 수 없는지가 화면에서 보이게 한다.
   */
  email: string | null
  /** 그 사람이 계정 설정에서 정한 이름. 서버가 모든 사용자에게 보장하므로 항상 있다. */
  nickname: string
  /**
   * `nickname` 과 짝을 이루는 discriminator. `authTypes.ts` 의 `composeNicknameTag` 로
   * `nickname#userTag` 형태로 합쳐 그린다. 서버가 붙이는 값이라 보통 네 자리 숫자지만 폭을
   * 고정하지 않는다.
   */
  userTag: string
  role: ProjectRole
  joinedAt: string
}

export type ProjectInvitation = {
  id: string
  projectId: string
  /** 받은 초대함이 어느 프로젝트의 부름인지 말하려면 이름이 필요하다. */
  projectName: string
  email: string
  /** 수락했을 때 갖게 될 역할. 이미 멤버인 사람이 수락하면 서버가 기존 역할을 그대로 돌려준다. */
  role: ProjectRole
  status: InvitationStatus
  /** 초대한 사람의 표시 이름. 그 사람이 지워졌으면 null 이다. id 가 아니다. */
  invitedBy: string | null
  createdAt: string
  expiresAt: string
}

/** 새 초대 폼이 들고 있는 값. */
export type InvitationDraft = {
  email: string
  role: ProjectRole
}

export function isInvitationStatus(value: unknown): value is InvitationStatus {
  return typeof value === 'string' && (INVITATION_STATUSES as readonly string[]).includes(value)
}

/**
 * 유효 기간이 지났는지.
 *
 * 읽을 수 없는 `expiresAt` 은 만료로 보지 않는다. 만료로 떨어뜨리면 서버가 유효하다고 준 초대를
 * 화면이 혼자 지워, 사용자가 수락할 길이 없어진다. 반대로 놔두면 눌렀을 때 서버가 409 로
 * 말해 준다 — 틀렸을 때 회복할 수 있는 쪽이다.
 */
export function isInvitationExpired(invitation: ProjectInvitation, now: number = Date.now()): boolean {
  const expiresAt = Date.parse(invitation.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now
}
