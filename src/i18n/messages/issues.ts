import type { Localized } from '../messages'

/** Strings for `src/issues/*`. See `common.ts` for the typing convention. */
export const issuesEn = {
  severityLabels: {
    BLOCKER: 'Blocker',
    CRITICAL: 'Critical',
    MAJOR: 'Major',
    MINOR: 'Minor',
    TRIVIAL: 'Trivial',
  },
  statusLabels: {
    OPEN: 'Open',
    RESOLVED: 'Resolved',
  },
  page: {
    title: 'Issues',
    subtitle: 'Defects the QA agent found while running this project.',
    backToProject: '← Back to the project',
    projectLink: 'Issues',
  },
  panel: {
    title: 'Issues from this run',
    refresh: 'Refresh',
  },
  filters: {
    status: 'Status',
    severity: 'Severity',
    all: 'All',
  },
  list: {
    loading: 'Loading issues…',
    empty: 'No issues have been reported yet.',
    emptyFiltered: 'No issues match these filters.',
    loadFailed: 'Issues could not be loaded.',
    retry: 'Retry',
    loadMore: 'Load more',
    loadingMore: 'Loading…',
  },
  row: {
    reportedAt: (when: string) => `Found ${when}`,
    resolvedAt: (when: string) => `Resolved ${when}`,
    step: (step: number) => `Step ${step}`,
    openQaTry: 'Open the run',
    showDetail: 'Show detail',
    hideDetail: 'Hide detail',
    expected: 'Expected',
    actual: 'Actual',
    reproduction: 'Steps to reproduce',
    raw: 'Everything the agent sent',
    resolve: 'Mark resolved',
    reopen: 'Reopen',
    pending: 'Saving…',
    failed: 'That change could not be saved. Nothing was altered.',
  },
}

export const issuesKo: Localized<typeof issuesEn> = {
  severityLabels: {
    BLOCKER: '진행 불가',
    CRITICAL: '치명적',
    MAJOR: '주요',
    MINOR: '경미',
    TRIVIAL: '사소',
  },
  statusLabels: {
    OPEN: '미해결',
    RESOLVED: '해결됨',
  },
  page: {
    title: '이슈',
    subtitle: 'QA 에이전트가 이 프로젝트를 실행하며 발견한 결함입니다.',
    backToProject: '← 프로젝트로',
    projectLink: '이슈',
  },
  panel: {
    title: '이 실행이 남긴 이슈',
    refresh: '새로고침',
  },
  filters: {
    status: '상태',
    severity: '심각도',
    all: '전체',
  },
  list: {
    loading: '이슈를 불러오는 중…',
    empty: '아직 보고된 이슈가 없습니다.',
    emptyFiltered: '이 조건에 맞는 이슈가 없습니다.',
    loadFailed: '이슈를 불러오지 못했습니다.',
    retry: '다시 시도',
    loadMore: '더 보기',
    loadingMore: '불러오는 중…',
  },
  row: {
    reportedAt: (when: string) => `${when} 발견`,
    resolvedAt: (when: string) => `${when} 해결`,
    step: (step: number) => `${step}번 스텝`,
    openQaTry: '실행 열기',
    showDetail: '상세 보기',
    hideDetail: '상세 접기',
    expected: '기대',
    actual: '실제',
    reproduction: '재현 절차',
    raw: '에이전트가 보낸 전체 내용',
    resolve: '해결 처리',
    reopen: '되돌리기',
    pending: '저장하는 중…',
    failed: '변경하지 못했습니다. 아무것도 바뀌지 않았습니다.',
  },
}
