import type { Localized } from '../messages'

/** Strings for `src/usage/*`. See `common.ts` for the typing convention. */
export const usageEn = {
  panelTitle: 'Model spend',
  panelSubtitle: 'Tokens this project used over the last twelve weeks.',
  sectionTitle: 'Model spend',
  sectionSubtitle: (zone: string) =>
    `The last twelve weeks. A day starts at midnight in ${zone}, and the window counts when a model was called — not when the record reached us.`,
  seeAll: 'Breakdown',
  refresh: 'Refresh',
  loading: 'Loading spend…',
  loadFailed: 'Spend could not be loaded.',
  nothingYet: 'No model call has been recorded for this project yet.',

  windowTotal: 'Twelve-week total',
  today: 'Today',
  yesterday: 'Yesterday',
  busiestDay: 'Busiest day',
  busiestHint: 'The top of the shading scale below.',
  /** A day with no record is not a day that cost nothing — the batch may not have arrived. */
  noRecord: 'No call recorded',
  dayHint: (cost: string, calls: string) => `${cost} · ${calls} calls`,
  dash: '—',
  costUnknown: 'Unknown',
  noPricedCall: 'No call in this window came with a unit price.',
  partialPrice: (cost: string, priced: number, calls: number) =>
    `${cost} — the ${priced} of ${calls} calls with a known unit price. The real cost is higher.`,
  fullyPriced: (cost: string, calls: number) => `${cost} · all ${calls} calls priced`,
  partialHint: (priced: number, calls: number) =>
    `Sum of the ${priced} of ${calls} calls with a known unit price.`,

  /** Sunday first, like the graph it imitates. Only some rows print a label. */
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  grassCaption: (zone: string) =>
    `Daily tokens over the last twelve weeks, one cell per day, weeks left to right. Days start at midnight in ${zone}.`,
  /** The scale is relative, so the screen has to say what the shades mean. */
  scaleNote: 'Shade is relative to this project’s own busy days',
  less: 'Less',
  more: 'More',
  cellEmpty: (date: string) => `${date} · no call recorded`,
  cellSpend: (date: string, tokens: string, cost: string, calls: string) =>
    `${date} · ${tokens} tokens · ${cost} · ${calls} calls`,

  byFeature: 'By feature',
  byModel: 'By model',
  featureAxis: 'Feature',
  modelAxis: 'Model',
  embeddingNote: 'Embedding always has zero output tokens — it makes vectors, not tokens.',
  tokens: 'Tokens',
  share: 'Share',
  cost: 'Cost',
  calls: 'Calls',

  /**
   * Service names. An unknown value falls through as it came, so a service the
   * server adds later shows up as a new row rather than a nameless one.
   */
  services: {
    QA_RUN: 'QA run',
    SCENARIO: 'Scenario authoring',
    KNOWLEDGE_QUERY: 'Knowledge lookup',
    GAME_CONTEXT: 'Reading the planning document',
    EMBEDDING: 'Embedding',
  } as Record<string, string>,
} as const

export const usageKo: Localized<typeof usageEn> = {
  panelTitle: '모델 지출',
  panelSubtitle: '최근 12주 동안 이 프로젝트가 쓴 토큰입니다.',
  sectionTitle: '모델 지출',
  sectionSubtitle: (zone: string) =>
    `최근 12주입니다. 하루는 ${zone} 자정에 시작하고, 기간은 모델을 호출한 시각 기준입니다 — 기록이 우리에게 도착한 시각이 아닙니다.`,
  seeAll: '자세히',
  refresh: '새로고침',
  loading: '지출을 불러오는 중…',
  loadFailed: '지출을 불러오지 못했습니다.',
  nothingYet: '이 프로젝트에 아직 기록된 모델 호출이 없습니다.',

  windowTotal: '12주 합계',
  today: '오늘',
  yesterday: '어제',
  busiestDay: '가장 많이 쓴 날',
  busiestHint: '아래 잔디 눈금의 위쪽 끝입니다.',
  noRecord: '기록된 호출 없음',
  dayHint: (cost: string, calls: string) => `${cost} · 호출 ${calls}건`,
  dash: '—',
  costUnknown: '알 수 없음',
  noPricedCall: '이 기간에는 단가가 실린 호출이 없습니다.',
  partialPrice: (cost: string, priced: number, calls: number) =>
    `${cost} — 호출 ${calls}건 중 단가를 아는 ${priced}건의 합입니다. 실제 비용은 이보다 큽니다.`,
  fullyPriced: (cost: string, calls: number) => `${cost} · 호출 ${calls}건 모두 단가 있음`,
  partialHint: (priced: number, calls: number) =>
    `호출 ${calls}건 중 단가를 아는 ${priced}건의 합입니다.`,

  weekdays: ['일', '월', '화', '수', '목', '금', '토'],
  grassCaption: (zone: string) =>
    `최근 12주의 일별 토큰입니다. 칸 하나가 하루이고 주는 왼쪽에서 오른쪽으로 갑니다. 하루는 ${zone} 자정에 시작합니다.`,
  scaleNote: '칸의 짙기는 이 프로젝트가 많이 쓴 날을 기준으로 한 상대 눈금입니다',
  less: '적음',
  more: '많음',
  cellEmpty: (date: string) => `${date} · 기록된 호출 없음`,
  cellSpend: (date: string, tokens: string, cost: string, calls: string) =>
    `${date} · ${tokens} 토큰 · ${cost} · 호출 ${calls}건`,

  byFeature: '기능별',
  byModel: '모델별',
  featureAxis: '기능',
  modelAxis: '모델',
  embeddingNote: '임베딩은 출력 토큰이 항상 0입니다 — 벡터를 만들 뿐 토큰을 만들지 않습니다.',
  tokens: '토큰',
  share: '비중',
  cost: '비용',
  calls: '호출',

  services: {
    QA_RUN: 'QA 실행',
    SCENARIO: '시나리오 작성',
    KNOWLEDGE_QUERY: '지식 조회',
    GAME_CONTEXT: '기획서 읽기',
    EMBEDDING: '임베딩',
  },
}
