import type { Localized } from '../messages'

/** Strings for `src/admin/usage/*`, the admin usage screen. See `common.ts` for the typing convention. */
export const adminUsageEn = {
  period: 'Period',
  startDate: 'Start date',
  endDate: 'End date',
  loadFailedTitle: 'Could not load',
  noProjects: 'No project to show. Spend is visible only to project members.',
  loadingSpend: 'Loading spend…',
  noCalls: 'No call recorded in this period.',

  scopeTitle: 'What these numbers cover',
  allScope: 'Spend of every project that has not been deleted.',
  oneScope: 'Spend of the one project you picked.',
  calledAt: {
    before: 'The period is counted by ',
    emphasis: 'when the model was called',
    after:
      ' — the agent sends usage in batches, so this differs from the stored time by minutes, and at a month boundary the date differs too.',
  },
  unattributed: {
    before: 'Calls whose project cannot be known because the target row is gone: ',
    after: ' calls. They are left out of the totals above.',
  },

  axesTitle: 'Breakdown by axis',
  axesNote: 'The three tables fold the same calls differently, so each one sums to the total above',
  byService: 'By feature',
  service: 'Feature',
  byModel: 'By model',
  model: 'Model',
  byProject: 'By project',
  project: 'Project',
  embeddingNote: 'Embedding output tokens are always 0',
  projectNameNote: 'Names are as of the time of the query',
  /** Unknown values from the server are shown as the raw string. */
  services: {
    QA_RUN: 'QA run',
    SCENARIO: 'Scenario writing',
    KNOWLEDGE_QUERY: 'Knowledge lookup',
    GAME_CONTEXT: 'Design document reading',
    EMBEDDING: 'Embedding',
  } as Record<string, string>,

  table: {
    tokens: 'Tokens',
    share: 'Share',
    input: 'Input',
    output: 'Output',
    cost: 'Cost',
    calls: 'Calls',
    total: 'Total',
    partialCostHint: (priced: string, unpriced: string) =>
      `Sum of the ${priced} calls with a known price. The other ${unpriced} calls are left out because the provider gave no price.`,
  },

  trend: {
    title: 'Daily trend',
    note: (zone: string, peak: string) =>
      `By tokens · a day starts at midnight in ${zone} · peak ${peak} tokens`,
    empty: 'No call recorded in this period.',
    dayLabel: (date: string, tokens: string, cost: string, calls: string) =>
      `${date} · ${tokens} tokens · ${cost} · ${calls} calls`,
    noCallDay: (date: string) => `${date} · no call recorded`,
  },

  runs: {
    title: 'Spend by QA run',
    note: 'Newest first · counted by run start time, so the sum can differ from the total above',
    start: 'Start',
    status: 'Status',
    model: 'Model',
    reasoning: 'Reasoning',
    partialCostHint: (priced: string) =>
      `Sum of the ${priced} calls with a known price. The rest have no price from the provider.`,
    zeroCallsHint: 'The usage batch has not arrived yet, or it was lost. The agent does not retry.',
    empty: 'No QA run started in this period.',
    statuses: {
      STARTING: 'Starting',
      RUNNING: 'Running',
      COMPLETED: 'Completed',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    },
  },

  rail: {
    totalTokens: 'Total tokens',
    tokensHint: (input: string, output: string) => `Input ${input} · output ${output}`,
    totalCost: 'Total cost',
    noPricedCalls: 'No call with a known price',
    partialCost: (priced: string, calls: string) =>
      `Sum of ${priced}/${calls} calls with a known price · the real cost is higher`,
    fullyPriced: (calls: string) => `All ${calls} calls have a price`,
    cachedInput: 'Cached input',
    cachedHint: 'The share of input tokens read from the cache',
    reasoning: 'Reasoning',
    reasoningHint: 'The share of output tokens the model spent thinking',
    calls: 'LLM calls',
    noCallsHint: 'No call recorded in this period',
    perCallHint: (tokens: string) => `${tokens} tokens per call on average`,
    unattributed: 'Unattributed',
    allAttributed: 'Every call is attributed to a project',
    someUnattributed: 'Calls left out of the totals above because the target row is gone',
  },
}

export const adminUsageKo: Localized<typeof adminUsageEn> = {
  period: '기간',
  startDate: '시작일',
  endDate: '종료일',
  loadFailedTitle: '불러오지 못했습니다',
  noProjects: '참여 중인 프로젝트가 없습니다. 지출은 프로젝트 참여자에게만 보입니다.',
  loadingSpend: '지출을 불러오는 중입니다…',
  noCalls: '이 기간에 기록된 호출이 없습니다.',

  scopeTitle: '이 숫자가 덮는 범위',
  allScope: '삭제되지 않은 전 프로젝트의 지출입니다.',
  oneScope: '고른 프로젝트 하나의 지출입니다.',
  calledAt: {
    before: '기간은 ',
    emphasis: '모델을 호출한 시각',
    after:
      ' 기준입니다 — agent가 사용량을 모아 보내므로 저장 시각과는 분 단위로 벌어지고, 월 경계에서는 날짜가 달라집니다.',
  },
  unattributed: {
    before: '대상 행이 사라져 프로젝트를 알 수 없는 호출 ',
    after: '건은 위 합계에서 빠져 있습니다.',
  },

  axesTitle: '축별 분해',
  axesNote: '세 표는 같은 호출을 다르게 접은 것이라 각각의 합이 모두 위 총계와 같음',
  byService: '기능별',
  service: '기능',
  byModel: '모델별',
  model: '모델',
  byProject: '프로젝트별',
  project: '프로젝트',
  embeddingNote: '임베딩은 출력 토큰이 항상 0',
  projectNameNote: '이름은 조회 시점 기준',
  services: {
    QA_RUN: 'QA 실행',
    SCENARIO: '시나리오 작성',
    KNOWLEDGE_QUERY: '지식 조회',
    GAME_CONTEXT: '기획서 읽기',
    EMBEDDING: '임베딩',
  },

  table: {
    tokens: '토큰',
    share: '비중',
    input: '입력',
    output: '출력',
    cost: '비용',
    calls: '호출',
    total: '합계',
    partialCostHint: (priced, unpriced) =>
      `단가를 아는 ${priced}건의 합. 나머지 ${unpriced}건은 provider가 단가를 주지 않아 빠졌다.`,
  },

  trend: {
    title: '일별 추이',
    note: (zone, peak) => `토큰 기준 · 하루 경계는 ${zone} · 최대 ${peak} 토큰`,
    empty: '이 기간에 기록된 호출이 없습니다.',
    dayLabel: (date, tokens, cost, calls) =>
      `${date} · ${tokens} 토큰 · ${cost} · 호출 ${calls}건`,
    noCallDay: (date) => `${date} · 기록된 호출 없음`,
  },

  runs: {
    title: 'QA 실행별 지출',
    note: '최신순 · 기간 기준은 런 시작 시각이라 위 총계와 합이 다를 수 있음',
    start: '시작',
    status: '상태',
    model: '모델',
    reasoning: 'Reasoning',
    partialCostHint: (priced) => `단가를 아는 ${priced}건의 합. 나머지는 provider가 단가를 주지 않았다.`,
    zeroCallsHint: '사용량 배치가 아직 안 왔거나 유실됐다. agent는 재시도하지 않는다.',
    empty: '이 기간에 시작된 QA 실행이 없습니다.',
    statuses: {
      STARTING: '시작 중',
      RUNNING: '실행 중',
      COMPLETED: '완주',
      FAILED: '실패',
      CANCELLED: '취소',
    },
  },

  rail: {
    totalTokens: '전체 토큰',
    tokensHint: (input, output) => `입력 ${input} · 출력 ${output}`,
    totalCost: '전체 비용',
    noPricedCalls: '단가를 아는 호출 없음',
    partialCost: (priced, calls) =>
      `단가를 아는 ${priced}/${calls}건의 합 · 실제는 이보다 큼`,
    fullyPriced: (calls) => `호출 ${calls}건 전부 단가 있음`,
    cachedInput: '캐시 입력',
    cachedHint: '입력 토큰 중 캐시에서 읽은 몫',
    reasoning: 'Reasoning',
    reasoningHint: '출력 토큰 중 모델이 생각한 몫',
    calls: 'LLM 호출',
    noCallsHint: '이 기간에 기록된 호출 없음',
    perCallHint: (tokens) => `호출당 평균 ${tokens} 토큰`,
    unattributed: '귀속 불가',
    allAttributed: '모든 호출이 프로젝트에 귀속됨',
    someUnattributed: '대상 행이 없어 위 합계에서 빠진 호출',
  },
}
