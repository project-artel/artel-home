/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProjectApiError } from '../projects/projectApi.ts'
import { generateContentMapTestCases, parseGeneratedTestCases } from './generateContentMapTestCases.ts'
import {
  describeGenerationBlock,
  testCaseLibraryPath,
} from './contentMapTestCases.ts'
import type { ContentMapView } from './contentMapTypes.ts'

/*
 * 서버의 `content-map/test-cases` 는 아직 merge 되지 않았다. 여기 있는 응답은 Jira ARTEL-972 의
 * 계약을 손으로 옮긴 것이라, 이 테스트가 증명하는 것은 "계약대로 오면 이렇게 보내고 읽는다"
 * 이지 "서버가 이렇게 준다"가 아니다.
 */

function makeView(
  contentMap: ContentMapView['contentMap'],
  pendingDocuments: unknown[] = [],
): ContentMapView {
  return {
    contentMap,
    scenes: [],
    edges: [],
    screenTransitions: [],
    gaps: [],
    verification: { verified: 0, total: 0 },
    pendingDocuments,
  } as unknown as ContentMapView
}

const header = (ingestedAt: string | null) =>
  ({ id: '1', ingestedAt }) as unknown as NonNullable<ContentMapView['contentMap']>

test('content map 이 없으면 notUploaded, 문서가 없으면 noDocuments, 문서가 안 읽혔으면 notIngested, 적재됐으면 막지 않는다', () => {
  assert.equal(describeGenerationBlock(makeView(null)), 'notUploaded')
  // content_map 행은 있지만 올라온 문서가 없다. 로컬 빌드 1.0 이 이 모양이다.
  assert.equal(describeGenerationBlock(makeView(header(null))), 'noDocuments')
  assert.equal(
    describeGenerationBlock(makeView(header(null), [{ documentId: '5', ingestFailedAt: null }])),
    'notIngested',
  )
  assert.equal(describeGenerationBlock(makeView(header('2026-10-13T00:00:00Z'))), null)
})

test('라이브러리 주소는 폴더 id 를 인코딩해 싣고, 폴더를 모르면 싣지 않는다', () => {
  assert.equal(testCaseLibraryPath('7', '31'), '/projects/7/test-cases?folder=31')
  assert.equal(testCaseLibraryPath('7', null), '/projects/7/test-cases')
  assert.equal(testCaseLibraryPath('a/b', 'x y'), '/projects/a%2Fb/test-cases?folder=x%20y')
})

test('명세대로의 응답을 읽고, 이상한 값은 0 과 null 로 낮춘다', () => {
  assert.deepEqual(
    parseGeneratedTestCases({ folderId: '31', created: 12, updated: 3, deleted: 1, broken: 2 }),
    { folderId: '31', created: 12, updated: 3, deleted: 1, broken: 2, carriedOver: 0 },
  )
  assert.deepEqual(
    parseGeneratedTestCases({ folderId: '', created: 'many', updated: -1, broken: null }),
    { folderId: null, created: 0, updated: 0, deleted: 0, broken: 0, carriedOver: 0 },
  )
  assert.equal(parseGeneratedTestCases(null).folderId, null)
})

test('생성 요청은 build 경로에 본문 없이 POST 하고, 4xx 는 ProjectApiError 로 올린다', async () => {
  const originalFetch = globalThis.fetch
  const calls: { url: string; init: RequestInit }[] = []
  let status = 200
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return new Response(
      JSON.stringify(status === 200 ? { folderId: '31', created: 1, updated: 0, deleted: 0, broken: 0 } : { message: 'no' }),
      { status, headers: { 'Content-Type': 'application/json' } },
    )
  }) as typeof fetch

  try {
    const result = await generateContentMapTestCases('7', '4')
    assert.equal(result.created, 1)
    assert.ok(calls[0].url.endsWith('/api/projects/7/game-builds/4/content-map/test-cases'))
    assert.equal(calls[0].init.method, 'POST')

    status = 409
    await assert.rejects(
      generateContentMapTestCases('7', '4'),
      (error: unknown) => error instanceof ProjectApiError && error.status === 409,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('본문을 읽을 수 없는 200 응답은 ProjectApiError 가 된다', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response('<html>', { status: 200 })) as typeof fetch
  try {
    await assert.rejects(generateContentMapTestCases('7', '4'), (error: unknown) => {
      assert.ok(error instanceof ProjectApiError)
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})
