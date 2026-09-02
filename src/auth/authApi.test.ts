import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAuthUser } from './authApi'
import { composeNicknameTag, toAccountProfileDraft } from './authTypes'

/*
 * `ARTEL-731` renames the old player-handle field to `userTag` and drops its
 * client-side format check — the server now generates the tag, so the browser
 * never validates its shape. `nickname` and `userTag` are both required on the
 * session payload, so the only new logic on this side of that contract is:
 * parsing them, refusing a payload missing either one, trimming a nickname
 * candidate for the wire, and composing the `nickname#userTag` display form
 * both this screen and the member list need.
 */

const sessionPayload = {
  id: '52',
  displayName: 'octocat',
  email: 'octocat@example.com',
  nickname: 'The Octocat',
  userTag: '1234',
  locale: null,
  identities: [],
}

describe('parseAuthUser', () => {
  it('reads a session that carries both fields', () => {
    const user = parseAuthUser(sessionPayload)
    assert.equal(user.nickname, 'The Octocat')
    assert.equal(user.userTag, '1234')
  })

  it('throws on a session missing a nickname or userTag rather than inventing one', () => {
    assert.throws(() => parseAuthUser({ ...sessionPayload, nickname: undefined }))
    assert.throws(() => parseAuthUser({ ...sessionPayload, userTag: undefined }))
  })

  it('throws on a non-string nickname or userTag', () => {
    assert.throws(() => parseAuthUser({ ...sessionPayload, nickname: 12 }))
    assert.throws(() => parseAuthUser({ ...sessionPayload, userTag: {} }))
  })
})

describe('toAccountProfileDraft', () => {
  it('trims the nickname', () => {
    assert.deepEqual(toAccountProfileDraft('  Ash  '), { nickname: 'Ash' })
  })

  it('trims a whitespace-only nickname down to an empty string rather than null', () => {
    assert.deepEqual(toAccountProfileDraft('   '), { nickname: '' })
  })
})

describe('composeNicknameTag', () => {
  it('joins the nickname and userTag with "#"', () => {
    assert.equal(composeNicknameTag('Ash', '1234'), 'Ash#1234')
  })

  it('does not assume the tag is four digits wide', () => {
    assert.equal(composeNicknameTag('Ash', '123456'), 'Ash#123456')
  })
})
