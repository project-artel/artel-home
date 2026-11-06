import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveInvitationTarget } from './invitationTarget'
import type { InvitationCandidate } from './memberTypes'
import { ProjectApiError } from './projectApi'

/*
 * 이 module 이 정하는 것은 하나다 — 폼이 들고 있는 글자가 `appUserId` 로 나갈지, `email` 로
 * 나갈지, 아예 나가지 않을지. 목록에서 사람을 고른 경우는 그 자리에서 끝나고, 실제로 틀릴 수
 * 있는 것은 사람을 고르지 않고 `nickname#userTag` 를 붙여넣은 경로다: 그때 후보를 다시 찾아
 * 누구인지 확인하는 규칙이 여기 있다.
 */

/**
 * `globalThis.fetch` 를 [handler] 로 바꿔치기하는 동안 [run] 을 돈다. `memberApi.test.ts` 와
 * 같은 모양이다 — `apiFetch` 가 실제 `fetch` 에 닿는 유일한 이음매다.
 */
async function withMockedFetch<T>(
  handler: (url: string) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch

  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

function candidateNamed(
  appUserId: string,
  nickname: string,
  userTag: string,
): InvitationCandidate {
  return { appUserId, nickname, userTag, displayName: nickname, login: null, avatarUrl: null }
}

const yuni = candidateNamed('60', 'Yuni', '0042')

/** 후보 검색이 [rows] 를 돌려주는 동안 대상을 좁힌다. 부른 URL 도 함께 돌려준다. */
async function resolveAgainst(rows: InvitationCandidate[], text: string) {
  const urls: string[] = []
  const resolved = await withMockedFetch(
    (url) => {
      urls.push(url)
      return new Response(JSON.stringify(rows), { status: 200 })
    },
    () => resolveInvitationTarget('35', { text, candidate: null }, 'MEMBER'),
  )
  return { resolved, urls }
}

describe('resolveInvitationTarget', () => {
  it('uses the picked candidate without searching again', async () => {
    const resolved = await withMockedFetch(
      () => {
        throw new Error('a picked candidate needs no request')
      },
      () => resolveInvitationTarget('35', { text: 'Yuni#0042', candidate: yuni }, 'MEMBER'),
    )

    assert.deepEqual(resolved, {
      status: 'ready',
      draft: { kind: 'appUserId', appUserId: '60', role: 'MEMBER' },
      sentTo: 'Yuni#0042',
    })
  })

  // 붙여넣고 목록을 누르지 않은 채 보내는 경로. 예전에는 이 글자가 `email` 로 나가서 서버의
  // `@Email` 이 걸렀다.
  it('resolves a pasted handle to the account it names', async () => {
    const { resolved, urls } = await resolveAgainst([yuni], '  Yuni#0042  ')

    assert.deepEqual(resolved, {
      status: 'ready',
      draft: { kind: 'appUserId', appUserId: '60', role: 'MEMBER' },
      sentTo: 'Yuni#0042',
    })
    assert.deepEqual(urls, [
      'http://localhost:8080/api/projects/35/invitation-suggestions?query=Yuni%230042',
    ])
  })

  // 서버가 `lower(nickname)` 으로 맞추므로 대소문자만 다르게 적어도 그 사람이 나온다.
  it('accepts a handle typed in a different case', async () => {
    const { resolved } = await resolveAgainst([yuni], 'yuni#0042')
    assert.equal(resolved.status, 'ready')
  })

  it('reports a handle that names nobody invitable', async () => {
    const { resolved } = await resolveAgainst([], 'Yuni#0042')
    assert.deepEqual(resolved, { status: 'handleNotFound' })
  })

  // 후보가 돌아와도 tag 가 다르면 그 사람이 아니다 — 이름 접두사로 걸린 다른 줄이다.
  it('does not take a candidate whose userTag differs', async () => {
    const { resolved } = await resolveAgainst([candidateNamed('61', 'Yuni', '0043')], 'Yuni#0042')
    assert.deepEqual(resolved, { status: 'handleNotFound' })
  })

  it('takes the same-case account when two differ only in case', async () => {
    const { resolved } = await resolveAgainst(
      [candidateNamed('61', 'yuni', '0042'), yuni],
      'Yuni#0042',
    )

    assert.deepEqual(resolved, {
      status: 'ready',
      draft: { kind: 'appUserId', appUserId: '60', role: 'MEMBER' },
      sentTo: 'Yuni#0042',
    })
  })

  // 적은 글자가 어느 쪽과도 그대로 같지 않으면 고를 근거가 없다. 잘못 고르면 다른 사람이
  // 프로젝트에 들어온다.
  it('refuses to guess between two accounts that differ only in case', async () => {
    const { resolved } = await resolveAgainst(
      [candidateNamed('61', 'yuni', '0042'), yuni],
      'YUNI#0042',
    )
    assert.deepEqual(resolved, { status: 'handleAmbiguous' })
  })

  // 못 읽은 것을 "그런 사람이 없다" 로 바꿔 말하면 소유자가 다시 시도하는 대신 이름을 고친다.
  it('lets a failed search surface as its own error', async () => {
    await assert.rejects(
      () =>
        withMockedFetch(
          () => new Response('{}', { status: 500 }),
          () =>
            resolveInvitationTarget('35', { text: 'Yuni#0042', candidate: null }, 'MEMBER'),
        ),
      ProjectApiError,
    )
  })

  it('sends a full address as an email draft without searching', async () => {
    const resolved = await withMockedFetch(
      () => {
        throw new Error('an address needs no request')
      },
      () =>
        resolveInvitationTarget(
          '35',
          { text: '  hubot@example.com  ', candidate: null },
          'MEMBER',
        ),
    )

    assert.deepEqual(resolved, {
      status: 'ready',
      draft: { kind: 'email', email: 'hubot@example.com', role: 'MEMBER' },
      sentTo: 'hubot@example.com',
    })
  })

  // 이름만 적고 목록을 누르지 않은 경우. 이것도 예전에는 `email` 로 나갔다.
  it('refuses text that is neither a handle nor an address', async () => {
    const resolved = await withMockedFetch(
      () => {
        throw new Error('unusable text needs no request')
      },
      () => resolveInvitationTarget('35', { text: 'Yuni', candidate: null }, 'MEMBER'),
    )
    assert.deepEqual(resolved, { status: 'unusableText' })
  })
})
