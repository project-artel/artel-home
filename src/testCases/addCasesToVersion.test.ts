import assert from 'node:assert/strict'
import test from 'node:test'
import { addCasesToVersion } from './testCaseVersions'

test('전체 추가 요청만 자동 생성 케이스를 포함한다', async (context) => {
  const requests: { url: string; body: unknown }[] = []
  context.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string) })
    return new Response(JSON.stringify({ caseIds: ['11'] }), { status: 200 })
  })
  assert.deepEqual(await addCasesToVersion('2', '4', ['11', '12'], true), ['11'])
  await addCasesToVersion('2', '4', ['11'])
  assert.ok(requests[0].url.endsWith('/api/projects/2/test-case-versions/4/cases'))
  assert.deepEqual(requests[0].body, { caseIds: ['11', '12'], includeGenerated: true })
  assert.deepEqual(requests[1].body, { caseIds: ['11'], includeGenerated: false })
})

test('버전 추가가 실패하면 성공으로 처리하지 않는다', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 500 }))
  await assert.rejects(addCasesToVersion('2', '4', ['11'], true))
})
