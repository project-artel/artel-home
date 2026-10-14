/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_FILTERS, selectTestCases } from './testCaseLibrary.ts'
import type { TestCaseFolder } from './testCaseFolderApi.ts'
import {
  ALL_FOLDERS,
  buildFolderTree,
  collectDescendantIds,
  countCasesByFolder,
  countFromFolders,
  countFolderDescendants,
  effectiveFolderSelection,
  filterByFolder,
  flattenFolderTree,
  listMoveTargets,
  NO_FOLDER,
  parseFolderSelection,
  resolveFolderSelection,
  toFolderParam,
} from './testCaseFolders.ts'
import type { TestCase } from './testCaseTypes.ts'

function makeFolder(id: string, name: string, parentId: string | null = null): TestCaseFolder {
  return { id, parentId, name, caseCount: 0, visibleCount: null }
}

function makeCase(id: string, folderId: string | null, extra: Partial<TestCase> = {}): TestCase {
  return {
    id,
    projectId: '1',
    scene: 'Lobby',
    step: `step ${id}`,
    precondition: null,
    expectedValue: 'something happens',
    status: null,
    verificationStatus: 'DRAFT',
    lastVerifiedBuildId: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    folderId,
    evidenceGaps: [],
    ...extra,
  }
}

// 1 Combat / (2 Boss, 3 Arena / 4 Pit) , 5 Alpha
const folders = [
  makeFolder('1', 'Combat'),
  makeFolder('2', 'Boss', '1'),
  makeFolder('3', 'Arena', '1'),
  makeFolder('4', 'Pit', '3'),
  makeFolder('5', 'Alpha'),
]

function idsOf(cases: TestCase[]): string[] {
  return cases.map((testCase) => testCase.id)
}

test('평면 목록을 이름순 중첩 tree 로 세운다', () => {
  const roots = buildFolderTree(folders)

  assert.deepEqual(roots.map((node) => node.folder.name), ['Alpha', 'Combat'])
  assert.deepEqual(roots[1].children.map((node) => node.folder.name), ['Arena', 'Boss'])
  assert.deepEqual(roots[1].children[0].children.map((node) => node.folder.name), ['Pit'])
})

test('tree 를 읽는 순서의 행과 깊이로 편다', () => {
  const rows = flattenFolderTree(buildFolderTree(folders))

  assert.deepEqual(
    rows.map((row) => [row.folder.name, row.depth]),
    [['Alpha', 0], ['Combat', 0], ['Arena', 1], ['Pit', 2], ['Boss', 1]],
  )
})

test('부모가 목록에 없는 폴더는 최상위에 놓는다', () => {
  const roots = buildFolderTree([makeFolder('9', 'Lost', '404'), makeFolder('1', 'Root')])

  assert.deepEqual(roots.map((node) => node.folder.name), ['Lost', 'Root'])
})

test('순환하는 폴더도 한 번씩만 그린다', () => {
  const cyclic = [makeFolder('1', 'A', '2'), makeFolder('2', 'B', '1'), makeFolder('3', 'C', '1')]
  const rows = flattenFolderTree(buildFolderTree(cyclic))

  assert.deepEqual(rows.map((row) => row.folder.id).sort(), ['1', '2', '3'])
})

test('하위 폴더 id 는 자기를 빼고 모든 깊이를 모은다', () => {
  assert.deepEqual([...collectDescendantIds(folders, '1')].sort(), ['2', '3', '4'])
  assert.deepEqual([...collectDescendantIds(folders, '4')], [])
  assert.equal(countFolderDescendants(folders, '1'), 3)
})

test('순환이 있어도 하위 폴더 모으기가 끝난다', () => {
  const cyclic = [makeFolder('1', 'A', '2'), makeFolder('2', 'B', '1')]

  assert.deepEqual([...collectDescendantIds(cyclic, '1')], ['2'])
})

const cases = [
  makeCase('c1', null),
  makeCase('c2', '1'),
  makeCase('c3', '2'),
  makeCase('c4', '4'),
  makeCase('c5', '5'),
]

test('전체는 모든 test case 를, 폴더 없음은 폴더가 없는 것만 낸다', () => {
  assert.deepEqual(idsOf(filterByFolder(cases, ALL_FOLDERS, folders)), ['c1', 'c2', 'c3', 'c4', 'c5'])
  assert.deepEqual(idsOf(filterByFolder(cases, NO_FOLDER, folders)), ['c1'])
})

test('폴더를 고르면 그 폴더와 하위 폴더의 test case 가 보인다', () => {
  const combat = filterByFolder(cases, { kind: 'folder', id: '1' }, folders)
  assert.deepEqual(idsOf(combat), ['c2', 'c3', 'c4'])

  const boss = filterByFolder(cases, { kind: 'folder', id: '2' }, folders)
  assert.deepEqual(idsOf(boss), ['c3'])
})

test('폴더 필터는 scene, 상태, 검색어 필터와 함께 걸린다', () => {
  const mixed = [
    makeCase('a', '1', { scene: 'Shop' }),
    makeCase('b', '1', { scene: 'Lobby' }),
    makeCase('c', '5', { scene: 'Shop' }),
  ]
  const inCombat = filterByFolder(mixed, { kind: 'folder', id: '1' }, folders)

  assert.deepEqual(
    idsOf(selectTestCases(inCombat, { ...NO_FILTERS, scene: 'Shop' }, 'NEWEST')),
    ['a'],
  )
})

test('폴더 건수는 하위 폴더까지 합치고 폴더 필터의 길이와 같다', () => {
  const counts = countCasesByFolder(cases, folders)

  assert.equal(counts.total, 5)
  assert.equal(counts.unfiled, 1)
  assert.equal(counts.byFolder.get('1'), 3)
  assert.equal(counts.byFolder.get('3'), 1)
  assert.equal(counts.byFolder.get('5'), 1)
  assert.equal(counts.byFolder.get('1'), filterByFolder(cases, { kind: 'folder', id: '1' }, folders).length)
})

test('폴더를 옮길 때 자기와 하위 폴더는 부모 후보에서 빠진다', () => {
  const targets = listMoveTargets(folders, '1').map((row) => row.folder.id)
  assert.deepEqual(targets, ['5'])

  const forPit = listMoveTargets(folders, '4').map((row) => row.folder.id)
  assert.deepEqual(forPit, ['5', '1', '3', '2'])
})

test('주소의 folder 값과 선택이 서로 되돌아온다', () => {
  assert.deepEqual(parseFolderSelection(null), ALL_FOLDERS)
  assert.deepEqual(parseFolderSelection(''), ALL_FOLDERS)
  assert.deepEqual(parseFolderSelection('none'), NO_FOLDER)
  assert.deepEqual(parseFolderSelection('12'), { kind: 'folder', id: '12' })

  assert.equal(toFolderParam(ALL_FOLDERS), null)
  assert.equal(toFolderParam(NO_FOLDER), 'none')
  assert.equal(toFolderParam({ kind: 'folder', id: '12' }), '12')
})

test('없는 폴더를 가리키는 선택은 전체로 돌아간다', () => {
  assert.deepEqual(resolveFolderSelection({ kind: 'folder', id: '404' }, folders), ALL_FOLDERS)
  assert.deepEqual(
    resolveFolderSelection({ kind: 'folder', id: '2' }, folders),
    { kind: 'folder', id: '2' },
  )
  assert.deepEqual(resolveFolderSelection(NO_FOLDER, folders), NO_FOLDER)
})

test('폴더 목록을 읽기 전에는 폴더 id 를 걸지 않고, 읽은 뒤에야 없는 id 를 전체로 돌린다', () => {
  const requested = { kind: 'folder', id: '2' } as const

  assert.deepEqual(effectiveFolderSelection(requested, 'loading', []), ALL_FOLDERS)
  assert.deepEqual(effectiveFolderSelection(requested, 'failed', []), ALL_FOLDERS)
  assert.deepEqual(effectiveFolderSelection(requested, 'ready', folders), requested)
  assert.deepEqual(effectiveFolderSelection({ kind: 'folder', id: '404' }, 'ready', folders), ALL_FOLDERS)
  assert.deepEqual(effectiveFolderSelection(NO_FOLDER, 'loading', []), NO_FOLDER)
})

test('폴더 수는 서버가 센 바로 담긴 수이고, 버전으로 읽었으면 그 버전에서 보이는 수다', () => {
  const counts = countFromFolders(
    [makeCase('1', null), makeCase('2', '7'), makeCase('3', null)],
    [
      { ...makeFolder('7', 'Combat'), caseCount: 5, visibleCount: 3 },
      { ...makeFolder('8', 'Shop'), caseCount: 2, visibleCount: null },
    ],
  )

  assert.equal(counts.total, 3)
  assert.equal(counts.unfiled, 2)
  assert.equal(counts.byFolder.get('7'), 3)
  assert.equal(counts.byFolder.get('8'), 2)
})
