/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { QaRunSummary } from '../launch/qaLaunchApi.ts'
import type { TestRun } from '../../testRuns/testRunApi.ts'
import { countByFilter, matchesFilter, ringOf, runOrdinals, testRunsUnder } from './historyModel.ts'

function run(id: string, startedAt: string, overrides: Partial<QaRunSummary> = {}): QaRunSummary {
  return {
    id,
    testRunId: '95',
    testRunName: '재현',
    gameInstanceId: '2',
    gameInstanceName: null,
    gameBuildVersion: '1.0',
    model: 'openai/gpt-6-luna',
    reasoningEffort: null,
    keySource: null,
    status: 'FAILED',
    startedAt,
    completedAt: null,
    casesPassed: 9,
    casesTotal: 15,
    issueCount: 0,
    ...overrides,
  }
}

test('ordinals count from the oldest run of the test run', () => {
  const runs = [run('16', '2026-10-08T05:52:00Z'), run('13', '2026-10-08T04:10:00Z'), run('14', '2026-10-08T04:19:00Z')]
  const ordinals = runOrdinals(runs, true)

  assert.equal(ordinals.get('13'), 1)
  assert.equal(ordinals.get('14'), 2)
  assert.equal(ordinals.get('16'), 3)
})

test('a list that was cut short gives no ordinals rather than wrong ones', () => {
  assert.equal(runOrdinals([run('16', '2026-10-08T05:52:00Z')], false).size, 0)
})

test('the ring fills by pass rate and takes its colour from it', () => {
  assert.deepEqual(ringOf(run('1', '', { casesPassed: 15, casesTotal: 15 })), { tone: 'pass', ratio: 1 })
  assert.equal(ringOf(run('1', '', { casesPassed: 10, casesTotal: 15 })).tone, 'partial')
  assert.equal(ringOf(run('1', '', { casesPassed: 6, casesTotal: 15 })).tone, 'fail')
})

test('a run without a verdict reads from its status', () => {
  assert.deepEqual(ringOf(run('1', '', { status: 'CANCELLED', casesPassed: null, casesTotal: null })), { tone: 'cancelled', ratio: 0 })
  assert.deepEqual(ringOf(run('1', '', { status: 'COMPLETED', casesPassed: null, casesTotal: null })), { tone: 'pass', ratio: 1 })
  assert.deepEqual(ringOf(run('1', '', { status: 'FAILED', casesPassed: null, casesTotal: null })), { tone: 'fail', ratio: 1 })
  assert.equal(ringOf(run('1', '', { status: 'RUNNING' })).tone, 'running')
})

test('the filter and its counts agree', () => {
  const runs = [run('1', '', { status: 'FAILED' }), run('2', '', { status: 'CANCELLED' }), run('3', '', { status: 'FAILED' })]

  assert.deepEqual(countByFilter(runs), { ALL: 3, FAILED: 2, COMPLETED: 0, CANCELLED: 1 })
  assert.equal(runs.filter((one) => matchesFilter(one, 'FAILED')).length, 2)
  assert.equal(runs.filter((one) => matchesFilter(one, 'ALL')).length, 3)
})

function testRun(id: string, buildId: string | null, folderId: string | null): TestRun {
  return {
    id,
    projectId: '2',
    name: `run ${id}`,
    description: null,
    createdAt: '2026-10-01T00:00:00Z',
    gameBuild: buildId === null ? null : { gameBuildId: buildId, version: '1.0', label: null },
    folderId,
    scenarioCount: 1,
    lastQaRun: null,
  }
}

test('a version holds every test run under it, a folder holds its own subtree', () => {
  const runs = [testRun('a', '4', null), testRun('b', '4', 'f1'), testRun('c', '4', 'f2'), testRun('d', '5', null), testRun('e', null, null)]
  const folders = [{ id: 'f1', parentId: null }, { id: 'f2', parentId: 'f1' }]

  assert.deepEqual(testRunsUnder(runs, folders, '4', null).map((one) => one.id), ['a', 'b', 'c'])
  assert.deepEqual(testRunsUnder(runs, folders, '4', 'f1').map((one) => one.id), ['b', 'c'])
  assert.deepEqual(testRunsUnder(runs, folders, '4', 'f2').map((one) => one.id), ['c'])
  assert.deepEqual(testRunsUnder(runs, folders, 'none', null).map((one) => one.id), ['e'])
})
