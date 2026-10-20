import { listProjectIssues } from '../../issues/issueApi'
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type Issue, type IssueSeverity, type IssueStatus } from '../../issues/issueTypes'
import { getQaRun } from '../../qa/qaApi'
import { listProjectQaRuns, type QaRunSummary } from '../../qa/launch/qaLaunchApi'
import type { QaRun } from '../../qa/qaTypes'
import { fetchProjectUsage, type ProjectUsage, type UsageTotals } from '../../usage/usageApi'
import type { ToolResultBody } from './toolTypes'

/*
 * `query` tool. 이미 있는 화면용 API 를 불러 model 에게 필요한 칸만 남긴다.
 * 행은 최대 20개다(계약 3절). 행이 더 있었으면 `truncated: true` 를 붙여 model 이 알게 한다.
 */

export const QUERY_ROW_LIMIT = 20

export const QUERY_KINDS = ['qa_history', 'qa_run', 'issues', 'usage'] as const
export type QueryKind = (typeof QUERY_KINDS)[number]

export type QueryRows<Row> = { rows: Row[]; truncated: boolean }

function limitRows<Row>(rows: readonly Row[], limit = QUERY_ROW_LIMIT): QueryRows<Row> {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}

export type QaHistoryRow = {
  qaRunId: string
  testRunId: string
  testRunName: string | null
  build: string | null
  model: string | null
  status: string
  startedAt: string
  completedAt: string | null
  casesPassed: number | null
  casesTotal: number | null
  issueCount: number
}

export function trimQaHistory(runs: readonly QaRunSummary[]): QueryRows<QaHistoryRow> {
  return limitRows(
    runs.map((run) => ({
      qaRunId: run.id,
      testRunId: run.testRunId,
      testRunName: run.testRunName,
      build: run.gameBuildVersion,
      model: run.model,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      casesPassed: run.casesPassed,
      casesTotal: run.casesTotal,
      issueCount: run.issueCount,
    })),
  )
}

export type QaRunDetail = {
  qaRunId: string
  testRunId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  scenarios: QueryRows<{ qaTryId: string; testScenarioId: string; status: string }>
}

export function trimQaRun(run: QaRun): QaRunDetail {
  return {
    qaRunId: run.id,
    testRunId: run.testRunId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    scenarios: limitRows(
      run.tries.map((one) => ({ qaTryId: one.id, testScenarioId: one.testScenarioId, status: one.status })),
    ),
  }
}

export type IssueRow = {
  issueId: string
  title: string
  severity: IssueSeverity
  status: IssueStatus
  qaRunId: string | null
  qaTryId: string
  reportedAt: string
}

export function trimIssues(issues: readonly Issue[], hasMore: boolean): QueryRows<IssueRow> {
  const trimmed = limitRows(
    issues.map((issue) => ({
      issueId: issue.id,
      title: issue.title,
      severity: issue.severity,
      status: issue.status,
      qaRunId: issue.qaRunId,
      qaTryId: issue.qaTryId,
      reportedAt: issue.reportedAt,
    })),
  )
  return { rows: trimmed.rows, truncated: trimmed.truncated || hasMore }
}

type UsageFigures = { costUsd: number | null; calls: number; inputTokens: number; outputTokens: number }

function usageFigures(totals: UsageTotals): UsageFigures {
  return {
    costUsd: totals.costUsd,
    calls: totals.calls,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
  }
}

export type UsageSummary = {
  /** 집계 기간. 화면의 잔디와 같은 12주다. */
  window: string
  zone: string
  total: UsageFigures
  byService: QueryRows<{ service: string } & UsageFigures>
  byModel: QueryRows<{ provider: string; model: string } & UsageFigures>
}

export function trimUsage(usage: ProjectUsage): UsageSummary {
  return {
    window: 'last 12 weeks',
    zone: usage.zone,
    total: usageFigures(usage.total),
    byService: limitRows(usage.byService.map((row) => ({ service: row.service, ...usageFigures(row.totals) }))),
    byModel: limitRows(
      usage.byModel.map((row) => ({ provider: row.provider, model: row.model, ...usageFigures(row.totals) })),
    ),
  }
}

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name]
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (value === undefined) return undefined
  const upper = value.toUpperCase()
  return allowed.find((one) => one === upper)
}

/** `query` tool 의 실행. 실패는 던지지 않고 `error` 결과로 돌려준다. */
export async function runQuery(
  projectId: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ToolResultBody> {
  const kind = QUERY_KINDS.find((one) => one === args.kind)
  if (kind === undefined) {
    return { status: 'error', error: `unknown query kind '${String(args.kind)}'. Use one of ${QUERY_KINDS.join(', ')}` }
  }
  const queryArgs = (typeof args.args === 'object' && args.args !== null ? args.args : {}) as Record<string, unknown>
  try {
    return { status: 'ok', result: await queryResult(kind, projectId, queryArgs, signal) }
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
}

async function queryResult(
  kind: QueryKind,
  projectId: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  if (kind === 'qa_history') {
    const runs = await listProjectQaRuns(projectId, QUERY_ROW_LIMIT + 1, signal, stringArg(args, 'testRunId'))
    return trimQaHistory(runs)
  }
  if (kind === 'qa_run') {
    const qaRunId = stringArg(args, 'qaRunId') ?? stringArg(args, 'id')
    if (qaRunId === undefined) throw new Error("qa_run needs args.qaRunId")
    return trimQaRun(await getQaRun(qaRunId, signal))
  }
  if (kind === 'issues') {
    const page = await listProjectIssues(
      projectId,
      {
        status: oneOf(stringArg(args, 'status'), ISSUE_STATUSES),
        severity: oneOf(stringArg(args, 'severity'), ISSUE_SEVERITIES),
      },
      undefined,
      signal,
    )
    return trimIssues(page.items, page.hasMore)
  }
  return trimUsage(await fetchProjectUsage(projectId, new Date(), signal))
}
