import { apiFetch } from '../auth/authApi'
import {
  isInvitationStatus,
  type InvitationDraft,
  type ProjectInvitation,
  type ProjectMember,
} from './memberTypes'
import {
  asNullableString,
  asRecord,
  asString,
  jsonRequest,
  ProjectApiError,
  projectPath,
  readJson,
  toApiError,
} from './projectApi'
import { isProjectRole, type ProjectRole } from './projectTypes'

/*
 * 프로젝트 참여자를 읽고 바꾸는 경로. `projectApi.ts` 가 sibling module 이 쓰라고 export 해 둔
 * 오류 타입과 관용 parser 를 그대로 쓴다 — 두 벌을 두면 어느 상태 코드가 field 오류를 싣는지
 * 같은 것에서 갈린다. `gameApi.ts` 도 같은 방식이다.
 */

/** 모르는 역할은 MEMBER 로 떨어뜨린다. 파괴적 동작을 감추는 쪽이 안전한 방향이다. */
function asRole(value: unknown): ProjectRole {
  return isProjectRole(value) ? value : 'MEMBER'
}

/**
 * 멤버 한 줄.
 *
 * `userId`, `displayName`, `nickname`, `userTag` 넷 다 필수다. 서버가 모든 사용자에게
 * `nickname` 과 `userTag` 를 보장하므로, 그 둘이 빠진 payload 는 "아직 안 정한 사람" 이 아니라
 * 깨진 응답이다 — 넷 중 하나라도 없으면 줄을 버린다. 나머지가 빠졌다고 버리지는 않는다 — 한 줄의
 * 장식 필드 하나 때문에 멤버 목록 전체를 못 보게 만드는 것이 더 나쁘다. `parseSummary` 가 세운
 * 규칙과 같다.
 */
export function parseMember(data: unknown): ProjectMember | null {
  const record = asRecord(data)
  if (record === null) return null

  const userId = asNullableString(record.userId)
  const displayName = asNullableString(record.displayName)
  const nickname = asNullableString(record.nickname)
  const userTag = asNullableString(record.userTag)
  if (userId === null || displayName === null || nickname === null || userTag === null) return null

  return {
    userId,
    displayName,
    email: asNullableString(record.email),
    nickname,
    userTag,
    role: asRole(record.role),
    joinedAt: asString(record.joinedAt),
  }
}

/**
 * 초대 한 건.
 *
 * `id` 와 `email` 이 없으면 버린다 — 무엇을 수락할지도, 누구에게 간 것인지도 말할 수 없다.
 * 모르는 status 는 `PENDING` 으로 본다. 서버가 목록에 실어 보낸 것은 아직 답을 기다리는 것뿐이라
 * 그쪽이 맞고, 반대로 떨어뜨리면 답할 수 있는 초대가 화면에서 사라진다.
 */
export function parseInvitation(data: unknown): ProjectInvitation | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const email = asNullableString(record.email)
  if (id === null || email === null) return null

  return {
    id,
    projectId: asString(record.projectId),
    projectName: asString(record.projectName),
    email,
    role: asRole(record.role),
    status: isInvitationStatus(record.status) ? record.status : 'PENDING',
    invitedBy: asNullableString(record.invitedBy),
    createdAt: asString(record.createdAt),
    expiresAt: asString(record.expiresAt),
  }
}

function parseList<T>(data: unknown, parse: (item: unknown) => T | null): T[] {
  const rows = Array.isArray(data) ? data : []
  return rows.map(parse).filter((row): row is T => row !== null)
}

export async function listMembers(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectMember[]> {
  const response = await apiFetch(projectPath(projectId, '/members'), { signal })
  return parseList(await readJson(response), parseMember)
}

/**
 * 멤버를 내보낸다. 204 라 본문이 없다 — `readJson` 을 쓰면 빈 본문에서
 * `CLIENT_UNREADABLE_RESPONSE` 가 난다. `deleteProject` 와 같은 모양이다.
 */
export async function removeMember(projectId: string, userId: string): Promise<void> {
  const response = await apiFetch(
    projectPath(projectId, `/members/${encodeURIComponent(userId)}`),
    { method: 'DELETE' },
  )
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/** 보낸 초대 목록. 소유자만 부를 수 있다. */
export async function listSentInvitations(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectInvitation[]> {
  const response = await apiFetch(projectPath(projectId, '/invitations'), { signal })
  return parseList(await readJson(response), parseInvitation)
}

export async function sendInvitation(
  projectId: string,
  draft: InvitationDraft,
): Promise<ProjectInvitation> {
  const response = await apiFetch(projectPath(projectId, '/invitations'), {
    method: 'POST',
    ...jsonRequest({ email: draft.email.trim(), role: draft.role }),
  })
  return required(parseInvitation(await readJson(response)))
}

export async function revokeInvitation(projectId: string, invitationId: string): Promise<void> {
  const response = await apiFetch(
    projectPath(projectId, `/invitations/${encodeURIComponent(invitationId)}`),
    { method: 'DELETE' },
  )
  if (!response.ok) {
    throw await toApiError(response)
  }
}

/*
 * 받은 쪽은 프로젝트 경로 밖이다. 수락하는 사람은 아직 그 프로젝트의 멤버가 아니라서, 프로젝트
 * 경로 아래에 두면 "참여자가 아니면 404" 가 먼저 걸린다.
 */

export async function listReceivedInvitations(
  signal?: AbortSignal,
): Promise<ProjectInvitation[]> {
  const response = await apiFetch('/api/invitations', { signal })
  return parseList(await readJson(response), parseInvitation)
}

export async function acceptInvitation(invitationId: string): Promise<ProjectInvitation> {
  return answerInvitation(invitationId, 'accept')
}

export async function declineInvitation(invitationId: string): Promise<ProjectInvitation> {
  return answerInvitation(invitationId, 'decline')
}

async function answerInvitation(
  invitationId: string,
  answer: 'accept' | 'decline',
): Promise<ProjectInvitation> {
  const response = await apiFetch(
    `/api/invitations/${encodeURIComponent(invitationId)}/${answer}`,
    { method: 'POST' },
  )
  return required(parseInvitation(await readJson(response)))
}

/**
 * 단건 응답은 목록과 달리 버릴 수 없다. 부른 쪽이 그 값으로 화면을 바꾸므로, 읽지 못했으면
 * 조용히 성공한 척하는 대신 오류로 말한다.
 *
 * 오류 타입을 새로 만들지 않는다. `CLIENT_*` code 를 실은 `ProjectApiError` 가 이 저장소의
 * 관례이고, `apiErrorMessage` 가 그 code 로 locale 문구를 찾는다.
 */
function required(invitation: ProjectInvitation | null): ProjectInvitation {
  if (invitation === null) {
    throw new ProjectApiError(
      200,
      'The server described the invitation oddly.',
      'CLIENT_MALFORMED_INVITATION',
    )
  }
  return invitation
}
