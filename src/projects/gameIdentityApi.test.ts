import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { deleteGameIdentity, identityExpectedVersion, listGameIdentities, listGameIdentityHistory, parseGameIdentityList, putGameIdentity, type GameIdentity } from './gameIdentityApi'
import { ProjectApiError } from './projectApi'

const identity: GameIdentity = {
  id: '1', revisionId: '13', name: 'Player.stage', gameBuildId: '20', version: 4,
  kind: 'ordinal', base: 0, meaning: 'Current stage', changesWhen: 'On stage entry',
  identifies: 'stage', role: 'current', source: 'WEB', deleted: false,
  createdBy: '7', createdAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z',
}
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('삭제된 build binding의 version으로 재등록한다', () => {
  const entries = parseGameIdentityList({ identities: [{ ...identity, deleted: true, version: 5 }] })
  assert.equal(identityExpectedVersion(entries, identity.name), 5)
  assert.equal(identityExpectedVersion(entries, 'Other.stage'), 0)
  assert.equal(entries[0].revisionId, '13')
  assert.equal(entries[0].source, 'WEB')
})

test('잘못된 응답은 최초 등록용 빈 목록으로 처리하지 않는다', () => {
  for (const value of [{}, { identities: null }, { identities: [{ ...identity, version: '4' }] }, { identities: [{ ...identity, revisionId: undefined }] }]) {
    assert.throws(() => parseGameIdentityList(value))
  }
  assert.deepEqual(parseGameIdentityList({ identities: [] }), [])
})

test('build 목록은 tombstone을 요청하고 history에는 build filter를 보내지 않는다', async () => {
  const requests: URL[] = []
  globalThis.fetch = async (input) => {
    requests.push(new URL(String(input)))
    return Response.json({ identities: [identity] })
  }
  await listGameIdentities('10', '20')
  await listGameIdentityHistory('10', 'Player.stage')
  assert.equal(requests[0].searchParams.get('includeDeleted'), 'true')
  assert.equal(requests[0].searchParams.get('gameBuildId'), '20')
  assert.equal(requests[1].pathname, '/api/projects/10/game-identities/history')
  assert.equal(requests[1].searchParams.get('name'), identity.name)
  assert.equal(requests[1].searchParams.has('gameBuildId'), false)
})

test('저장은 선언과 build의 expectedVersion을 보내고 source를 지정하지 않는다', async () => {
  let sent: RequestInit | undefined
  globalThis.fetch = async (_input, options) => { sent = options; return Response.json(identity) }
  const { name, kind, base, meaning, changesWhen, identifies, role, gameBuildId, version } = identity
  const saved = await putGameIdentity('10', { name, kind, base, meaning, changesWhen, identifies, role, gameBuildId, expectedVersion: version })
  assert.equal(sent?.method, 'PUT')
  const payload = JSON.parse(String(sent?.body))
  assert.equal(payload.expectedVersion, 4)
  assert.equal(payload.gameBuildId, '20')
  assert.equal('source' in payload, false)
  assert.equal(saved.revisionId, '13')
})

test('삭제는 선택된 binding version을 보내고 409를 재시도하지 않는다', async () => {
  let calls = 0
  globalThis.fetch = async (input, options) => {
    calls++
    const url = new URL(String(input))
    assert.equal(options?.method, 'DELETE')
    assert.equal(url.searchParams.get('expectedVersion'), '4')
    assert.equal(url.searchParams.get('gameBuildId'), '20')
    return Response.json({ message: 'Conflict' }, { status: 409 })
  }
  await assert.rejects(deleteGameIdentity('10', identity), (error) => error instanceof ProjectApiError && error.status === 409)
  assert.equal(calls, 1)
})
