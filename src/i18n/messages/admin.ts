import type { Localized } from '../messages'

/**
 * Strings shared by every screen under `/admin`: the layout, the tabs, the
 * project picker, and the states every dashboard has. Each screen keeps its own
 * strings in its own `admin*.ts` file. See `common.ts` for the typing convention.
 */
export const adminEn = {
  /** The top-bar link. Only an `ADMIN` sees it. */
  shellLink: 'Admin',
  title: 'Admin',
  subtitle: 'Every project on this installation. Only administrators see these screens.',
  tabsLabel: 'Admin screens',
  tabs: {
    qa: 'QA runs',
    usage: 'Token usage',
    knowledge: 'Knowledge base',
    graph: 'Knowledge graph',
    labels: 'Expected verdict labels',
    users: 'Users',
    settings: 'Settings',
  },
  picker: {
    label: 'Project',
    all: 'All projects',
    loading: 'Loading…',
    none: 'No project to show',
    search: 'Find by name',
    noMatch: 'No project has that name',
    mine: 'My project',
    shown: (matches: number, total: number) => `${matches} of ${total}`,
  },
  states: {
    loading: 'Loading…',
    loadFailed: 'The data could not be loaded.',
    retry: 'Try again',
  },
}

export const adminKo: Localized<typeof adminEn> = {
  shellLink: '관리',
  title: '관리',
  subtitle: '이 설치의 모든 프로젝트를 봅니다. 관리자만 이 화면을 볼 수 있습니다.',
  tabsLabel: '관리 화면',
  tabs: {
    qa: 'QA 실행',
    usage: '토큰 사용량',
    knowledge: '지식창고',
    graph: '지식 그래프',
    labels: '기대 판정 라벨',
    users: '사용자',
    settings: '설정',
  },
  picker: {
    label: '프로젝트',
    all: '전체 프로젝트',
    loading: '불러오는 중…',
    none: '볼 수 있는 프로젝트 없음',
    search: '이름으로 찾기',
    noMatch: '찾는 이름이 없습니다',
    mine: '내 프로젝트',
    shown: (matches: number, total: number) => `${total}건 중 ${matches}건`,
  },
  states: {
    loading: '불러오는 중…',
    loadFailed: '데이터를 불러오지 못했습니다.',
    retry: '다시 시도',
  },
}
