/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Issue } from '../../issues/issueTypes.ts'
import type { QaRunSummary } from '../../qa/launch/qaLaunchApi.ts'
import type { QaRun, QaTry } from '../../qa/qaTypes.ts'
import type { ProjectUsage, UsageTotals } from '../../usage/usageApi.ts'
import { QUERY_ROW_LIMIT, runQuery, trimIssues, trimQaHistory, trimQaRun, trimQaTryHistory, trimUsage } from './queries.ts'

function summary(index: number): QaRunSummary {
  return {
    id: String(index),
    testRunId: '3',
    testRunName: 'smoke',
    gameInstanceId: '9',
    gameInstanceName: 'pc',
    gameBuildVersion: '1.2.0',
    model: 'm',
    reasoningEffort: null,
    keySource: 'platform',
    status: 'PASSED',
    startedAt: 's',
    completedAt: null,
    casesPassed: 4,
    casesTotal: 5,
    issueCount: 1,
  }
}

test('trimQaHistory keeps at most 20 rows and only the fields a model needs', () => {
  const trimmed = trimQaHistory(Array.from({ length: 25 }, (_, index) => summary(index)))
  assert.equal(trimmed.rows.length, QUERY_ROW_LIMIT)
  assert.equal(trimmed.truncated, true)
  assert.deepEqual(Object.keys(trimmed.rows[0]).sort(), [
    'build',
    'casesPassed',
    'casesTotal',
    'completedAt',
    'issueCount',
    'model',
    'qaRunId',
    'startedAt',
    'status',
    'testRunId',
    'testRunName',
  ])
  assert.equal(trimQaHistory([summary(1)]).truncated, false)
})

test('trimQaRun trims scenarios to 20 rows', () => {
  const run: QaRun = {
    id: '55',
    testRunId: '3',
    gameInstanceId: '9',
    gameBuildId: null,
    testRunGameBuildId: null,
    status: 'RUNNING',
    startedAt: 's',
    completedAt: null,
    tries: Array.from({ length: 21 }, (_, index) => ({
      id: String(index),
      testScenarioId: String(100 + index),
      gameInstanceId: '9',
      agentSessionId: null,
      status: 'COMPLETED',
      startedAt: null,
      completedAt: null,
      qaRunId: '55',
    })),
  }
  const trimmed = trimQaRun(run)
  assert.equal(trimmed.scenarios.rows.length, 20)
  assert.equal(trimmed.scenarios.truncated, true)
  assert.deepEqual(trimmed.scenarios.rows[0], { qaTryId: '0', testScenarioId: '100', status: 'COMPLETED' })
})

test('trimIssues drops the detail payload and reports more pages as truncated', () => {
  const issue: Issue = {
    id: '1',
    qaTryId: '2',
    qaRunId: '3',
    severity: 'MAJOR',
    title: 'HP 가 줄지 않음',
    detail: { long: 'x'.repeat(1000) },
    status: 'OPEN',
    reportedAt: 'r',
    resolvedAt: null,
    tracker: null,
    // ARTEL-1114 가 `Issue` 에 더한 칸. 서버가 아직 안 실으면 null 인 자리라 픽스처도 비워 둔다.
    origin: null,
    number: null,
    archivedAt: null,
    categories: [],
  }
  const trimmed = trimIssues([issue], true)
  assert.deepEqual(trimmed.rows[0], {
    issueId: '1',
    title: 'HP 가 줄지 않음',
    severity: 'MAJOR',
    status: 'OPEN',
    qaRunId: '3',
    qaTryId: '2',
    reportedAt: 'r',
  })
  assert.equal(trimmed.truncated, true)
})

test('trimUsage keeps cost, calls and tokens per service and model', () => {
  const totals: UsageTotals = {
    inputTokens: 10,
    outputTokens: 5,
    cachedInputTokens: 1,
    reasoningTokens: 2,
    costUsd: 0.5,
    calls: 3,
    pricedCalls: 3,
  }
  const usage: ProjectUsage = {
    total: totals,
    daily: [{ date: '2026-10-01', totals }],
    byService: [{ service: 'QA', totals }],
    byModel: [{ provider: 'p', model: 'm', totals }],
    zone: 'Asia/Seoul',
  }
  const trimmed = trimUsage(usage)
  assert.deepEqual(trimmed.total, { costUsd: 0.5, calls: 3, inputTokens: 10, outputTokens: 5 })
  assert.deepEqual(trimmed.byService.rows[0], { service: 'QA', costUsd: 0.5, calls: 3, inputTokens: 10, outputTokens: 5 })
  assert.equal(trimmed.byModel.rows[0].model, 'm')
  assert.equal('daily' in trimmed, false)
})

test('runQuery rejects an unknown kind without a request', async () => {
  const result = await runQuery('1', { kind: 'everything' }, new AbortController().signal)
  assert.equal(result.status, 'error')
})

test('runQuery rejects an unknown issue status or severity without a request', async () => {
  const signal = new AbortController().signal
  const badStatus = await runQuery('1', { kind: 'issues', args: { status: 'closed-ish' } }, signal)
  assert.equal(badStatus.status, 'error')
  assert.match(String(badStatus.error), /unknown status 'closed-ish'/)
  const badSeverity = await runQuery('1', { kind: 'issues', args: { severity: 'urgent' } }, signal)
  assert.equal(badSeverity.status, 'error')
  assert.match(String(badSeverity.error), /unknown severity 'urgent'/)
})

test('trimQaTryHistory groups tries by QA run and marks a run failed when any try failed', () => {
  const qaTry = (id: string, qaRunId: string | null, status: QaTry['status']): QaTry => ({
    id,
    testScenarioId: 's',
    gameInstanceId: 'g',
    agentSessionId: null,
    status,
    startedAt: '2026-10-20T00:00:00Z',
    completedAt: null,
    qaRunId,
  })
  const result = trimQaTryHistory([qaTry('1', '55', 'COMPLETED'), qaTry('2', '55', 'FAILED'), qaTry('3', null, 'COMPLETED')])
  assert.deepEqual(
    result.rows.map((row) => [row.qaRunId, row.status, row.scenarios]),
    [['55', 'FAILED', 2], [null, 'COMPLETED', 1]],
  )
  assert.equal(result.truncated, false)
})
