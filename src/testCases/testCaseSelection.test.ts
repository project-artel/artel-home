/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_FILTERS, selectTestCases } from './testCaseLibrary.ts'
import {
  describeVisibleSelection,
  pruneToVisible,
  toggleAllVisible,
  toggleSelection,
} from './testCaseSelection.ts'
import { MAX_BULK_SELECTION, type TestCase } from './testCaseTypes.ts'

function makeCase(id: string, extra: Partial<TestCase> = {}): TestCase {
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
    folderId: null,
    evidenceGaps: [],
    ...extra,
  }
}

function sorted(selected: ReadonlySet<string>): string[] {
  return [...selected].sort()
}

test('줄을 한 번 누르면 고르고 다시 누르면 푼다', () => {
  const once = toggleSelection(new Set(), 'a')
  assert.deepEqual(sorted(once), ['a'])
  assert.deepEqual(sorted(toggleSelection(once, 'a')), [])
})

test('토글은 받은 Set 을 바꾸지 않는다', () => {
  const before = new Set(['a'])
  toggleSelection(before, 'b')
  assert.deepEqual(sorted(before), ['a'])
})

test('상한에 닿으면 새 줄은 고르지 못하지만 고른 줄은 풀 수 있다', () => {
  const full = new Set(['a', 'b'])

  assert.equal(toggleSelection(full, 'c', 2), full)
  assert.deepEqual(sorted(toggleSelection(full, 'a', 2)), ['b'])
})

test('전체 선택은 보이는 줄을 모두 고르고, 한 번 더 누르면 모두 푼다', () => {
  const visible = ['a', 'b', 'c']
  const all = toggleAllVisible(new Set(['b']), visible)

  assert.deepEqual(sorted(all), ['a', 'b', 'c'])
  assert.deepEqual(sorted(toggleAllVisible(all, visible)), [])
})

test('일부만 골라 둔 상태에서 전체 선택을 누르면 나머지까지 채운다', () => {
  assert.deepEqual(sorted(toggleAllVisible(new Set(['a']), ['a', 'b'])), ['a', 'b'])
})

test('보이는 줄이 상한보다 많으면 앞에서 상한만큼만 고른다', () => {
  const visible = ['a', 'b', 'c', 'd']
  const capped = toggleAllVisible(new Set(), visible, 2)

  assert.deepEqual(sorted(capped), ['a', 'b'])
  // 상한까지 찬 상태에서 다시 누르면 같은 줄을 또 고르지 않고 비운다.
  assert.deepEqual(sorted(toggleAllVisible(capped, visible, 2)), [])
})

test('보이는 줄이 없으면 전체 선택은 아무것도 고르지 않는다', () => {
  assert.deepEqual(sorted(toggleAllVisible(new Set(), [])), [])
})

test('상한 기본값은 서버의 500건이다', () => {
  assert.equal(MAX_BULK_SELECTION, 500)
  const visible = Array.from({ length: 501 }, (_, index) => String(index))

  assert.equal(toggleAllVisible(new Set(), visible).size, 500)
})

test('전체 선택 checkbox 상태는 none, some, all 이다', () => {
  const visible = ['a', 'b']

  assert.equal(describeVisibleSelection(new Set(), visible), 'none')
  assert.equal(describeVisibleSelection(new Set(['a']), visible), 'some')
  assert.equal(describeVisibleSelection(new Set(['a', 'b']), visible), 'all')
})

test('상한만큼 골랐다면 보이는 줄이 더 많아도 all 이다', () => {
  assert.equal(describeVisibleSelection(new Set(['a', 'b']), ['a', 'b', 'c'], 2), 'all')
})

test('prune 은 보이지 않는 id 만 뺀다', () => {
  const pruned = pruneToVisible(new Set(['a', 'b', 'c']), ['b', 'c', 'd'])
  assert.deepEqual(sorted(pruned), ['b', 'c'])
})

test('prune 은 바뀐 것이 없으면 같은 참조를 돌려준다', () => {
  const selected = new Set(['a', 'b'])

  assert.equal(pruneToVisible(selected, ['a', 'b', 'c']), selected)
  const empty = new Set<string>()
  assert.equal(pruneToVisible(empty, ['a']), empty)
})

test('필터를 바꿔 숨겨진 케이스는 선택에서 빠진다', () => {
  const cases = [
    makeCase('1', { scene: 'Lobby' }),
    makeCase('2', { scene: 'Shop' }),
    makeCase('3', { scene: 'Shop' }),
  ]
  const idsOf = (scene: string) =>
    selectTestCases(cases, { ...NO_FILTERS, scene }, 'NEWEST').map((testCase) => testCase.id)

  const selected = toggleAllVisible(new Set(), idsOf(''))
  assert.deepEqual(sorted(selected), ['1', '2', '3'])

  const afterFilter = pruneToVisible(selected, idsOf('Shop'))
  assert.deepEqual(sorted(afterFilter), ['2', '3'])

  // 필터를 되돌려도 한 번 빠진 줄은 돌아오지 않는다.
  assert.deepEqual(sorted(pruneToVisible(afterFilter, idsOf(''))), ['2', '3'])
})

test('필터가 선택한 줄을 하나도 숨기지 않으면 같은 Set 이 남는다', () => {
  const selected = new Set(['2', '3'])

  assert.equal(pruneToVisible(selected, ['1', '2', '3']), selected)
})
