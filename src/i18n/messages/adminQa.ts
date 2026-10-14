import type { Localized } from '../messages'

/**
 * Strings for `src/admin/qa/*`, the admin qa screen. See `common.ts` for the typing convention.
 *
 * A `**word**` pair in a string is rendered bold by `src/admin/qa/emphasize.tsx`; a `{name}`
 * placeholder in a template is replaced by a bold value there.
 */
export const adminQaEn = {
  /** Value label for an axis whose value was not recorded. It is not a value. */
  unknown: 'Unknown',
  /** The axes a run can be split by. */
  axes: {
    model: 'Model',
    reasoningEffort: 'Reasoning',
    promptVersion: 'Prompt',
    agentArch: 'Agent architecture',
  },
  noRuns: 'No run was executed in this period.',
  totalRow: 'Total',
  runsColumn: 'Runs',

  filters: {
    period: 'Period',
    startDate: 'Start date',
    endDate: 'End date',
    testRun: 'Test Run',
    label: 'Label',
    all: 'All',
    pickProjectFirst: 'Pick a project first',
    loading: 'Loading…',
  },
  loadFailedTitle: 'Could not load',
  noProjects: 'You are not in any project. The statistics are shown only to project members.',
  loadingStats: 'Loading the statistics…',
  /** Said once for the `test run` and `label` filters, alone or together. */
  scope: {
    both: 'Only QA runs with Test Run {testRun} and label {label}.',
    testRun: 'Only QA runs with Test Run {testRun}.',
    label: 'Only QA runs with label {label}.',
    reason:
      'Label and test run are both qa run columns, so a standalone run with no parent qa run has neither. Whichever you set, those runs always drop out of these numbers. To see everything, set the selection back to "All".',
  },
  truncated: (cellLimit: number) =>
    `The combinations went over ${cellLimit}, so some were cut off. The tables below add up to less than the totals above, and that includes **misses, false alarms and coverage** — the misses of a cut-off combination appear in no table below. Narrow the period and everything fits.`,

  axesSection: {
    title: 'By axis',
    /** The most misread number on this screen, so it is nailed down next to the title. */
    note: 'Completion rate is how many runs ran to the end, not the QA pass rate. Runs in progress and cancelled runs are left out of the denominator.',
  },
  axisTable: {
    completionRate: 'Completion',
    failed: 'Failed',
    tokens: 'Tokens',
    cost: 'Cost',
    avgDuration: 'Avg. duration',
  },
  completion: {
    detail: (completed: number, decided: number) =>
      `Completed ${completed} / decided ${decided}`,
  },

  rail: {
    totalRuns: 'All runs',
    inProgressCancelled: (active: string, cancelled: string) =>
      `In progress ${active} · cancelled ${cancelled}`,
    completionRate: 'Completion rate',
    completedFailed: (completed: string, failed: string) =>
      `Completed ${completed} · failed ${failed}`,
    stepPassRate: 'Step pass rate',
    stepPassDetail: (passed: number, total: number) => `Passed ${passed} / steps ${total}`,
    verdictCoverage: (coverage: string, known: string, runs: string) =>
      `Verdict coverage ${coverage} · runs ${known}/${runs}`,
    missFalseAlarm: 'Misses / false alarms',
    missFalseAlarmTitle: (miss: number, falseAlarm: number) =>
      `${miss} misses · ${falseAlarm} false alarms`,
    noScoredRuns: 'No run graded against expected labels',
    scoreCoverage: (coverage: string, unreported: string) =>
      `Grading coverage ${coverage} · unreported ${unreported}`,
    llmTokens: 'LLM tokens',
    tokensInOut: (input: string, output: string) => `Input ${input} · output ${output}`,
    llmCost: 'LLM cost',
    noPricedCall: 'No call with a known unit price',
    calls: (calls: string) => `${calls} calls`,
    avgDuration: 'Average time to complete',
    completedOnly: 'Completed runs only',
  },

  score: {
    title: 'Verdicts and grading',
    note: 'Pass rates are the agent grading itself. Misses and false alarms are checked against the expected labels a person set.',
    axis: 'Axis',
    verdictCoverage: 'Verdict coverage',
    stepPassRate: 'Step pass rate',
    casePassRate: 'TC pass rate',
    scoreCoverage: 'Grading coverage',
    missRate: 'Miss rate',
    falseAlarmRate: 'False alarm rate',
    unreportedRate: 'Unreported rate',
    footnote:
      'A miss is **a step that should fail but was reported as passed**, so it is a bug not found; a false alarm is the opposite. The two rates have different denominators (steps expected to fail, steps expected to pass). A step with no verdict falls in neither, and the unreported rate carries it.',
    noVerdict: 'No verdict',
    noGrading: 'Not graded',
    stepDetail: (passed: number, steps: number, runs: number) =>
      `Passed ${passed} / steps ${steps} · ${runs} runs`,
    caseDetail: (passed: number, cases: number, runs: number) =>
      `Passed ${passed} / TC ${cases} · ${runs} runs`,
    missDetail: (miss: number, expectedFail: number) =>
      `Misses ${miss} / expected to fail ${expectedFail}`,
    falseAlarmDetail: (falseAlarm: number, expectedPass: number) =>
      `False alarms ${falseAlarm} / expected to pass ${expectedPass}`,
    unreportedDetail: (unreported: number, graded: number) =>
      `Unreported ${unreported} / graded ${graded}`,
  },
  coverage: {
    detail: (known: string, runs: string) => `${known} of ${runs} runs`,
  },

  matrix: {
    title: 'Axis combinations',
    emptyCellsNote: 'An empty cell is a combination not run yet',
    metric: 'Metric',
    row: 'Row',
    column: 'Column',
    metrics: {
      completion: {
        label: 'Completion rate',
        note: 'A cell shows the run count and the completion rate. Completed means the run went to the end, not that QA passed',
      },
      stepPass: {
        label: 'Step pass rate',
        note: 'A cell shows the run count, the self-graded step pass rate, and the verdict coverage that rate rests on',
      },
      miss: {
        label: 'Miss rate',
        note: 'A cell shows the run count, the share of steps expected to fail that were reported as passed, and the grading coverage that share rests on',
      },
    },
    caption: (row: string, column: string, metric: string) =>
      `Row ${row} × column ${column} · metric ${metric}`,
    noRun: 'Not run',
    noSample: 'No sample',
    coverageTitle: (known: number, runs: number) =>
      `${known} of ${runs} runs this rate rests on`,
  },

  recent: {
    title: 'Recent runs',
    note: 'Newest first · the run settings are the values the Agent confirmed',
    needProject:
      'Recent runs appear once you pick one project. This list is every single run, not a sum, so under "All projects" each row would come from a different project and the table could not be read.',
    start: 'Started',
    status: 'Status',
    model: 'Model',
    reasoning: 'Reasoning',
    prompt: 'Prompt',
    architecture: 'Architecture',
    fingerprint: 'Fingerprint',
    runId: 'Run ID',
    empty: 'No run is recorded for this project.',
    statuses: {
      STARTING: 'Starting',
      RUNNING: 'Running',
      COMPLETED: 'Completed',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    },
  },
}

export const adminQaKo: Localized<typeof adminQaEn> = {
  unknown: '미상',
  axes: {
    model: '모델',
    reasoningEffort: 'Reasoning',
    promptVersion: '프롬프트',
    agentArch: '에이전트 구조',
  },
  noRuns: '이 기간에 실행된 런이 없습니다.',
  totalRow: '합계',
  runsColumn: '런',

  filters: {
    period: '기간',
    startDate: '시작일',
    endDate: '종료일',
    testRun: 'Test Run',
    label: 'Label',
    all: '전체',
    pickProjectFirst: '프로젝트를 먼저 고르세요',
    loading: '불러오는 중…',
  },
  loadFailedTitle: '불러오지 못했습니다',
  noProjects: '참여 중인 프로젝트가 없습니다. 집계는 프로젝트 참여자에게만 보입니다.',
  loadingStats: '집계를 불러오는 중입니다…',
  // "N인"·"N이고" 형태를 쓰는 이유는 test run 이름과 label 이 자유 문자열이라 받침 유무로 갈리는
  // 조사를 뒤에 붙일 수 없기 때문이다. "이다"의 활용형은 받침과 무관하게 항상 같은 형태다.
  scope: {
    both: 'Test Run {testRun}이고 label {label}인 QA run만 봅니다.',
    testRun: 'Test Run {testRun}인 QA run만 봅니다.',
    label: 'label {label}인 QA run만 봅니다.',
    reason:
      'label과 test run은 둘 다 qa run 컬럼이라, 부모 qa run이 없는 단독 실행 런에는 둘 다 없습니다 — 어느 쪽을 걸어도 그 런들은 이 집계에서 항상 빠집니다. 전체를 보려면 선택을 다시 "전체"로 되돌리세요.',
  },
  truncated: (cellLimit: number) =>
    `조합이 ${cellLimit}개를 넘어 일부가 잘렸습니다. 아래 표의 합은 위 총계보다 작고, 여기에는 **미탐·오탐과 커버리지도 포함됩니다** — 잘린 조합의 미탐은 아래 어느 표에도 나타나지 않습니다. 기간을 좁히면 전체가 들어옵니다.`,

  axesSection: {
    title: '축별 분해',
    note: '완주율은 QA 통과율이 아니라 런이 끝까지 돌았는지의 비율. 진행 중·취소는 분모에서 제외',
  },
  axisTable: {
    completionRate: '완주율',
    failed: '실패',
    tokens: '토큰',
    cost: '비용',
    avgDuration: '평균 소요',
  },
  completion: {
    detail: (completed: number, decided: number) => `완주 ${completed} / 판정 ${decided}`,
  },

  rail: {
    totalRuns: '전체 런',
    inProgressCancelled: (active: string, cancelled: string) =>
      `진행 중 ${active} · 취소 ${cancelled}`,
    completionRate: '완주율',
    completedFailed: (completed: string, failed: string) => `완주 ${completed} · 실패 ${failed}`,
    stepPassRate: '스텝 합격률',
    stepPassDetail: (passed: number, total: number) => `통과 ${passed} / 스텝 ${total}`,
    verdictCoverage: (coverage: string, known: string, runs: string) =>
      `판정 커버리지 ${coverage} · 런 ${known}/${runs}`,
    missFalseAlarm: '미탐 / 오탐',
    missFalseAlarmTitle: (miss: number, falseAlarm: number) =>
      `미탐 ${miss}건 · 오탐 ${falseAlarm}건`,
    noScoredRuns: '기대 라벨로 채점된 런 없음',
    scoreCoverage: (coverage: string, unreported: string) =>
      `채점 커버리지 ${coverage} · 미보고 ${unreported}`,
    llmTokens: 'LLM 토큰',
    tokensInOut: (input: string, output: string) => `입력 ${input} · 출력 ${output}`,
    llmCost: 'LLM 비용',
    noPricedCall: '단가를 아는 호출 없음',
    calls: (calls: string) => `호출 ${calls}건`,
    avgDuration: '평균 완주 소요',
    completedOnly: '완주한 런만',
  },

  score: {
    title: '판정과 채점',
    note: '합격률은 에이전트의 자기채점. 미탐·오탐은 사람이 단 기대 라벨과 대조한 결과',
    axis: '축',
    verdictCoverage: '판정 커버리지',
    stepPassRate: '스텝 합격률',
    casePassRate: 'TC 합격률',
    scoreCoverage: '채점 커버리지',
    missRate: '미탐률',
    falseAlarmRate: '오탐률',
    unreportedRate: '미보고율',
    footnote:
      '미탐은 **실패해야 하는 스텝을 통과라 보고한 것**이라 못 찾은 버그가 되고, 오탐은 그 반대다. 두 비율의 분모가 서로 다르다(각각 실패 기대 스텝 수, 통과 기대 스텝 수). 판정이 오지 않은 스텝은 어느 쪽에도 들지 않고 미보고율이 따로 진다.',
    noVerdict: '판정 없음',
    noGrading: '채점 없음',
    stepDetail: (passed: number, steps: number, runs: number) =>
      `통과 ${passed} / 스텝 ${steps} · 런 ${runs}건`,
    caseDetail: (passed: number, cases: number, runs: number) =>
      `통과 ${passed} / TC ${cases} · 런 ${runs}건`,
    missDetail: (miss: number, expectedFail: number) =>
      `미탐 ${miss} / 실패 기대 ${expectedFail}`,
    falseAlarmDetail: (falseAlarm: number, expectedPass: number) =>
      `오탐 ${falseAlarm} / 통과 기대 ${expectedPass}`,
    unreportedDetail: (unreported: number, graded: number) =>
      `미보고 ${unreported} / 채점 대상 ${graded}`,
  },
  coverage: {
    detail: (known: string, runs: string) => `런 ${runs}건 중 ${known}건`,
  },

  matrix: {
    title: '축 조합 비교',
    emptyCellsNote: '빈 칸은 아직 돌려 보지 않은 조합',
    metric: '지표',
    row: '행',
    column: '열',
    metrics: {
      completion: {
        label: '완주율',
        note: '칸은 런 수와 완주율. 완주는 QA 통과가 아니라 런이 끝까지 돌았다는 뜻',
      },
      stepPass: {
        label: '스텝 합격률',
        note: '칸은 런 수, 자기채점 스텝 합격률, 그 비율이 얹힌 판정 커버리지',
      },
      miss: {
        label: '미탐률',
        note: '칸은 런 수, 실패 기대 스텝 중 통과라 보고한 비율, 그 비율이 얹힌 채점 커버리지',
      },
    },
    caption: (row: string, column: string, metric: string) =>
      `행 ${row} × 열 ${column} · 지표 ${metric}`,
    noRun: '실행 없음',
    noSample: '표본 없음',
    coverageTitle: (known: number, runs: number) =>
      `이 비율이 얹힌 런 ${known}건 / 전체 ${runs}건`,
  },

  recent: {
    title: '최근 런',
    note: '최신순 · 실행 설정은 Agent가 확정한 값',
    needProject:
      '최근 런은 프로젝트를 하나 골라야 나옵니다. 이 목록은 합산하는 집계가 아니라 런 하나하나라, 전체를 고르면 어느 프로젝트의 런인지 줄마다 달라 표가 읽히지 않습니다.',
    start: '시작',
    status: '상태',
    model: '모델',
    reasoning: 'Reasoning',
    prompt: '프롬프트',
    architecture: '구조',
    fingerprint: '지문',
    runId: '런 ID',
    empty: '이 프로젝트에 기록된 런이 없습니다.',
    statuses: {
      STARTING: '시작 중',
      RUNNING: '실행 중',
      COMPLETED: '완주',
      FAILED: '실패',
      CANCELLED: '취소',
    },
  },
}
