import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseAuthUser } from './authApi'
import { isBattleTagValid, resolveDisplayNickname, toAccountProfileDraft } from './authTypes'

/*
 * `ARTEL-730` adds `nickname` and `battleTag` to the session payload. The only new
 * logic on this side of that contract is: how the two fields degrade when the
 * session omits them, how a BattleTag candidate is judged, how a form's two text
 * fields become the wire payload, and what the screen shows when nickname is unset.
 */

const sessionPayload = {
  id: '52',
  displayName: 'octocat',
  email: 'octocat@example.com',
  nickname: 'The Octocat',
  battleTag: 'Octocat#1234',
  locale: null,
  identities: [],
}

describe('parseAuthUser', () => {
  it('reads a session that carries both fields', () => {
    const user = parseAuthUser(sessionPayload)
    assert.equal(user.nickname, 'The Octocat')
    assert.equal(user.battleTag, 'Octocat#1234')
  })

  it('degrades a missing nickname or BattleTag to null rather than dropping the session', () => {
    const user = parseAuthUser({ ...sessionPayload, nickname: undefined, battleTag: undefined })
    assert.equal(user.nickname, null)
    assert.equal(user.battleTag, null)
  })

  it('degrades a non-string nickname or BattleTag to null', () => {
    const user = parseAuthUser({ ...sessionPayload, nickname: 12, battleTag: {} })
    assert.equal(user.nickname, null)
    assert.equal(user.battleTag, null)
  })
})

describe('isBattleTagValid', () => {
  it('accepts a name, "#", and 1 to 8 digits', () => {
    assert.equal(isBattleTagValid('Ashbringer#1'), true)
    assert.equal(isBattleTagValid('Ashbringer#12345678'), true)
  })

  it('rejects a missing or malformed separator', () => {
    assert.equal(isBattleTagValid('Ashbringer1234'), false)
    assert.equal(isBattleTagValid('Ashbringer#'), false)
  })

  it('rejects more than 8 digits', () => {
    assert.equal(isBattleTagValid('Ashbringer#123456789'), false)
  })

  it('rejects a name longer than 24 characters', () => {
    assert.equal(isBattleTagValid(`${'a'.repeat(25)}#1234`), false)
  })

  it('rejects a second "#" inside the name', () => {
    assert.equal(isBattleTagValid('Ash#bringer#1234'), false)
  })
})

describe('toAccountProfileDraft', () => {
  it('trims both fields', () => {
    assert.deepEqual(toAccountProfileDraft('  Ash  ', '  Ashbringer#1234  '), {
      nickname: 'Ash',
      battleTag: 'Ashbringer#1234',
    })
  })

  it('turns an empty or whitespace-only field into null, not an empty string', () => {
    assert.deepEqual(toAccountProfileDraft('', '   '), { nickname: null, battleTag: null })
  })
})

describe('resolveDisplayNickname', () => {
  it('prints the chosen nickname when one is set', () => {
    assert.equal(resolveDisplayNickname({ displayName: 'octocat', nickname: 'The Octocat' }), 'The Octocat')
  })

  it('falls back to displayName when nickname is unset', () => {
    assert.equal(resolveDisplayNickname({ displayName: 'octocat', nickname: null }), 'octocat')
  })
})
