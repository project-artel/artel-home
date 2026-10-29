import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameInstance } from '../projects/gameTypes.ts'
import type { TestCaseVersionSummary } from '../testCases/testCaseVersions.ts'
import {
  childFolders,
  countRuns,
  countRunsUnder,
  folderPath,
  initialBucket,
  NO_VERSION,
  runsAt,
  runsIn,
  strayBuilds,
  versionMismatch,
} from './runLibrary.ts'
import type { RunFolder } from './testRunFolders.ts'
import type { TestRun } from './testRunApi.ts'

const run = (id: string, gameBuildId: string | null, version = 'v', folderId: string | null = null): TestRun => ({
  id,
  projectId: '1',
  name: id,
  description: null,
  createdAt: '2026-10-14T00:00:00Z',
  gameBuild: gameBuildId === null ? null : { gameBuildId, version, label: null },
  folderId,
  scenarioCount: 0,
  lastQaRun: null,
})

const version = (gameBuildId: string, latest = false): TestCaseVersionSummary => ({
  gameBuildId,
  isEditor: false,
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
  assert.deepEqual(versionMismatch(target, instance('2', '1.5.0')), { run: '1.4.0 · Unknown', game: '1.5.0 · Standalone' })
  assert.equal(versionMismatch(target, instance('99', '1.4.0', true)), null)
  assert.deepEqual(versionMismatch(target, instance('99', '1.5.0', true)), { run: '1.4.0 · Unknown', game: '1.5.0 · Editor' })
  assert.equal(versionMismatch(run('b', null), instance('2', '1.5.0')), null)
})

const folder = (id: string, gameBuildId: string | null, parentId: string | null, name = id): RunFolder => ({ id, gameBuildId, parentId, name })

test('폴더는 자기 버전 칸에만 보이고, 런은 든 폴더 바로 아래에만 보인다', () => {
  const folders = [folder('f1', '1', null, '회귀'), folder('f2', '1', 'f1', '상점'), folder('f3', '2', null, '회귀'), folder('f4', null, null, '옛것')]
  assert.deepEqual(childFolders(folders, '1', null).map((one) => one.id), ['f1'])
  assert.deepEqual(childFolders(folders, '1', 'f1').map((one) => one.id), ['f2'])
  assert.deepEqual(childFolders(folders, NO_VERSION, null).map((one) => one.id), ['f4'])
  const runs = [run('a', '1'), run('b', '1', 'v', 'f1'), run('c', '1', 'v', 'f2'), run('d', '2', 'v', 'f3')]
  assert.deepEqual(runsAt(runs, '1', null).map((one) => one.id), ['a'])
  assert.deepEqual(runsAt(runs, '1', 'f1').map((one) => one.id), ['b'])
  assert.equal(countRunsUnder(runs, folders, 'f1'), 2)
  assert.deepEqual(folderPath(folders, 'f2').map((one) => one.name), ['회귀'])
})
