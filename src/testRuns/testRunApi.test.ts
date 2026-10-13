import assert from 'node:assert/strict'
import test from 'node:test'
import { gameBuildName, parseTestRun } from './testRunApi'

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
