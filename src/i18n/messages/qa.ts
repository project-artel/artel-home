import type { Localized } from '../messages'

/** Strings for `src/qa/*`. See `common.ts` for the typing convention. */
export const qaEn = {
  statusLabels: {
    STARTING: 'Starting',
    RUNNING: 'Running',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
  },
  panel: {
    title: 'QA runs',
    hint: 'Run a scenario against a game. The game must be connected.',
    gameLabel: 'Game',
    gamePlaceholder: 'Select a game',
    scenarioLabel: 'Scenario',
    scenarioPlaceholder: 'Select a scenario',
    runButton: 'Run QA',
    starting: 'Starting…',
    untitledScenario: 'Untitled scenario',
    noGames: 'Add a game instance first.',
    noScenarios: 'Create a scenario first.',
    loading: 'Loading…',
    loadFailed: 'QA runs could not be loaded.',
    retry: 'Retry',
    empty: 'No QA runs yet.',
    startedAt: (when: string) => `Started ${when}`,
    openRun: 'QA Try',
  },
  errors: {
    missingSelection: 'Select a game and a scenario.',
    // The server answers 409 for both; the copy names the fix for each.
    sdkDisconnected:
      'That game is not connected. Start it with its instance key, then run QA again.',
    alreadyRunning: 'That game already has a QA run in progress. Open or finish it first.',
    startFailed: 'The QA run could not be started.',
  },
} as const

export const qaKo: Localized<typeof qaEn> = {
  statusLabels: {
    STARTING: '시작 중',
    RUNNING: '실행 중',
    COMPLETED: '완료',
    FAILED: '실패',
    CANCELLED: '취소됨',
  },
  panel: {
    title: 'QA 실행',
    hint: '시나리오를 게임으로 실행합니다. 게임이 연결되어 있어야 합니다.',
    gameLabel: '게임',
    gamePlaceholder: '게임을 선택하세요',
    scenarioLabel: '시나리오',
    scenarioPlaceholder: '시나리오를 선택하세요',
    runButton: 'QA 실행',
    starting: '시작하는 중…',
    untitledScenario: '제목 없는 시나리오',
    noGames: '게임 인스턴스를 먼저 추가하세요.',
    noScenarios: '시나리오를 먼저 만드세요.',
    loading: '불러오는 중…',
    loadFailed: 'QA 실행 목록을 불러오지 못했습니다.',
    retry: '다시 시도',
    empty: '아직 QA 실행이 없습니다.',
    startedAt: (when: string) => `${when} 시작`,
    openRun: 'QA Try',
  },
  errors: {
    missingSelection: '게임과 시나리오를 선택하세요.',
    sdkDisconnected: '그 게임이 연결되어 있지 않습니다. 인스턴스 키로 실행한 뒤 다시 시도하세요.',
    alreadyRunning: '그 게임에는 이미 진행 중인 QA가 있습니다. 먼저 열어보거나 종료하세요.',
    startFailed: 'QA를 시작하지 못했습니다.',
  },
}
