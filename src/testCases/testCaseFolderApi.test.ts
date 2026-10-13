/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProjectApiError } from '../projects/projectApi.ts'
import {
  createTestCaseFolder,
  deleteTestCaseFolder,
  listTestCaseFolders,
  parseTestCaseFolders,
  updateTestCaseFolder,
} from './testCaseFolderApi.ts'
import { moveTestCases } from './testCaseApi.ts'

/*
 * 서버의 `test-case-folders` 와 `move` 는 아직 merge 되지 않았다. 여기 있는 응답은 Jira
 * ARTEL-970 의 계약을 손으로 옮긴 것이라, 이 테스트가 증명하는 것은 "계약대로 오면 이렇게
 * 보내고 읽는다"이지 "서버가 이렇게 준다"가 아니다.
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

const documented = { id: '3', parentId: null, name: 'Arena', contentMapId: '9', gameBuildId: '4' }

test('폴더 목록은 items 로 싸여 오고 id 는 문자열이다', () => {
  const folders = parseTestCaseFolders({ items: [documented, { id: '4', parentId: '3', name: 'Pit', contentMapId: null, gameBuildId: null }] })

  assert.deepEqual(folders[0], { id: '3', parentId: null, name: 'Arena', contentMapId: '9', gameBuildId: '4' })
  assert.equal(folders[1].parentId, '3')
  assert.equal(folders[1].contentMapId, null)
})

test('id 나 이름이 없는 폴더 하나만 버린다', () => {
  const folders = parseTestCaseFolders({ items: [documented, { id: '', name: 'x' }, { id: '5' }, 'junk'] })

  assert.deepEqual(folders.map((folder) => folder.id), ['3'])
})

test('봉투를 못 읽으면 빈 목록이다', () => {
  assert.deepEqual(parseTestCaseFolders({ nope: true }), [])
  assert.deepEqual(parseTestCaseFolders(null), [])
})

test('폴더 목록을 GET 으로 읽는다', async () => {
  await withMockedFetch(
    () => jsonResponse({ items: [documented] }),
    async (calls) => {
      const folders = await listTestCaseFolders('7')

      assert.equal(folders.length, 1)
      assert.ok(calls[0].url.endsWith('/api/projects/7/test-case-folders'))
    },
  )
})

test('폴더 만들기는 name 과 parentId 를 POST 로 보낸다', async () => {
  await withMockedFetch(
    () => jsonResponse(documented, 201),
    async (calls) => {
      const created = await createTestCaseFolder('7', { name: 'Arena', parentId: null })

      assert.equal(created.id, '3')
      assert.equal(calls[0].init.method, 'POST')
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { name: 'Arena', parentId: null })
    },
  )
})

test('이름 변경과 이동은 PUT 으로 보낸다', async () => {
  await withMockedFetch(
    () => jsonResponse(documented),
    async (calls) => {
      await updateTestCaseFolder('7', '3', { name: 'Arena', parentId: '1' })

      assert.equal(calls[0].init.method, 'PUT')
      assert.ok(calls[0].url.endsWith('/api/projects/7/test-case-folders/3'))
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { name: 'Arena', parentId: '1' })
    },
  )
})

test('같은 이름이면 409, 자기 하위로 옮기면 400 이 ProjectApiError 로 올라온다', async () => {
  for (const status of [409, 400]) {
    await withMockedFetch(
      () => jsonResponse({ code: 'X', message: 'no' }, status),
      async () => {
        await assert.rejects(
          updateTestCaseFolder('7', '3', { name: 'Arena', parentId: '4' }),
          (error: unknown) => error instanceof ProjectApiError && error.status === status,
        )
      },
    )
  }
})

test('폴더 삭제는 DELETE 이고 본문 없는 204 를 받아들인다', async () => {
  await withMockedFetch(
    () => new Response(null, { status: 204 }),
    async (calls) => {
      await deleteTestCaseFolder('7', '3')

      assert.equal(calls[0].init.method, 'DELETE')
    },
  )
})

test('test case 이동은 caseIds 와 folderId 를 보내고, 폴더 없음은 null 이다', async () => {
  await withMockedFetch(
    () => jsonResponse({ moved: 2 }),
    async (calls) => {
      assert.equal(await moveTestCases('7', ['11', '12'], '3'), 2)
      await moveTestCases('7', ['11'], null)

      assert.ok(calls[0].url.endsWith('/api/projects/7/test-cases/move'))
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { caseIds: ['11', '12'], folderId: '3' })
      assert.deepEqual(JSON.parse(String(calls[1].init.body)), { caseIds: ['11'], folderId: null })
    },
  )
})

test('이동도 0건이나 500건 초과는 요청을 보내지 않는다', async () => {
  await withMockedFetch(
    () => jsonResponse({ moved: 0 }),
    async (calls) => {
      await assert.rejects(moveTestCases('7', [], null), RangeError)
      assert.equal(calls.length, 0)
    },
  )
})
