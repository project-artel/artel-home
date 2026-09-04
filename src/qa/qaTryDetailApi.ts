import { apiFetch } from '../auth/authApi'
import { asRecord, asNullableString, asString, ProjectApiError, readJson } from '../projects/projectApi'

/**
 * 한 run 을 히스토리에서 펼쳤을 때 그 자리에 서는 것(ARTEL-819).
 *
 * `stepsPassed` 와 `stepsTotal` 은 완주하지 않은 run 에서 **함께 null 이다.** 0 이 아니라 없는
 * 것이고, 화면이 임의의 분모를 붙이면 "0 / 17 실패" 처럼 읽힌다.
 *
 * `issues` 는 이 run 이 게임에서 찾아 보고한 결함 수다. `qa_log` 의 `ERROR` 가 아니다 — 그쪽은
 * orchestration 이 agent 요청을 거절한 기록이라 장치가 삐끗한 것이지 결함이 아니고, 이 화면이
 * 답할 질문도 아니다.
 */
export interface QaTryDetail {
  qaTryId: string
  status: string
  scenarioTitle: string
  model: string | null
  promptVersion: string | null
  reasoningEffort: string | null
  startedAt: string
  completedAt: string | null
  stepsPassed: number | null
  stepsTotal: number | null
  issues: number
  feedback: number
  usage: QaTryDetailUsage
  toolCalls: QaTryToolCall[]
}

/**
 * 이 run 이 쓴 것과 든 돈.
 *
 * `cachedInputTokens` 는 `inputTokens` 에 **포함된** 값이고 `cacheWriteTokens` 는 아니다. 셋을
 * 나란히 더하면 같은 토큰을 두 번 센다.
 *
 * `costUsd` 가 null 이면 "공짜" 가 아니라 "아무도 단가를 말한 적 없다" 이다. `pricedCalls` 가
 * `calls` 보다 작으면 그 금액은 하한이다. `costEstimated` 는 provider 가 호출별 청구액을 안 줘서
 * 우리가 토큰으로 계산한 값이 섞였다는 뜻이다.
 */
export interface QaTryDetailUsage {
  calls: number
  pricedCalls: number
  costUsd: number | null
  costEstimated: boolean
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

export interface QaTryToolCall {
  tool: string
  calls: number
}

/**
 * 숫자는 오늘 JSON number 로 오지만 `cost_usd` 는 서버에서 `NUMERIC` 이라, 직렬화가 바뀌면
 * 문자열로 온다. 거기서 0 으로 떨어뜨리면 실제로 나간 돈이 조용히 공짜가 된다.
 * (`qaUsageApi` 가 같은 이유로 같은 일을 한다.)
 */
function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/** null 은 "모른다" 다. 이 응답에서 그 구분이 필요한 것은 비용과 step 뿐이다. */
function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function parseUsage(value: unknown, responseStatus: number): QaTryDetailUsage {
  // 이 응답에서 `usage` 는 항상 온다. 없으면 모양이 우리가 아는 것이 아니라는 뜻이라
  // 0으로 채우지 않는다 — 실제로 나간 돈이 공짜로 보이는 것이 이 화면의 최악이다.
  const usage = asRecord(value)
  if (usage === null) {
    throw new ProjectApiError(responseStatus, 'The server returned unreadable usage.')
  }
  return {
    calls: asNumber(usage.calls, 0),
    pricedCalls: asNumber(usage.pricedCalls, 0),
    costUsd: asNullableNumber(usage.costUsd),
    costEstimated: usage.costEstimated === true,
    inputTokens: asNumber(usage.inputTokens, 0),
    cachedInputTokens: asNumber(usage.cachedInputTokens, 0),
    cacheWriteTokens: asNumber(usage.cacheWriteTokens, 0),
    outputTokens: asNumber(usage.outputTokens, 0),
  }
}

/**
 * 이름이 없는 도구 항목은 버린다. 그 줄은 무엇을 몇 번 불렀는지가 전부라, 이름이 없으면
 * 셀 것도 보여 줄 것도 없다.
 */
function parseToolCalls(value: unknown): QaTryToolCall[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const record = asRecord(item)
    if (record === null || typeof record.tool !== 'string' || record.tool === '') return []
    return [{ tool: record.tool, calls: asNumber(record.calls, 0) }]
  })
}

/**
 * 한 run 의 상세. 없거나 참여하지 않는 프로젝트면 404 → null.
 *
 * **목록 응답에 안 실린다.** 여기 실린 값은 서버가 네 표를 접어야 나오는데, 안 펼친 행의 값은
 * 아무도 안 보기 때문이다. 그래서 행을 펼칠 때 그 행만 부른다.
 *
 * 도는 중인 run 에는 부르지 않는다 — 그때의 수는 중간값인데 이 화면은 열 때 한 번 부르고
 * 끝이라 그대로 멈춰 있고, 갱신되는 줄 알고 읽으면 틀린 수를 읽는 것이 된다.
 */
export async function getQaTryDetail(
  qaTryId: string,
  signal?: AbortSignal,
): Promise<QaTryDetail | null> {
  const response = await apiFetch(`/api/qa-tries/${encodeURIComponent(qaTryId)}/detail`, { signal })
  if (response.status === 404) return null

  return parseQaTryDetail(await readJson(response), qaTryId, response.status)
}

/**
 * 응답 하나를 화면이 쓰는 모양으로 좁힌다.
 *
 * `getQaTryDetail` 에서 갈라 둔 것은 이 레포가 UI 로직을 시험하는 방식이기 때문이다 — 컴포넌트는
 * 테스트하지 않고, 중요한 판단은 순수 함수로 내려 그쪽을 건다. 여기 걸린 판단은 "없음"과 "0"을
 * 가르는 것이고, 그것을 틀리면 실제로 나간 돈이 화면에서 공짜가 된다.
 *
 * @param requestedId 응답에 id 가 없을 때만 쓰는 대비책. 응답이 자기가 무엇인지 말한 것을
 *   요청 인자로 덮으면 그 둘이 갈렸을 때 화면이 눈치챌 방법이 없다.
 */
export function parseQaTryDetail(
  data: unknown,
  requestedId: string,
  responseStatus: number,
): QaTryDetail {
  const body = asRecord(data)
  if (body === null) {
    throw new ProjectApiError(responseStatus, 'The server returned an unreadable run detail.')
  }

  // 이 둘이 없으면 그릴 것이 없다. 빈 문자열로 통과시키면 상태도 시각도 없는 패널이 열린다.
  const status = asString(body.status)
  const startedAt = asString(body.startedAt)
  if (status === '' || startedAt === '') {
    throw new ProjectApiError(responseStatus, 'The server returned an unreadable run detail.')
  }

  return {
    qaTryId: asString(body.qaTryId, requestedId),
    status,
    scenarioTitle: asString(body.scenarioTitle),
    model: asNullableString(body.model),
    promptVersion: asNullableString(body.promptVersion),
    reasoningEffort: asNullableString(body.reasoningEffort),
    startedAt,
    completedAt: asNullableString(body.completedAt),
    stepsPassed: asNullableNumber(body.stepsPassed),
    stepsTotal: asNullableNumber(body.stepsTotal),
    issues: asNumber(body.issues, 0),
    feedback: asNumber(body.feedback, 0),
    usage: parseUsage(body.usage, responseStatus),
    toolCalls: parseToolCalls(body.toolCalls),
  }
}

/**
 * 이 run 이 걸린 시간(초). 시작이나 끝이 없으면 null.
 *
 * 도는 중인 run 에 "지금까지" 를 계산해 주지 않는다. 이 화면은 열 때 한 번 부르고 끝이라
 * 그 값은 그대로 멈춰 있고, 시계처럼 보이는 수가 멈춰 있으면 화면이 못 지키는 약속이 된다.
 */
export function elapsedSeconds(detail: QaTryDetail): number | null {
  if (detail.completedAt === null) return null
  const started = new Date(detail.startedAt).getTime()
  const completed = new Date(detail.completedAt).getTime()
  if (Number.isNaN(started) || Number.isNaN(completed)) return null
  return Math.max(0, Math.round((completed - started) / 1000))
}
