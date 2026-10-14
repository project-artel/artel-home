import type { Localized } from '../messages'

/** Strings for `src/admin/knowledge/*`. */
export const adminKnowledgeEn = {
  period: 'Period',
  startDate: 'Start date',
  endDate: 'End date',
  loadFailedTitle: 'Could not load knowledge statistics',
  noProjects: 'There are no projects to show. Knowledge statistics are available to project members.',
  truncated: (limit: string) =>
    `More than ${limit} combinations were found, so some rows were omitted. The tables below add up to less than the total above. Narrow the period to see all rows.`,
  citationUnknownNotice:
    'Citation status is unknown for searches in this period. The citation rate is unknown, not 0%. It will appear as runs that report citations accumulate.',
  axesTitle: 'Breakdown by axis',
  axesNote:
    'Versions deleted by later runs include repairs and discards · Citation rate counts searches with a known citation status, not all retrievals',
  loading: 'Loading knowledge statistics…',
  axes: {
    model: 'Model',
    reasoningEffort: 'Reasoning',
    promptVersion: 'Prompt',
    agentArch: 'Agent architecture',
  },
  createdVersions: 'Versions created',
  deletedByLaterRuns: 'Deleted by later runs',
  retrievals: 'Retrievals',
  citationRate: 'Citation rate',
  knownCitations: 'Citation status known',
  unknown: 'Unknown',
  total: 'Total',
  emptyPeriod: 'No knowledge was created in this period.',
  deletedRateTitle: (deleted: string, created: string) =>
    `Deleted by later runs ${deleted} / versions created ${created}`,
  deletedRateUnknown: 'This configuration created no versions.',
  citationRateTitle: (citations: string, known: string) =>
    `Citations ${citations} / known status ${known}`,
  citationRateUnknown: 'No searches have a known citation status. This is unknown, not 0%.',
  coverageTitle: (known: string, retrievals: string) =>
    `Known status ${known} / retrievals ${retrievals}`,
  coverageUnknown: 'There are no search records.',
  versionsNotEntries: 'Content versions, not entries',
  currentVersions: 'Still current',
  deletedVersions: (count: string) => `Deleted ${count}`,
  deletedRateHint: (count: string) => `${count} · includes repairs and discards`,
  retrievalHint: 'Times these versions entered context',
  noRetrievals: 'No search records',
  noKnownCitations: 'No searches have a known citation status',
  coverageHint: (rate: string, count: string) => `Known status ${rate} (${count})`,
} as const

export const adminKnowledgeKo: Localized<typeof adminKnowledgeEn> = {
  period: '기간',
  startDate: '시작일',
  endDate: '종료일',
  loadFailedTitle: '불러오지 못했습니다',
  noProjects: '참여 중인 프로젝트가 없습니다. 집계는 프로젝트 참여자에게만 보입니다.',
  truncated: (limit: string) =>
    `조합이 ${limit}개를 넘어 일부가 잘렸습니다. 아래 표의 합은 위 총계보다 작습니다. 기간을 좁히면 전체가 들어옵니다.`,
  citationUnknownNotice:
    '이 기간의 검색은 인용 여부를 알 수 없습니다. 인용률이 0%가 아니라 미상으로 나오는 이유이며, 인용 보고를 하는 런이 쌓이면 채워집니다.',
  axesTitle: '축별 분해',
  axesNote:
    '후속 런이 지운 비율에는 수리와 폐기가 섞여 있음 · 인용률의 분모는 검색 노출이 아니라 인용 판정이 가능했던 검색',
  loading: '집계를 불러오는 중입니다…',
  axes: {
    model: '모델',
    reasoningEffort: 'Reasoning',
    promptVersion: '프롬프트',
    agentArch: '에이전트 구조',
  },
  createdVersions: '만든 버전',
  deletedByLaterRuns: '후속 런이 지움',
  retrievals: '검색 노출',
  citationRate: '인용률',
  knownCitations: '판정 가능',
  unknown: '미상',
  total: '합계',
  emptyPeriod: '이 기간에 만들어진 지식이 없습니다.',
  deletedRateTitle: (deleted: string, created: string) =>
    `후속 런이 지움 ${deleted} / 만든 버전 ${created}`,
  deletedRateUnknown: '이 설정이 만든 버전이 없습니다.',
  citationRateTitle: (citations: string, known: string) =>
    `인용 ${citations} / 판정 가능 ${known}`,
  citationRateUnknown: '인용 여부를 알 수 있는 검색이 없습니다. 0%가 아니라 미상입니다.',
  coverageTitle: (known: string, retrievals: string) =>
    `판정 가능 ${known} / 검색 노출 ${retrievals}`,
  coverageUnknown: '검색 기록이 없습니다.',
  versionsNotEntries: '항목이 아니라 content 버전',
  currentVersions: '최신으로 남음',
  deletedVersions: (count: string) => `삭제 ${count}`,
  deletedRateHint: (count: string) => `${count}건 · 수리와 폐기가 섞임`,
  retrievalHint: '이 버전들이 컨텍스트에 들어간 횟수',
  noRetrievals: '검색 기록 없음',
  noKnownCitations: '인용 판정이 가능한 검색 없음',
  coverageHint: (rate: string, count: string) => `판정 가능 ${rate} (${count}건)`,
}
