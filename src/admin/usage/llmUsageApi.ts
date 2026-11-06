import {
  apiFetch,
  asNullableNumber,
  asNullableString,
  asNumber,
  asRecord,
  asString,
  readJson,
} from '../shared/adminApi'
import {
  QA_RUN_STATUSES,
  type DailyCell,
  type LlmUsageStats,
  type ModelCell,
  type ProjectCell,
  type QaRunStatus,
  type QaRunUsage,
  type ServiceCell,
  type UsageTotals,
} from './llmUsageTypes'

export interface UsageQuery {
  /** null이면 참여 중인 전 프로젝트 합산. */
  projectId: string | null
  from: Date
  to: Date
}

/**
 * 브라우저가 보는 시간대. 일별 버킷의 하루 경계를 여기에 맞춘다.
 *
 * 서버 기본값은 UTC라 이 값을 안 보내면 한국에서 오전 9시 이전 지출이 전날로 붙고, 월 경계에서는
 * "이번 달 얼마 썼나"의 답이 하루치 어긋난다.
 */
function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function usageParams({ projectId, from, to }: UsageQuery): URLSearchParams {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  })
  if (projectId !== null) params.set('projectId', projectId)
  return params
}

/** service·model·project·일자 네 축과 총계를 한 번에 받는다. */
export async function fetchLlmUsageStats(
  query: UsageQuery,
  signal?: AbortSignal,
): Promise<LlmUsageStats> {
  const params = usageParams(query)
  params.set('zone', localZone())

  const response = await apiFetch(`/api/llm-usage/stats?${params}`, { signal })
  const body = asRecord(await readJson(response))

  return {
    projectId: asNullableString(body.projectId),
    from: asString(body.from, 'from'),
    to: asString(body.to, 'to'),
    zone: asString(body.zone, 'zone'),
    total: parseTotals(asRecord(body.total)),
    byService: list(body.byService).map((raw): ServiceCell => {
      const cell = asRecord(raw)
      return {
        service: asString(cell.service, 'byService.service'),
        totals: parseTotals(asRecord(cell.totals)),
      }
    }),
    byModel: list(body.byModel).map((raw): ModelCell => {
      const cell = asRecord(raw)
      return {
        provider: asString(cell.provider, 'byModel.provider'),
        model: asString(cell.model, 'byModel.model'),
        totals: parseTotals(asRecord(cell.totals)),
      }
    }),
    byProject: list(body.byProject).map((raw): ProjectCell => {
      const cell = asRecord(raw)
      return {
        projectId: asString(cell.projectId, 'byProject.projectId'),
        projectName: asString(cell.projectName, 'byProject.projectName'),
        totals: parseTotals(asRecord(cell.totals)),
      }
    }),
    daily: list(body.daily).map((raw): DailyCell => {
      const cell = asRecord(raw)
      return {
        date: asString(cell.date, 'daily.date'),
        totals: parseTotals(asRecord(cell.totals)),
      }
    }),
    unattributedCalls: asNumber(body.unattributedCalls, 0),
  }
}

/** QA 런 한 건씩의 지출, 최신순. 기간 기준이 `qa_try.started_at`이라 집계와 하루가 다를 수 있다. */
export async function fetchQaRunUsage(
  query: UsageQuery,
  size: number,
  signal?: AbortSignal,
): Promise<QaRunUsage[]> {
  const params = usageParams(query)
  params.set('size', String(size))

  const response = await apiFetch(`/api/llm-usage/qa-runs?${params}`, { signal })
  const body = await readJson(response)

  return list(body).map((raw) => {
    const run = asRecord(raw)
    return {
      qaTryId: asString(run.qaTryId, 'qaRun.qaTryId'),
      projectId: asString(run.projectId, 'qaRun.projectId'),
      status: parseStatus(run.status),
      startedAt: asString(run.startedAt, 'qaRun.startedAt'),
      completedAt: asNullableString(run.completedAt),
      model: asNullableString(run.model),
      reasoningEffort: asNullableString(run.reasoningEffort),
      promptVersion: asNullableString(run.promptVersion),
      agentArch: asNullableString(run.agentArch),
      totals: parseTotals(asRecord(run.totals)),
    }
  })
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function parseTotals(raw: Record<string, unknown>): UsageTotals {
  return {
    inputTokens: asNumber(raw.inputTokens, 0),
    outputTokens: asNumber(raw.outputTokens, 0),
    cachedInputTokens: asNumber(raw.cachedInputTokens, 0),
    reasoningTokens: asNumber(raw.reasoningTokens, 0),
    // 0으로 떨어뜨리지 않는다. "단가 미상"이 "공짜"로 읽히면 비용 비교가 조용히 틀린다.
    costUsd: asNullableNumber(raw.costUsd),
    calls: asNumber(raw.calls, 0),
    // 0으로 떨어뜨려도 안전하다. 화면은 pricedCalls < calls일 때만 하한 표시를 켜고,
    // 서버가 이 필드를 안 주면 costUsd도 함께 없어 그릴 금액 자체가 없다.
    pricedCalls: asNumber(raw.pricedCalls, 0),
  }
}

/** 모르는 상태값은 목록 전체를 깨뜨리지 않고 `STARTING`으로 낮춘다. */
function parseStatus(value: unknown): QaRunStatus {
  return QA_RUN_STATUSES.find((status) => status === value) ?? 'STARTING'
}
