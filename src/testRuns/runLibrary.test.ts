import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameInstance } from '../projects/gameTypes.ts'
import type { TestCaseVersionSummary } from '../testCases/testCaseVersions.ts'
import { countRuns, initialBucket, NO_VERSION, runsIn, strayBuilds, versionMismatch } from './runLibrary.ts'
import type { TestRun } from './testRunApi.ts'

const run = (id: string, gameBuildId: string | null, version = 'v'): TestRun => ({
  id,
  projectId: '1',
  name: id,
  description: null,
  createdAt: '2026-10-14T00:00:00Z',
  gameBuild: gameBuildId === null ? null : { gameBuildId, version, label: null },
  scenarioCount: 0,
  lastQaRun: null,
})

const version = (gameBuildId: string, latest = false): TestCaseVersionSummary => ({
  gameBuildId,
  version: `v${gameBuildId}`,
  label: null,
  createdAt: '2026-10-14T00:00:00Z',
  latest,
  total: 0,
  counts: { DRAFT: 0, VERIFIED: 0, FAILED: 0, REGRESSION: 0, BROKEN: 0 },
  groupId: null,
  hidden: false,
})

test('TR 은 버전 칸에, 버전 없는 TR 은 버전 없음 칸에 든다', () => {
  const runs = [run('a', '1'), run('b', '1'), run('c', null)]
  assert.deepEqual(runsIn(runs, '1').map((one) => one.id), ['a', 'b'])
  assert.deepEqual(runsIn(runs, NO_VERSION).map((one) => one.id), ['c'])
  assert.deepEqual([...countRuns(runs)], [['1', 2], [NO_VERSION, 1]])
})

test('처음 고를 칸은 주소의 칸, 없으면 현재 버전, 그것도 없으면 버전 없음이다', () => {
  const versions = [version('2', true), version('1')]
  assert.equal(initialBucket('1', versions, []), '1')
  assert.equal(initialBucket('9', versions, []), '2')
  assert.equal(initialBucket('9', versions, [run('a', '9')]), '9')
  assert.equal(initialBucket(null, [], []), NO_VERSION)
})

test('라이브러리 목록에 없는 빌드를 가리키는 TR 의 빌드를 따로 모은다', () => {
  assert.deepEqual(strayBuilds([run('a', '1'), run('b', '7', '0.7'), run('c', '7', '0.7')], [version('1')]).map((one) => one.gameBuildId), ['7'])
})

test('켜진 게임이 TR 버전과 다르면 둘을 알리고, editor 는 버전 문자열로 견준다', () => {
  const instance = (gameBuildId: string, versionName: string, isEditor = false): GameInstance => ({
    id: 'i', projectId: '1', name: 'i', platform: 'UNITY', connected: true, lastConnectedAt: '', createdAt: '', updatedAt: '',
    lastGameBuild: { gameBuildId, version: versionName, label: null, isEditor },
  })
  const target = run('a', '1', '1.4.0')
  assert.equal(versionMismatch(target, instance('1', '1.4.0')), null)
  assert.deepEqual(versionMismatch(target, instance('2', '1.5.0')), { run: '1.4.0', game: '1.5.0' })
  assert.equal(versionMismatch(target, instance('99', '1.4.0', true)), null)
  assert.deepEqual(versionMismatch(target, instance('99', '1.5.0', true)), { run: '1.4.0', game: '1.5.0' })
  assert.equal(versionMismatch(run('b', null), instance('2', '1.5.0')), null)
})
