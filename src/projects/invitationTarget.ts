import { composeNicknameTag, isEmailValid, parseNicknameTag, type NicknameTag } from '../auth/authTypes'
import { searchInvitationCandidates } from './memberApi'
import type { InvitationCandidate, InvitationDraft } from './memberTypes'
import type { ProjectRole } from './projectTypes'

/**
 * 초대 입력창이 지금 가리키는 대상. 글자를 편집하면 [candidate] 는 항상 비워진다 — 골라 놓은
 * 사람과 화면에 보이는 글자가 어긋난 채로 남는 상태를 만들지 않는다.
 */
export type InviteTargetValue = {
  text: string
  candidate: InvitationCandidate | null
}

/**
 * 보낼 수 있게 좁혀진 대상, 또는 좁히지 못한 이유.
 *
 * @property sentTo 보낸 뒤 사용자에게 읽어 줄 이름. 사람을 가리켰으면 `nickname#userTag`,
 *   주소를 적었으면 그 주소다
 */
export type ResolvedInvitationTarget =
  | { status: 'ready'; draft: InvitationDraft; sentTo: string }
  | { status: 'handleNotFound' }
  | { status: 'handleAmbiguous' }
  | { status: 'unusableText' }

/**
 * 초대 폼이 들고 있는 값을 실제로 보낼 요청 하나로 좁힌다.
 *
 * 자동완성에서 사람을 골랐으면 그대로 `appUserId` 다. 고르지 않았는데 글자가 `nickname#userTag`
 * 형태이면 보내기 직전에 후보를 다시 찾아 그 handle 이 가리키는 사람을 확인한다. 그 확인이 없으면
 * 붙여넣은 handle 이 `email` 로 나가고, 서버의 `@Email` 이 걸러 `code` 없는 field 오류만
 * 돌아온다 — 이름을 정확히 적은 사람이 왜 안 되는지 알 수 없는 자리였다.
 *
 * 확인을 보낼 때 하는 것이 핵심이다. `nickname` 은 계정 설정에서 바뀌고(`PUT /api/auth/me/profile`),
 * 그때 비워진 `userTag` 는 같은 이름을 쓰는 다음 사람에게 다시 나간다. 그러니 어디선가 받아 적어
 * 둔 handle 이 지금 누구인지는 그 순간에만 알 수 있다.
 *
 * 찾다가 실패하면 그 오류를 그대로 던진다. 못 읽은 것을 "그런 사람이 없다" 로 바꿔 말하면
 * 소유자가 다시 시도하는 대신 이름을 고치기 시작한다.
 */
export async function resolveInvitationTarget(
  projectId: string,
  target: InviteTargetValue,
  role: ProjectRole,
): Promise<ResolvedInvitationTarget> {
  if (target.candidate !== null) {
    return readyForCandidate(target.candidate, role)
  }

  const text = target.text.trim()

  const handle = parseNicknameTag(text)
  if (handle !== null) {
    const match = matchHandle(await searchInvitationCandidates(projectId, text), handle)
    if (match.status === 'none') return { status: 'handleNotFound' }
    if (match.status === 'many') return { status: 'handleAmbiguous' }
    return readyForCandidate(match.candidate, role)
  }

  if (isEmailValid(text)) {
    return { status: 'ready', draft: { kind: 'email', email: text, role }, sentTo: text }
  }

  return { status: 'unusableText' }
}

function readyForCandidate(
  candidate: InvitationCandidate,
  role: ProjectRole,
): ResolvedInvitationTarget {
  return {
    status: 'ready',
    draft: { kind: 'appUserId', appUserId: candidate.appUserId, role },
    sentTo: composeNicknameTag(candidate.nickname, candidate.userTag),
  }
}

type HandleMatch =
  | { status: 'one'; candidate: InvitationCandidate }
  | { status: 'none' }
  | { status: 'many' }

/**
 * 적어 넣은 handle 이 후보 중 누구인지.
 *
 * 서버는 `lower(u.nickname) = ? AND u.user_tag = ?` 로 맞추므로 대소문자만 다른 두 계정이 함께
 * 돌아올 수 있다 — `app_user` 의 unique 는 `nickname` 을 있는 그대로 보기 때문에 `Yuni` 와
 * `yuni` 가 같은 `0042` 를 나눠 가질 수 있다. 그때 대소문자까지 같은 줄이 하나뿐이면 그것이 적은
 * 사람이 가리킨 계정이고, 그것도 가리지 못하면 [many] 로 물러난다. 둘 중 하나를 고를 근거가
 * 없는데 고르면 다른 사람이 프로젝트에 들어온다.
 */
function matchHandle(candidates: InvitationCandidate[], handle: NicknameTag): HandleMatch {
  const matches = candidates.filter(
    (candidate) =>
      candidate.userTag === handle.userTag &&
      candidate.nickname.toLowerCase() === handle.nickname.toLowerCase(),
  )
  if (matches.length === 0) return { status: 'none' }
  if (matches.length === 1) return { status: 'one', candidate: matches[0] }

  const sameCase = matches.filter((candidate) => candidate.nickname === handle.nickname)
  return sameCase.length === 1 ? { status: 'one', candidate: sameCase[0] } : { status: 'many' }
}
