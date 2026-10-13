/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProjectApiError } from '../projects/projectApi.ts'
import { bulkDeleteTestCases, parseTestCase } from './testCaseApi.ts'

/*
 * 서버의 `bulk-delete` 는 아직 merge 되지 않았다. 여기 있는 응답은 Jira ARTEL-968 이 적은
 * 계약(`{ caseIds }` -> `{ deleted }`)을 손으로 옮긴 것이라, 이 테스트가 증명하는 것은
 * "계약대로 오면 이렇게 보내고 읽는다"이지 "서버가 이렇게 준다"가 아니다.
 */

type Recorded = { url: string; init: RequestInit }

async function withMockedFetch<T>(
  respond: (recorded: Recorded) => Response,
  run: (calls: Recorded[]) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch
  const calls: Recorded[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const recorded = { url: String(input), init: init ?? {} }
    calls.push(recorded)
    return respond(recorded)
  }) as typeof fetch

  try {
    return await run(calls)
  } finally {
    globalThis.fetch = originalFetch
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('일괄 삭제는 caseIds 를 담아 POST 한 번으로 보낸다', async () => {
  await withMockedFetch(
    () => jsonResponse({ deleted: 2 }),
    async (calls) => {
      const deleted = await bulkDeleteTestCases('7', ['11', '12'])

      assert.equal(deleted, 2)
      assert.equal(calls.length, 1)
      assert.ok(calls[0].url.endsWith('/api/projects/7/test-cases/bulk-delete'))
      assert.equal(calls[0].init.method, 'POST')
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { caseIds: ['11', '12'] })
    },
  )
})

test('deleted 가 숫자가 아니면 0 으로 읽는다', async () => {
  await withMockedFetch(
    () => jsonResponse({ deleted: 'many' }),
    async () => assert.equal(await bulkDeleteTestCases('7', ['11']), 0),
  )
})

test('4xx 응답은 ProjectApiError 로 올린다', async () => {
  await withMockedFetch(
    () => jsonResponse({ code: 'VALIDATION_FAILED', message: 'caseIds too long' }, 400),
    async () => {
      await assert.rejects(bulkDeleteTestCases('7', ['11']), (error: unknown) => {
        assert.ok(error instanceof ProjectApiError)
        assert.equal(error.status, 400)
        return true
      })
    },
  )
})

test('0건이나 500건 초과는 요청을 보내지 않는다', async () => {
  await withMockedFetch(
    () => jsonResponse({ deleted: 0 }),
    async (calls) => {
      await assert.rejects(bulkDeleteTestCases('7', []), RangeError)
      await assert.rejects(
        bulkDeleteTestCases('7', Array.from({ length: 501 }, (_, index) => String(index))),
        RangeError,
      )
      assert.equal(calls.length, 0)
    },
  )
})

test('test case 응답의 folderId 는 문자열이거나 null 이고, 없으면 null 이다', () => {
  const base = { id: '1', step: 's', expectedValue: 'e' }

  assert.equal(parseTestCase({ ...base, folderId: '9' })?.folderId, '9')
  assert.equal(parseTestCase({ ...base, folderId: null })?.folderId, null)
  assert.equal(parseTestCase(base)?.folderId, null)
})
