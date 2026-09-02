import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameBuild } from '../projects/gameTypes'
import {
  countScenes,
  describeVerifiedBuild,
  hasActiveFilters,
  NO_FILTERS,
  selectTestCases,
  tallyTestCases,
} from './testCaseLibrary'
import type { TestCase, VerificationStatus } from './testCaseTypes'

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
    evidenceGaps: [],
    ...extra,
  }
}

function makeBuild(id: string, extra: Partial<GameBuild> = {}): GameBuild {
  return {
    id,
    projectId: '1',
    version: '1.4.0',
    label: null,
    notes: null,
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z',
    ...extra,
  }
}

function idsOf(cases: TestCase[]): string[] {
  return cases.map((testCase) => testCase.id)
}

test('필터가 하나도 없으면 받은 목록을 그대로 낸다', () => {
  const cases = [makeCase('1'), makeCase('2')]

  assert.deepEqual(idsOf(selectTestCases(cases, NO_FILTERS, 'NEWEST')), ['1', '2'])
  assert.equal(hasActiveFilters(NO_FILTERS), false)
})

test('검색어는 본문 네 필드에 걸린다', () => {
  const cases = [
    makeCase('1', { step: '상점을 연다' }),
    makeCase('2', { scene: 'Shop' }),
    makeCase('3', { expectedValue: '상점 목록이 보인다' }),
    makeCase('4', { precondition: '상점 해금 상태' }),
    makeCase('5', { step: '전투를 시작한다', scene: 'Battle', expectedValue: '적이 나온다' }),
  ]

  assert.deepEqual(idsOf(selectTestCases(cases, { ...NO_FILTERS, query: '상점' }, 'NEWEST')), [
    '1',
    '3',
    '4',
  ])
  assert.deepEqual(idsOf(selectTestCases(cases, { ...NO_FILTERS, query: 'shop' }, 'NEWEST')), ['2'])
})

test('검색어의 앞뒤 공백은 무시하고, 빈 검색어는 아무것도 거르지 않는다', () => {
  const cases = [makeCase('1', { step: '상점을 연다' }), makeCase('2', { step: '전투' })]

  assert.deepEqual(idsOf(selectTestCases(cases, { ...NO_FILTERS, query: '  상점  ' }, 'NEWEST')), ['1'])
  assert.deepEqual(idsOf(selectTestCases(cases, { ...NO_FILTERS, query: '   ' }, 'NEWEST')), ['1', '2'])
  assert.equal(hasActiveFilters({ ...NO_FILTERS, query: '   ' }), false)
})

test('씬과 검증 상태 필터는 함께 걸린다', () => {
  const cases = [
    makeCase('1', { scene: 'Lobby', verificationStatus: 'BROKEN' }),
    makeCase('2', { scene: 'Lobby', verificationStatus: 'VERIFIED' }),
    makeCase('3', { scene: 'Shop', verificationStatus: 'BROKEN' }),
  ]

  const filters = { query: '', scene: 'Lobby', status: 'BROKEN' as VerificationStatus }
  assert.deepEqual(idsOf(selectTestCases(cases, filters, 'NEWEST')), ['1'])
  assert.equal(hasActiveFilters(filters), true)
})

test('FAILING_FIRST 는 실패·미검증·통과 순으로 세우고 같은 상태 안에서는 받은 순서를 지킨다', () => {
  const cases = [
    makeCase('1', { verificationStatus: 'VERIFIED' }),
    makeCase('2', { verificationStatus: 'DRAFT' }),
    makeCase('3', { verificationStatus: 'BROKEN' }),
    makeCase('4', { verificationStatus: 'VERIFIED' }),
    makeCase('5', { verificationStatus: 'BROKEN' }),
  ]

  assert.deepEqual(idsOf(selectTestCases(cases, NO_FILTERS, 'FAILING_FIRST')), [
    '3',
    '5',
    '2',
    '1',
    '4',
  ])
})

test('정렬이 원본 배열을 뒤집지 않는다', () => {
  const cases = [
    makeCase('1', { verificationStatus: 'VERIFIED' }),
    makeCase('2', { verificationStatus: 'BROKEN' }),
  ]

  selectTestCases(cases, NO_FILTERS, 'FAILING_FIRST')

  assert.deepEqual(idsOf(cases), ['1', '2'])
})

test('씬 집계는 많은 것부터, 같은 수면 이름순이고 빈 씬은 세지 않는다', () => {
  const cases = [
    makeCase('1', { scene: 'Shop' }),
    makeCase('2', { scene: 'Lobby' }),
    makeCase('3', { scene: 'Shop' }),
    makeCase('4', { scene: 'Battle' }),
    makeCase('5', { scene: '   ' }),
  ]

  assert.deepEqual(countScenes(cases), [
    { scene: 'Shop', count: 2 },
    { scene: 'Battle', count: 1 },
    { scene: 'Lobby', count: 1 },
  ])
})

test('집계는 세 상태를 각각 센다', () => {
  const cases = [
    makeCase('1', { verificationStatus: 'VERIFIED' }),
    makeCase('2', { verificationStatus: 'BROKEN' }),
    makeCase('3', { verificationStatus: 'BROKEN' }),
    makeCase('4', { verificationStatus: 'DRAFT' }),
  ]

  assert.deepEqual(tallyTestCases(cases), { total: 4, verified: 1, draft: 1, broken: 2 })
})

test('build 이름은 label 을 쓰고, 없으면 version 으로 떨어진다', () => {
  const builds = [
    makeBuild('10', { label: '1차 QA 빌드' }),
    makeBuild('11', { label: '   ', version: '1.5.2' }),
  ]

  assert.equal(describeVerifiedBuild('10', builds), '1차 QA 빌드')
  assert.equal(describeVerifiedBuild('11', builds), '1.5.2')
})

test('가리키는 build 가 없으면 이름 대신 null 을 낸다', () => {
  assert.equal(describeVerifiedBuild(null, [makeBuild('10')]), null)
  assert.equal(describeVerifiedBuild('99', [makeBuild('10')]), null)
})
