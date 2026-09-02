import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseInvitation,
  parseInvitationCandidate,
  parseMember,
  searchInvitationCandidates,
  sendInvitation,
} from './memberApi'
import { isInvitationExpired, type ProjectInvitation } from './memberTypes'

/*
 * 이 화면에서 실제로 틀릴 수 있는 논리는 서버 응답을 좁히는 규칙 하나다. 어느 필드가 없을 때 줄을
 * 버리고 어느 필드는 없어도 그리는지, 모르는 enum 을 어느 쪽으로 떨어뜨리는지가 전부다.
 *
 * `searchInvitationCandidates` 와 `sendInvitation` 은 그 규칙에 더해 실제 요청 모양도 검증한다
 * — `ARTEL-735` 가 대상을 email 과 appUserId 둘로 가른 지점이라 request body 가 둘 중 하나로만
 * 나가는지가 여기서 틀리면 서버가 `invitation_target_ambiguous` 로 400 을 낸다.
 */

/**
 * `globalThis.fetch` 를 [handler] 로 바꿔치기하는 동안 [run] 을 돈다 — `apiFetch` 가 실제
 * `fetch` 에 닿는 유일한 이음매다. `authApi.test.ts` 와 같은 모양이다.
 */
async function withMockedFetch<T>(
  handler: (url: string, init: RequestInit) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {})) as typeof fetch

  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

const member = {
  userId: '52',
  displayName: 'octocat',
  email: 'octocat@example.com',
  nickname: 'The Octocat',
  userTag: '1234',
  role: 'OWNER',
  joinedAt: '2026-08-30T00:00:00Z',
}

const invitation = {
  id: '7',
  projectId: '35',
  projectName: 'Demo Day',
  email: 'hubot@example.com',
  role: 'MEMBER',
  status: 'PENDING',
  invitedBy: 'octocat',
  createdAt: '2026-08-30T00:00:00Z',
  expiresAt: '2026-09-13T00:00:00Z',
}

describe('parseMember', () => {
  it('reads a complete row', () => {
    assert.deepEqual(parseMember(member), {
      userId: '52',
      displayName: 'octocat',
      email: 'octocat@example.com',
      nickname: 'The Octocat',
      userTag: '1234',
      role: 'OWNER',
      joinedAt: '2026-08-30T00:00:00Z',
    })
  })

  it('keeps a member whose account has no email', () => {
    const parsed = parseMember({ ...member, email: null })
    assert.equal(parsed?.email, null)
    assert.equal(parsed?.displayName, 'octocat')
  })

  it('drops a row that cannot be pointed at, or that is missing a nickname or userTag', () => {
    assert.equal(parseMember({ ...member, userId: undefined }), null)
    assert.equal(parseMember({ ...member, displayName: undefined }), null)
    assert.equal(parseMember({ ...member, nickname: null }), null)
    assert.equal(parseMember({ ...member, userTag: null }), null)
    assert.equal(parseMember(null), null)
    assert.equal(parseMember('octocat'), null)
  })

  it('keeps a row that is only missing something cosmetic', () => {
    const parsed = parseMember({ userId: '52', displayName: 'octocat', nickname: 'The Octocat', userTag: '1234' })
    assert.equal(parsed?.joinedAt, '')
    assert.equal(parsed?.email, null)
  })

  // 권한을 넓히지 않는 쪽이 안전한 방향이다. OWNER 로 떨어뜨리면 모르는 값 하나가 내보내기
  // 버튼을 열어 준다.
  it('degrades an unknown role to MEMBER', () => {
    assert.equal(parseMember({ ...member, role: 'ADMIN' })?.role, 'MEMBER')
    assert.equal(parseMember({ ...member, role: undefined })?.role, 'MEMBER')
  })
})

describe('parseInvitation', () => {
  it('reads a complete row', () => {
    assert.deepEqual(parseInvitation(invitation), {
      id: '7',
      projectId: '35',
      projectName: 'Demo Day',
      email: 'hubot@example.com',
      role: 'MEMBER',
      status: 'PENDING',
      invitedBy: 'octocat',
      createdAt: '2026-08-30T00:00:00Z',
      expiresAt: '2026-09-13T00:00:00Z',
    })
  })

  it('drops a row with nothing to answer or nobody to name', () => {
    assert.equal(parseInvitation({ ...invitation, id: undefined }), null)
    assert.equal(parseInvitation({ ...invitation, email: undefined }), null)
    assert.equal(parseInvitation(undefined), null)
  })

  it('keeps a row whose inviter is gone', () => {
    assert.equal(parseInvitation({ ...invitation, invitedBy: null })?.invitedBy, null)
  })

  // 반대로 떨어뜨리면 아직 답할 수 있는 초대가 화면에서 사라진다.
  it('reads an unknown status as PENDING', () => {
    assert.equal(parseInvitation({ ...invitation, status: 'EXPIRED' })?.status, 'PENDING')
    assert.equal(parseInvitation({ ...invitation, status: undefined })?.status, 'PENDING')
  })

  it('degrades an unknown role to MEMBER', () => {
    assert.equal(parseInvitation({ ...invitation, role: 'ADMIN' })?.role, 'MEMBER')
  })
})

describe('isInvitationExpired', () => {
  const at = (expiresAt: string) => ({ ...invitation, expiresAt }) as ProjectInvitation

  it('is true once the moment has passed', () => {
    const now = Date.parse('2026-09-13T00:00:01Z')
    assert.equal(isInvitationExpired(at('2026-09-13T00:00:00Z'), now), true)
  })

  it('is false while it is still ahead', () => {
    const now = Date.parse('2026-09-12T23:59:59Z')
    assert.equal(isInvitationExpired(at('2026-09-13T00:00:00Z'), now), false)
  })

  // 읽을 수 없는 값을 만료로 보면, 서버가 유효하다고 준 초대를 화면이 혼자 지워 수락할 길이
  // 없어진다. 놔두면 눌렀을 때 서버가 409 로 말해 준다.
  it('does not call an unreadable date expired', () => {
    assert.equal(isInvitationExpired(at('nonsense'), Date.now()), false)
    assert.equal(isInvitationExpired(at(''), Date.now()), false)
  })
})

const candidate = {
  appUserId: '60',
  nickname: 'Yuni',
  userTag: '0042',
  displayName: 'octocat',
  login: 'octocat',
  avatarUrl: 'https://example.com/avatar.png',
}

describe('parseInvitationCandidate', () => {
  it('reads a complete row', () => {
    assert.deepEqual(parseInvitationCandidate(candidate), {
      appUserId: '60',
      nickname: 'Yuni',
      userTag: '0042',
      displayName: 'octocat',
      login: 'octocat',
      avatarUrl: 'https://example.com/avatar.png',
    })
  })

  it('keeps a candidate with no linked login or avatar', () => {
    const parsed = parseInvitationCandidate({ ...candidate, login: null, avatarUrl: null })
    assert.equal(parsed?.login, null)
    assert.equal(parsed?.avatarUrl, null)
  })

  it('drops a row missing appUserId, nickname, userTag, or displayName', () => {
    assert.equal(parseInvitationCandidate({ ...candidate, appUserId: undefined }), null)
    assert.equal(parseInvitationCandidate({ ...candidate, nickname: undefined }), null)
    assert.equal(parseInvitationCandidate({ ...candidate, userTag: undefined }), null)
    assert.equal(parseInvitationCandidate({ ...candidate, displayName: undefined }), null)
    assert.equal(parseInvitationCandidate(null), null)
  })
})

describe('searchInvitationCandidates', () => {
  it('sends the query as a URL parameter and parses the array back', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    const candidates = await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify([candidate]), { status: 200 })
      },
      () => searchInvitationCandidates('35', 'Yuni#0042'),
    )

    assert.equal(calls.length, 1)
    assert.equal(
      calls[0].url,
      'http://localhost:8080/api/projects/35/invitation-suggestions?query=Yuni%230042',
    )
    assert.deepEqual(candidates, [
      {
        appUserId: '60',
        nickname: 'Yuni',
        userTag: '0042',
        displayName: 'octocat',
        login: 'octocat',
        avatarUrl: 'https://example.com/avatar.png',
      },
    ])
  })

  // 줄 하나가 깨졌다고 나머지 후보까지 감출 이유가 없다 — `parseMember` 가 세운 규칙과 같다.
  it('drops a malformed row without failing the whole search', async () => {
    const candidates = await withMockedFetch(
      () => new Response(JSON.stringify([candidate, { nickname: 'no id' }]), { status: 200 }),
      () => searchInvitationCandidates('35', 'Yu'),
    )
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].appUserId, '60')
  })
})

describe('sendInvitation', () => {
  it('sends only email for an email-kind draft', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify(invitation), { status: 200 })
      },
      () => sendInvitation('35', { kind: 'email', email: ' hubot@example.com ', role: 'MEMBER' }),
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'http://localhost:8080/api/projects/35/invitations')
    assert.deepEqual(JSON.parse(calls[0].init.body as string), {
      email: 'hubot@example.com',
      role: 'MEMBER',
    })
  })

  // appUserId 로 부를 때는 email 필드를 아예 싣지 않는다 — 둘 다 실으면 서버가
  // `invitation_target_ambiguous` 로 400 을 낸다.
  it('sends only appUserId for an appUserId-kind draft', async () => {
    const calls: { url: string; init: RequestInit }[] = []

    await withMockedFetch(
      (url, init) => {
        calls.push({ url, init })
        return new Response(JSON.stringify(invitation), { status: 200 })
      },
      () => sendInvitation('35', { kind: 'appUserId', appUserId: '60', role: 'MEMBER' }),
    )

    assert.equal(calls.length, 1)
    assert.deepEqual(JSON.parse(calls[0].init.body as string), {
      appUserId: '60',
      role: 'MEMBER',
    })
  })
})
