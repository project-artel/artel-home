import assert from 'node:assert/strict'
import test from 'node:test'
import { gameBuildName, parseRunCasesOutsideBuild, parseTestRun } from './testRunApi'

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
