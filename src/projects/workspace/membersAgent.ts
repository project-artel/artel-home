import type { ProjectInvitation, ProjectMember } from '../memberTypes'
import { PROJECT_ROLES, type ProjectRole } from '../projectTypes'

/*
 * 멤버 페이지의 project agent action 이 args 를 화면의 값으로 바꾸는 검사. 모르는 값은 조용히
 * 무시하지 않고 던진다. registry 가 던진 것을 `error` 결과로 바꾸므로 agent 가 무엇이 틀렸는지 듣는다.
 */

/** 화면에는 소유자가 아닌 사람에게 보이는 버튼이 없어서, 이유를 글로 보여 주지 않는다. */
export const NOT_OWNER_REASON = 'Only a project owner can do this.'

export function requireMember(members: readonly ProjectMember[], userId: unknown): ProjectMember {
  const member = members.find((candidate) => candidate.userId === userId)
  if (member === undefined) throw new Error(`No member with userId ${JSON.stringify(userId)} on this project.`)
  return member
}

export function requireInvitation(invitations: readonly ProjectInvitation[], invitationId: unknown): ProjectInvitation {
  const invitation = invitations.find((candidate) => candidate.id === invitationId)
  if (invitation === undefined) throw new Error(`No pending invitation with id ${JSON.stringify(invitationId)}.`)
  return invitation
}

/** 역할을 안 주면 폼의 기본값인 MEMBER 다. */
export function requireInviteRole(value: unknown): ProjectRole {
  if (value === undefined) return 'MEMBER'
  const role = PROJECT_ROLES.find((candidate) => candidate === value)
  if (role === undefined) throw new Error(`role must be one of ${PROJECT_ROLES.join(', ')}.`)
  return role
}

/** 이메일이나 `nickname#tag` 로 쓸 글자. 비었으면 던진다. */
export function requireInviteTarget(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('target must be a non-empty email address or nickname#tag.')
  return value.trim()
}
