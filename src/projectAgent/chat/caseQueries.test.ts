/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CaseVerdictHistoryItem } from '../../testCases/testCaseApi.ts'
import type { TestCase } from '../../testCases/testCaseTypes.ts'
import type { TestCaseVersionSummary } from '../../testCases/testCaseVersions.ts'
import { buildCaseList, filterCases, folderCaseIdsOf, pageRows, trimBuildVersions, trimCaseBuilds } from './caseQueries.ts'
import { runQuery } from './queries.ts'

function makeCase(index: number, patch: Partial<TestCase> = {}): TestCase {
  return {
    id: String(index),
    projectId: '1',
    scene: 'Lobby',
    step: `step ${index}`,
    precondition: null,
    expectedValue: `expected ${index}`,
    status: 'ready',
    verificationStatus: 'DRAFT',
    lastVerifiedBuildId: null,
    createdAt: 'c',
    folderId: null,
    evidenceGaps: [],
    origin: 'MAP',
    ...patch,
  }
}

function version(gameBuildId: string, patch: Partial<TestCaseVersionSummary> = {}): TestCaseVersionSummary {
  return {
    gameBuildId,
    version: `1.${gameBuildId}`,
    label: null,
    createdAt: `2026-10-0${gameBuildId}`,
    latest: false,
    isEditor: false,
    total: 3,
    counts: { DRAFT: 1, VERIFIED: 2, FAILED: 0, REGRESSION: 0, BROKEN: 0 },
    groupId: null,
    hidden: false,
    ...patch,
  }
}

test('pageRows pages by offset and flags the remainder', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index)
  const first = pageRows(rows, 0)
  assert.equal(first.rows.length, 20)
  assert.equal(first.truncated, true)
  assert.equal(first.total, 45)
  const last = pageRows(rows, 40)
  assert.deepEqual(last.rows, [40, 41, 42, 43, 44])
  assert.equal(last.truncated, false)
  assert.equal(pageRows(rows, -5).offset, 0)
})

test('filterCases applies ids, search, scene, status and folder together', () => {
  const cases = [
    makeCase(1, { scene: 'Shop', verificationStatus: 'VERIFIED' }),
    makeCase(2, { scene: 'Shop', step: 'Buy sword' }),
    makeCase(3, { precondition: 'has Sword' }),
  ]
  assert.deepEqual(filterCases(cases, { scene: 'Shop' }).map((one) => one.id), ['1', '2'])
  assert.deepEqual(filterCases(cases, { search: 'SWORD' }).map((one) => one.id), ['2', '3'])
  assert.deepEqual(filterCases(cases, { verificationStatus: 'VERIFIED' }).map((one) => one.id), ['1'])
  assert.deepEqual(filterCases(cases, { ids: ['3', '1'] }).map((one) => one.id), ['1', '3'])
  assert.deepEqual(filterCases(cases, { folderCaseIds: new Set(['2']) }).map((one) => one.id), ['2'])
})

test('buildCaseList resolves folder and build names and states the build scope', () => {
  const lookups = {
    folders: [{ id: '9', parentId: null, name: 'Smoke', caseCount: 1, visibleCount: null }],
    versions: [version('5', { label: 'Beta' })],
  }
  const cases = [makeCase(1, { folderId: '9', lastVerifiedBuildId: '5', origin: undefined })]
  const unscoped = buildCaseList(cases, {}, 0, lookups, undefined)
  assert.equal(unscoped.scope, null)
  assert.equal(unscoped.rows[0].folderName, 'Smoke')
  assert.equal(unscoped.rows[0].lastVerifiedBuild, '1.5 · Standalone · Beta')
  assert.equal(unscoped.rows[0].origin, null)
  assert.equal(unscoped.rows[0].specStatus, 'ready')
  const scoped = buildCaseList(cases, {}, 0, lookups, '5')
  assert.equal(scoped.scope?.build, '1.5 · Standalone · Beta')
  assert.match(scoped.scope?.note ?? '', /Only cases in build 1\.5 · Standalone · Beta/)
  assert.equal(buildCaseList([makeCase(2, { lastVerifiedBuildId: '77' })], {}, 0, lookups, undefined).rows[0].lastVerifiedBuild, '77')
})

test('trimBuildVersions lists the newest build first with its case counts', () => {
  const result = trimBuildVersions([version('1'), version('3', { latest: true }), version('2')])
  assert.deepEqual(result.rows.map((row) => row.gameBuildId), ['3', '2', '1'])
  assert.equal(result.rows[0].latest, true)
  assert.equal(result.rows[0].caseCount, 3)
})

test('trimCaseBuilds puts the newest verdict first', () => {
  const item = (gameBuildId: string, label: string | null): CaseVerdictHistoryItem => ({
    testCaseId: gameBuildId,
    gameBuildId,
    version: `1.${gameBuildId}`,
    label,
    verificationStatus: gameBuildId === '1' ? 'VERIFIED' : 'REGRESSION',
    isEditor: false,
    verdictCarriedFromBuildId: null,
  })
  const result = trimCaseBuilds([item('1', null), item('2', 'Beta')], [])
  assert.deepEqual(result.rows.map((row) => [row.build, row.verificationStatus]), [['1.2 · Standalone · Beta', 'REGRESSION'], ['1.1 · Standalone', 'VERIFIED']])
})

test('runQuery rejects an unknown verificationStatus and a test_case without id before any request', async () => {
  const signal = new AbortController().signal
  const bad = await runQuery('1', { kind: 'test_cases', args: { verificationStatus: 'GREEN' } }, signal)
  assert.equal(bad.status, 'error')
  assert.match(String(bad.error), /unknown verificationStatus 'GREEN'/)
  const missing = await runQuery('1', { kind: 'test_case', args: {} }, signal)
  assert.equal(missing.status, 'error')
  assert.match(String(missing.error), /test_case needs args.id/)
})

test('folderCaseIdsOf leaves out hidden items and counts them, like the case library', () => {
  const item = (id: number, patch: { hidden?: boolean; inVersion?: boolean } = {}) => ({
    testCase: makeCase(id),
    hidden: false,
    inVersion: true,
    ...patch,
  })
  const result = folderCaseIdsOf([item(1), item(2, { hidden: true }), item(3, { inVersion: false }), item(4, { hidden: true, inVersion: false })])
  assert.deepEqual([...result.caseIds], ['1'])
  assert.equal(result.hiddenExcluded, 1)
})
