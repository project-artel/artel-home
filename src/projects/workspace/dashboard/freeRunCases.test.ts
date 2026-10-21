import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { TestCase, VerificationStatus } from '../../../testCases/testCaseTypes'
import type { VersionCaseRow } from '../../../testCases/testCaseVersions'
import { countScenes, defaultPicked, filterPickItems, pickItems } from './freeRunCases'

const row = (id: string, scene: string, step: string, before: VerificationStatus | null): VersionCaseRow => ({
  testCase: { id, scene, step, expectedValue: '', precondition: null } as TestCase,
  origin: 'MAP',
  verificationStatus: 'DRAFT',
  compareVerificationStatus: before,
  presence: before === null ? 'ONLY_THIS' : 'BOTH',
})

const rows = [
  row('1', 'Map', '맵을 연다', null),
  row('2', 'Battle', '카드를 끈다', 'FAILED'),
  row('3', 'Map', '노드를 누른다', 'VERIFIED'),
  row('4', 'Battle', '적을 친다', 'FAILED'),
  row('5', 'Ending', '엔딩을 본다', null),
  row('6', 'Battle', '판정된 TC', 'VERIFIED'),
]
const remaining = { wasFailing: ['2', '4'], wasPassing: ['3'], firstTime: ['1', '5'] }

describe('pickItems', () => {
  it('orders by group, keeps row order inside, and leaves out judged cases', () => {
    const items = pickItems(rows, remaining)
    assert.deepEqual(items.map((item) => [item.testCase.id, item.group, item.before]), [
      ['2', 'wasFailing', 'FAILED'],
      ['4', 'wasFailing', 'FAILED'],
      ['3', 'wasPassing', 'VERIFIED'],
      ['1', 'firstTime', null],
      ['5', 'firstTime', null],
    ])
  })

  it('picks the cases to check first, or nothing when every case is new', () => {
    assert.deepEqual([...defaultPicked(remaining)], ['2', '4', '3'])
    assert.equal(defaultPicked({ wasFailing: [], wasPassing: [], firstTime: ['1'] }).size, 0)
  })
})

describe('filterPickItems', () => {
  const items = pickItems(rows, remaining)
  const ids = (list: { testCase: TestCase }[]) => list.map((item) => item.testCase.id)

  it('narrows by group, scene and every word of the query', () => {
    assert.deepEqual(ids(filterPickItems(items, { group: 'wasFailing', scene: null, query: '' }, new Set())), ['2', '4'])
    assert.deepEqual(ids(filterPickItems(items, { group: 'all', scene: 'Map', query: '' }, new Set())), ['3', '1'])
    assert.deepEqual(ids(filterPickItems(items, { group: 'all', scene: null, query: 'battle 카드' }, new Set())), ['2'])
  })

  it('shows only what is picked under the picked filter', () => {
    assert.deepEqual(ids(filterPickItems(items, { group: 'picked', scene: null, query: '' }, new Set(['5', '2']))), ['2', '5'])
  })

  it('counts scenes inside the group and query, most first', () => {
    assert.deepEqual(countScenes(items, { group: 'all', query: '' }, new Set()), [
      { scene: 'Battle', count: 2 },
      { scene: 'Map', count: 2 },
      { scene: 'Ending', count: 1 },
    ])
    assert.deepEqual(countScenes(items, { group: 'firstTime', query: '' }, new Set()), [
      { scene: 'Ending', count: 1 },
      { scene: 'Map', count: 1 },
    ])
  })
})
