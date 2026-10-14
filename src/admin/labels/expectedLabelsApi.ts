import { apiFetch, asNullableNumber, asRecord, asString, readJson } from '../shared/adminApi'

/**
 * 라벨링 화면이 보는 스텝 하나.
 *
 * 서버의 저작 모델을 그대로 비추지 않는다 — 이 화면이 쓰는 것만 담는다. 라벨링 도구는 본문을
 * 되돌리면 안 되므로 본문 필드는 **읽기 전용으로만** 존재한다.
 */
export interface LabelStep {
  /** 1부터. 서버가 라벨을 지목하는 키이고, 에이전트의 스텝 판정 번호와도 같은 기준이다. */
  step: number
  action: string
  caseId: number | null
  /** `null`은 "채점하지 않음"이지 "통과해야 함"이 아니다. */
  expectedPassed: boolean | null
}

export interface LabelScenario {
  testScenarioId: string
  title: string
  steps: LabelStep[]
}

export interface ScenarioListItem {
  testScenarioId: string
  title: string
}

/** 프로젝트의 시나리오 목록. 라벨은 여기 없다 — 목록 응답은 제목까지만 준다. */
export async function listScenarios(
  projectId: string,
  signal?: AbortSignal,
): Promise<ScenarioListItem[]> {
  const response = await apiFetch(`/api/projects/${projectId}/test-scenario`, { signal })
  const body = asRecord(await readJson(response))
  const items = Array.isArray(body.items) ? body.items : []
  return items.map((item) => {
    const row = asRecord(item)
    return {
      testScenarioId: String(row.testScenarioId ?? ''),
      title: asString(row.title, 'scenario.title'),
    }
  })
}

/** 시나리오 본문 + 현재 라벨. */
export async function fetchScenario(
  projectId: string,
  testScenarioId: string,
  signal?: AbortSignal,
): Promise<LabelScenario> {
  const response = await apiFetch(
    `/api/projects/${projectId}/test-scenario/${testScenarioId}`,
    { signal },
  )
  return toScenario(asRecord(await readJson(response)))
}

/**
 * 라벨만 저장한다. **본문은 보내지 않는다** — 서버가 그렇게 갈라 놨고, 함께 보내면 저작자가
 * 방금 고친 스텝을 이 화면이 되돌린다.
 *
 * 바뀐 스텝만 싣는다. 목록에 없는 스텝은 서버가 손대지 않으므로, 전부 보내면 이 화면이 읽은
 * 뒤 저작 쪽에서 달라진 값까지 덮어쓴다.
 */
export async function saveLabels(
  testScenarioId: string,
  changed: LabelStep[],
  signal?: AbortSignal,
): Promise<LabelScenario> {
  const response = await apiFetch(`/api/test-scenario/${testScenarioId}/expected-labels`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      labels: changed.map((step) => ({ step: step.step, expected_passed: step.expectedPassed })),
    }),
  })
  return toScenario(asRecord(await readJson(response)))
}

function toScenario(body: Record<string, unknown>): LabelScenario {
  const payload = asRecord(body.payload)
  const steps = Array.isArray(payload.steps) ? payload.steps : []
  return {
    testScenarioId: String(body.testScenarioId ?? ''),
    title: typeof payload.title === 'string' ? payload.title : '',
    steps: steps.map((raw, index) => {
      const step = asRecord(raw)
      return {
        step: index + 1,
        action: typeof step.action === 'string' ? step.action : '',
        caseId: asNullableNumber(step.case_id),
        // 정확히 boolean이 아닌 것은 전부 미지정으로 읽는다. 라벨 이전 시나리오에는 키 자체가
        // 없고, 없는 답이 "통과 기대"로 새면 정확도가 조용히 부풀려진다.
        expectedPassed: typeof step.expected_passed === 'boolean' ? step.expected_passed : null,
      }
    }),
  }
}
