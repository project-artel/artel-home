import assert from 'node:assert/strict'
import test from 'node:test'
import { gameBuildName, listTestRuns, parseRunCasesOutsideBuild, parseTestRun } from './testRunApi'
import { ProjectApiError } from '../projects/projectApi'

test('런 목록을 다시 조회하면 서버가 집계한 최신 시나리오 수를 읽는다', async (context) => {
  let scenarioCount = 0
  const fetch = context.mock.method(globalThis, 'fetch', async () => Response.json({
    items: [{ id: '32', projectId: '10', name: '런', scenarioCount }],
  }))
  assert.equal((await listTestRuns('10'))[0].scenarioCount, 0)
  scenarioCount = 1
  assert.equal((await listTestRuns('10'))[0].scenarioCount, 1)
  assert.equal(fetch.mock.callCount(), 2)
})

test('런 목록 조회 실패를 빈 런 목록으로 처리하지 않는다', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }))
  await assert.rejects(listTestRuns('10'), (error: unknown) =>
    error instanceof ProjectApiError && error.status === 503)
})

test('TR 은 만든 게임 버전을 함께 읽고, 없으면 null 이다', () => {
  const withBuild = parseTestRun({
    id: '1', projectId: '2', name: '런', description: null, createdAt: '2026-10-13T00:00:00Z',
    gameBuild: { gameBuildId: '3', version: '1.2.0', label: '  ' },
  })
  const without = parseTestRun({ id: '4', projectId: '2', name: '옛 런', description: null, createdAt: '' })

  assert.deepEqual(withBuild?.gameBuild, { gameBuildId: '3', version: '1.2.0', label: '  ' })
  assert.equal(gameBuildName(withBuild!.gameBuild!), '1.2.0')
  assert.equal(without?.gameBuild, null)
})

test('게임 버전에 없는 케이스는 id 목록으로 읽고, 게임 버전을 모르면 빈 목록이다', () => {
  assert.deepEqual(
    parseRunCasesOutsideBuild({ testRunId: '1', gameBuildId: '7', testCaseIds: ['3', '9'] }),
    { gameBuildId: '7', testCaseIds: ['3', '9'] },
  )
  assert.deepEqual(parseRunCasesOutsideBuild({ testRunId: '1', gameBuildId: null, testCaseIds: [] }), { gameBuildId: null, testCaseIds: [] })
  assert.deepEqual(parseRunCasesOutsideBuild(null), { gameBuildId: null, testCaseIds: [] })
})
