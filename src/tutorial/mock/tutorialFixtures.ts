import type { TutorialSession } from './tutorialMode'

/**
 * 튜토리얼 목데이터(ARTEL-1461). 예시 게임 "별빛 정원"을 처음부터 지어낸 것이다 — 어느 사용자의 프로젝트에서도 가져오지
 * 않았다. 모양은 서버 응답과 같고, 화면 파서가 읽는 칸만 채운다(나머지는 파서가 기본값으로 받는다).
 *
 * 튜토리얼을 시작할 때마다 새로 만든다. 사용자가 눌러 더한 것(Test Case · 테스트 런 · 공유 글)은 이 안에만 쌓였다가
 * 튜토리얼이 끝나면 사라진다.
 */

type Text = { ko: string; en: string }

const SCENES = {
  title: { ko: '타이틀', en: 'Title' },
  lobby: { ko: '로비', en: 'Lobby' },
  garden: { ko: '정원', en: 'Garden' },
  shop: { ko: '상점', en: 'Shop' },
  settings: { ko: '설정', en: 'Settings' },
} satisfies Record<string, Text>

type SceneKey = keyof typeof SCENES

type CaseSeed = {
  scene: SceneKey
  arrivesAt?: SceneKey
  precondition: Text
  step: Text
  expected: Text
  status: 'VERIFIED' | 'FAILED' | 'DRAFT'
  kind: 'FUNCTION' | 'EXCEPTION'
  folder: 'start' | 'garden' | 'shop' | 'settings'
}

const CASES: CaseSeed[] = [
  { scene: 'title', arrivesAt: 'lobby', folder: 'start', kind: 'FUNCTION', status: 'VERIFIED',
    precondition: { ko: '게임을 처음 켰다', en: 'The game was just launched' },
    step: { ko: '시작 버튼을 누른다', en: 'Press Start' },
    expected: { ko: '로비가 열린다', en: 'The lobby opens' } },
  { scene: 'lobby', arrivesAt: 'garden', folder: 'start', kind: 'FUNCTION', status: 'VERIFIED',
    precondition: { ko: '로비가 열려 있다', en: 'The lobby is open' },
    step: { ko: '정원 버튼을 누른다', en: 'Press Garden' },
    expected: { ko: '정원이 열리고 씨앗 3개가 보인다', en: 'The garden opens with 3 seeds' } },
  { scene: 'garden', folder: 'garden', kind: 'FUNCTION', status: 'VERIFIED',
    precondition: { ko: '빈 밭이 하나 이상 있다', en: 'At least one plot is empty' },
    step: { ko: '씨앗을 빈 밭에 끌어 놓는다', en: 'Drag a seed onto an empty plot' },
    expected: { ko: '새싹이 자라고 물 주기 아이콘이 뜬다', en: 'A sprout grows and a watering icon appears' } },
  { scene: 'garden', folder: 'garden', kind: 'FUNCTION', status: 'FAILED',
    precondition: { ko: '새싹이 자란 밭이 있다', en: 'A plot has a sprout' },
    step: { ko: '물 주기 아이콘을 누른다', en: 'Press the watering icon' },
    expected: { ko: '성장 게이지가 한 칸 오른다', en: 'The growth gauge rises by one' } },
  { scene: 'garden', folder: 'garden', kind: 'FUNCTION', status: 'VERIFIED',
    precondition: { ko: '다 자란 꽃이 있다', en: 'A flower is fully grown' },
    step: { ko: '다 자란 꽃을 누른다', en: 'Press the grown flower' },
    expected: { ko: '꽃이 수확되고 코인이 10 오른다', en: 'The flower is harvested and coins rise by 10' } },
  { scene: 'shop', folder: 'shop', kind: 'FUNCTION', status: 'VERIFIED',
    precondition: { ko: '코인이 50 이상 있다', en: 'You have 50 coins or more' },
    step: { ko: '씨앗 묶음을 산다', en: 'Buy a seed pack' },
    expected: { ko: '코인이 50 줄고 씨앗이 5개 는다', en: 'Coins drop by 50 and seeds rise by 5' } },
  { scene: 'shop', folder: 'shop', kind: 'EXCEPTION', status: 'FAILED',
    precondition: { ko: '코인이 50보다 적다', en: 'You have fewer than 50 coins' },
    step: { ko: '씨앗 묶음 구매 버튼을 누른다', en: 'Press Buy on a seed pack' },
    expected: { ko: '구매되지 않고 코인 부족 안내가 뜬다', en: 'Nothing is bought and a not-enough-coins notice shows' } },
  { scene: 'settings', folder: 'settings', kind: 'FUNCTION', status: 'DRAFT',
    precondition: { ko: '효과음이 켜져 있다', en: 'Sound effects are on' },
    step: { ko: '효과음을 끈다', en: 'Turn sound effects off' },
    expected: { ko: '효과음이 꺼지고 다시 들어와도 유지된다', en: 'They stay off after reopening' } },
  { scene: 'lobby', arrivesAt: 'garden', folder: 'start', kind: 'FUNCTION', status: 'DRAFT',
    precondition: { ko: '저장된 정원이 있다', en: 'A saved garden exists' },
    step: { ko: '이어하기를 누른다', en: 'Press Continue' },
    expected: { ko: '마지막 정원 상태가 그대로 열린다', en: 'The garden opens as last saved' } },
  { scene: 'garden', folder: 'garden', kind: 'EXCEPTION', status: 'DRAFT',
    precondition: { ko: '밭이 모두 차 있다', en: 'Every plot is taken' },
    step: { ko: '씨앗을 밭에 끌어 놓는다', en: 'Drag a seed onto a plot' },
    expected: { ko: '빈 밭이 없다는 안내가 뜬다', en: 'A no-empty-plot notice shows' } },
  { scene: 'garden', folder: 'garden', kind: 'FUNCTION', status: 'DRAFT',
    precondition: { ko: '낮 시간이 끝났다', en: 'Daytime is over' },
    step: { ko: '해가 지기를 기다린다', en: 'Wait for sunset' },
    expected: { ko: '하늘이 어두워지고 반딧불이가 나타난다', en: 'The sky darkens and fireflies appear' } },
  { scene: 'settings', folder: 'settings', kind: 'FUNCTION', status: 'DRAFT',
    precondition: { ko: '배경음이 켜져 있다', en: 'Music is on' },
    step: { ko: '배경음 볼륨을 0으로 내린다', en: 'Turn the music volume to 0' },
    expected: { ko: '배경음이 들리지 않는다', en: 'No music plays' } },
]

const FOLDERS = {
  start: { id: '9301', name: { ko: '타이틀 · 로비', en: 'Title · Lobby' } },
  garden: { id: '9302', name: { ko: '정원', en: 'Garden' } },
  shop: { id: '9303', name: { ko: '상점', en: 'Shop' } },
  settings: { id: '9304', name: { ko: '설정', en: 'Settings' } },
}

export const IDS = {
  build: '9001',
  instance: '9101',
  firstCase: 9201,
  runHarvest: '9401',
  runShop: '9402',
  scenarioHarvest: 9501,
  scenarioShop: 9502,
  qaRunHarvest: '9601',
  qaRunShop: '9602',
  tryHarvest: '9701',
  tryShop: '9702',
  issueWater: '9801',
  issueCoins: '9802',
  teammate: '9901',
}

const MODEL_ID = 'claude/claude-sonnet-5-5'

export type TutorialData = ReturnType<typeof buildTutorialData>

type MockCase = {
  id: string
  /** 화면의 TC 번호(TC-001). 새로 더해도 앞 번호가 밀리지 않게 고정해 둔다. */
  number: number
  projectId: string
  scene: string
  step: string
  precondition: string
  expectedValue: string
  verificationStatus: string
  lastVerifiedBuildId: string | null
  createdAt: string
  folderId: string | null
  origin: string
  functions: null
  kind: string
  arrivesAt: string | null
  reviewStatus: string
  reviewRequestedBy: null
  observe: null
}

type MockRun = {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  gameBuild: { gameBuildId: string; version: string; label: null; isEditor: boolean }
  folderId: string | null
  scenarioCount: number
  lastQaRun: { qaRunId: string; status: string; startedAt: string; passed: number; failed: number; total: number } | null
}

export function buildTutorialData(session: TutorialSession, now: Date = new Date()) {
  const t = (text: Text) => text[session.locale]
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
  const projectId = session.projectId
  const gameBuild = { gameBuildId: IDS.build, version: '1.0', label: null, isEditor: true }

  const cases: MockCase[] = CASES.map((seed, index) => ({
    id: String(IDS.firstCase + index),
    number: index + 1,
    projectId,
    scene: t(SCENES[seed.scene]),
    step: t(seed.step),
    precondition: t(seed.precondition),
    expectedValue: t(seed.expected),
    verificationStatus: seed.status,
    lastVerifiedBuildId: seed.status === 'DRAFT' ? null : IDS.build,
    createdAt: at(60 * 24 * 3 - index),
    folderId: FOLDERS[seed.folder].id,
    origin: 'MANUAL',
    functions: null,
    kind: seed.kind,
    arrivesAt: seed.arrivesAt === undefined ? null : t(SCENES[seed.arrivesAt]),
    reviewStatus: 'READY',
    reviewRequestedBy: null,
    observe: null,
  }))
  const caseId = (number: number) => String(IDS.firstCase + number - 1)

  const scenarioStep = (number: number) => ({
    action: cases[number - 1].step,
    case_id: Number(caseId(number)),
    hint: null,
    input: null,
    expected_passed: null,
    step_source: 'CASE',
    step_kind: 'ACTION',
    step_source_capability_id: null,
    step_unknown_reason: null,
    recommendation_id: null,
  })

  const scenarios = [
    {
      testScenarioId: IDS.scenarioHarvest,
      runId: IDS.runHarvest,
      title: t({ ko: '새 게임부터 첫 수확까지', en: 'New game to first harvest' }),
      description: t({ ko: '씨앗을 심고 물을 줘서 첫 꽃을 수확한다', en: 'Plant, water and harvest the first flower' }),
      steps: [1, 2, 3, 4, 5].map(scenarioStep),
      createdAt: at(60 * 26),
    },
    {
      testScenarioId: IDS.scenarioShop,
      runId: IDS.runShop,
      title: t({ ko: '상점에서 씨앗을 사고 설정 확인', en: 'Buy seeds and check settings' }),
      description: t({ ko: '코인으로 씨앗을 사고 소리 설정을 바꾼다', en: 'Buy seeds with coins and change sound settings' }),
      steps: [6, 7, 8].map(scenarioStep),
      createdAt: at(60 * 25),
    },
  ]

  const runs: MockRun[] = [
    {
      id: IDS.runHarvest,
      projectId,
      name: scenarios[0].title,
      description: null,
      createdAt: at(60 * 26),
      gameBuild,
      folderId: null,
      scenarioCount: 1,
      lastQaRun: { qaRunId: IDS.qaRunHarvest, status: 'COMPLETED', startedAt: at(40), passed: 4, failed: 1, total: 5 },
    },
    {
      id: IDS.runShop,
      projectId,
      name: t({ ko: '상점 · 설정 확인', en: 'Shop · settings check' }),
      description: null,
      createdAt: at(60 * 25),
      gameBuild,
      folderId: null,
      scenarioCount: 1,
      lastQaRun: { qaRunId: IDS.qaRunShop, status: 'COMPLETED', startedAt: at(90), passed: 1, failed: 1, total: 3 },
    },
  ]

  const qaRun = (id: string, run: MockRun, started: number, passed: number, failed: number, total: number, issues: number) => ({
    id,
    testRunId: run.id,
    testRunName: run.name,
    gameInstanceId: IDS.instance,
    gameInstanceName: t({ ko: '개발용 PC', en: 'Dev PC' }),
    gameBuildVersion: '1.0',
    gameBuildIsEditor: true,
    model: MODEL_ID,
    reasoningEffort: null,
    keySource: 'user',
    status: 'COMPLETED',
    startedAt: at(started),
    completedAt: at(started - 12),
    casesPassed: passed,
    casesTotal: total,
    issueCount: issues,
    startedBy: session.user.id,
    reviewFlagged: 0,
    reviewPending: failed,
    casesFailed: failed,
    stepsPassed: passed,
    stepsTotal: total,
  })
  const qaRuns = [
    qaRun(IDS.qaRunHarvest, runs[0], 40, 4, 1, 5, 1),
    qaRun(IDS.qaRunShop, runs[1], 90, 1, 1, 3, 1),
  ]

  const evidence: Record<number, { passed: boolean; message: Text }> = {
    1: { passed: true, message: { ko: '시작 버튼을 누르자 `Game.State` 가 `Title` 에서 `Lobby` 로 바뀌었고 로비 화면이 보인다.', en: 'After pressing Start, `Game.State` went from `Title` to `Lobby` and the lobby is on screen.' } },
    2: { passed: true, message: { ko: '정원이 열렸고 `Garden.Seeds.count` 가 3 이다. 씨앗 3개가 화면 아래에 보인다.', en: 'The garden opened and `Garden.Seeds.count` is 3. Three seeds show at the bottom.' } },
    3: { passed: true, message: { ko: '씨앗을 2번 밭에 놓자 `Garden.Plot[2].state` 가 `Sprout` 가 됐고 물 주기 아이콘이 떴다.', en: 'Dropping a seed on plot 2 set `Garden.Plot[2].state` to `Sprout` and the watering icon appeared.' } },
    4: { passed: false, message: { ko: '물 주기 아이콘을 눌렀지만 `Garden.Plot[2].growth` 가 0 에서 바뀌지 않았다. 아이콘은 사라졌고 성장 게이지는 그대로다.', en: 'After pressing the watering icon, `Garden.Plot[2].growth` stayed at 0. The icon disappeared but the gauge did not move.' } },
    5: { passed: true, message: { ko: '다 자란 꽃을 눌러 `Wallet.coins` 가 40 에서 50 으로 올랐고 꽃이 밭에서 사라졌다.', en: 'Pressing the grown flower raised `Wallet.coins` from 40 to 50 and cleared the plot.' } },
    6: { passed: true, message: { ko: '씨앗 묶음을 사자 `Wallet.coins` 가 80 에서 30 으로, `Garden.Seeds.count` 가 3 에서 8 로 바뀌었다.', en: 'Buying a seed pack moved `Wallet.coins` from 80 to 30 and `Garden.Seeds.count` from 3 to 8.' } },
    7: { passed: false, message: { ko: '코인이 30 일 때 구매 버튼을 누르자 `Wallet.coins` 가 -20 이 됐다. 코인이 모자라도 구매가 막히지 않았다.', en: 'With 30 coins, pressing Buy left `Wallet.coins` at -20. The purchase was not blocked.' } },
  }

  const verdictTry = (tryId: string, scenario: (typeof scenarios)[number], numbers: number[], judgedFrom: number, issue: { id: string; title: string; step: number }) => ({
    qaTryId: tryId,
    testScenarioId: String(scenario.testScenarioId),
    scenarioTitle: scenario.title,
    executionMode: 'ORDERED',
    status: 'COMPLETED',
    model: MODEL_ID,
    startedAt: at(judgedFrom),
    completedAt: at(judgedFrom - 12),
    steps: numbers.map((number, index) => ({ step: index + 1, title: cases[number - 1].step, caseId: caseId(number), expected: cases[number - 1].expectedValue })),
    verdicts: numbers
      .filter((number) => evidence[number] !== undefined)
      .map((number, index) => ({
        logId: `${tryId}${index + 1}`,
        step: numbers.indexOf(number) + 1,
        stepTitle: cases[number - 1].step,
        caseId: caseId(number),
        isVerification: true,
        passed: evidence[number].passed,
        message: t(evidence[number].message),
        reason: null,
        evidence: 'state',
        checks: null,
        captures: [],
        actions: [{ kind: 'tap', label: cases[number - 1].step, count: 1 }],
        judgedAt: at(judgedFrom - 2 - index),
        codeCheck: null,
        needsReview: false,
        humanDecision: null,
      })),
    issues: [{ issueId: issue.id, title: issue.title, severity: 'MAJOR', step: issue.step }],
    reviewCount: numbers.length,
    reviewedCount: 0,
    reportingUnit: 'TEST_CASE',
  })

  const issueSeeds = [
    {
      id: IDS.issueWater,
      number: '1',
      tryId: IDS.tryHarvest,
      qaRunId: IDS.qaRunHarvest,
      scenario: scenarios[0],
      run: runs[0],
      caseNumber: 4,
      step: 4,
      minutesAgo: 32,
      title: t({ ko: '물 주기 뒤 성장 게이지가 오르지 않음', en: 'Growth gauge does not rise after watering' }),
      actual: t({ ko: '물 주기 아이콘을 눌렀지만 성장 게이지가 0 에서 그대로였다. 아이콘은 사라졌다.', en: 'After pressing the watering icon the gauge stayed at 0. The icon disappeared.' }),
      reproduction: [
        t({ ko: '새 게임을 시작한다', en: 'Start a new game' }),
        t({ ko: '씨앗을 빈 밭에 놓는다', en: 'Drop a seed on an empty plot' }),
        t({ ko: '물 주기 아이콘을 누른다', en: 'Press the watering icon' }),
      ],
    },
    {
      id: IDS.issueCoins,
      number: '2',
      tryId: IDS.tryShop,
      qaRunId: IDS.qaRunShop,
      scenario: scenarios[1],
      run: runs[1],
      caseNumber: 7,
      step: 2,
      minutesAgo: 80,
      title: t({ ko: '코인이 모자라도 씨앗 묶음이 구매됨', en: 'Seed pack can be bought without enough coins' }),
      actual: t({ ko: '코인 30 에서 구매 버튼을 누르자 코인이 -20 이 되고 씨앗이 5개 늘었다.', en: 'With 30 coins, pressing Buy left -20 coins and added 5 seeds.' }),
      reproduction: [
        t({ ko: '코인을 30 으로 맞춘다', en: 'Set coins to 30' }),
        t({ ko: '상점을 연다', en: 'Open the shop' }),
        t({ ko: '씨앗 묶음 구매 버튼을 누른다', en: 'Press Buy on a seed pack' }),
      ],
    },
  ]

  const issues = issueSeeds.map((seed) => ({
    id: seed.id,
    qaTryId: seed.tryId,
    severity: 'MAJOR',
    title: seed.title,
    detail: {
      step: seed.step,
      title: seed.title,
      actual: seed.actual,
      expected: cases[seed.caseNumber - 1].expectedValue,
      severity: 'MAJOR',
      reproduction: seed.reproduction,
    },
    status: 'OPEN',
    reportedAt: at(seed.minutesAgo),
    createdAt: at(seed.minutesAgo),
    resolvedAt: null,
    resolvedBy: null,
    tracker: null,
    qaRunId: seed.qaRunId,
    origin: {
      testScenarioId: String(seed.scenario.testScenarioId),
      testScenarioTitle: seed.scenario.title,
      testRunId: seed.run.id,
      testRunName: seed.run.name,
      gameBuildId: IDS.build,
      buildVersion: '1.0',
      buildLabel: null,
      model: MODEL_ID,
      qaRunStartedAt: at(seed.minutesAgo + 10),
    },
    number: seed.number,
    archivedAt: null,
    categories: [],
    testCaseId: caseId(seed.caseNumber),
  }))

  const verdicts = {
    [IDS.qaRunHarvest]: {
      qaRunId: IDS.qaRunHarvest,
      testRunId: runs[0].id,
      testRunName: runs[0].name,
      gameBuildVersion: '1.0',
      gameBuildIsEditor: true,
      status: 'COMPLETED',
      startedAt: at(40),
      completedAt: at(28),
      tries: [verdictTry(IDS.tryHarvest, scenarios[0], [1, 2, 3, 4, 5], 40, { id: IDS.issueWater, title: issues[0].title, step: 4 })],
    },
    [IDS.qaRunShop]: {
      qaRunId: IDS.qaRunShop,
      testRunId: runs[1].id,
      testRunName: runs[1].name,
      gameBuildVersion: '1.0',
      gameBuildIsEditor: true,
      status: 'COMPLETED',
      startedAt: at(90),
      completedAt: at(78),
      tries: [verdictTry(IDS.tryShop, scenarios[1], [6, 7, 8], 90, { id: IDS.issueCoins, title: issues[1].title, step: 2 })],
    },
  } as Record<string, unknown>

  // TC 마다 한 번의 시도. 판정 화면의 TC 카드가 이것을 읽고, `logId` 로 위의 Agent 근거와 이어진다.
  const attempts = Object.values(verdicts as Record<string, { qaRunId: string; tries: ReturnType<typeof verdictTry>[] }>).flatMap((run) =>
    run.tries.flatMap((one) =>
      one.verdicts.map((verdict) => {
        const testCase = cases.find((entry) => entry.id === verdict.caseId)
        return {
          id: `attempt-${verdict.logId}`,
          qaTryId: one.qaTryId,
          qaRunId: run.qaRunId,
          testCaseId: verdict.caseId,
          startedAt: verdict.judgedAt,
          finishedAt: verdict.judgedAt,
          verdict: verdict.passed ? 'PASSED' : 'FAILED',
          logId: verdict.logId,
          review: null as string | null,
          note: null,
          originalReason: verdict.message,
          createdAt: verdict.judgedAt,
          caseSnapshot: { scene: testCase?.scene ?? null, precondition: testCase?.precondition ?? null, test_step: testCase?.step ?? null, expected: testCase?.expectedValue ?? null },
        }
      }),
    ),
  )

  const tries = [
    { id: IDS.tryHarvest, testScenarioId: String(IDS.scenarioHarvest), qaRunId: IDS.qaRunHarvest, startedAt: at(40), completedAt: at(28) },
    { id: IDS.tryShop, testScenarioId: String(IDS.scenarioShop), qaRunId: IDS.qaRunShop, startedAt: at(90), completedAt: at(78) },
  ].map((entry) => ({
    ...entry,
    gameInstanceId: IDS.instance,
    startedBy: session.user.id,
    status: 'COMPLETED',
    model: MODEL_ID,
    promptVersion: null,
    agentArch: null,
    agentFingerprint: null,
    runConfig: null,
    knowledgeScopeId: null,
    cheatMode: 'on',
    behaviorMode: 'on',
    allowedCheats: null,
    allowedBehaviors: null,
    effectiveCheats: [],
    effectiveBehaviors: [],
    stop: null,
    inputMode: 'virtual',
  }))

  const scenarioTitleOf = (tryId: string) => (tryId === IDS.tryHarvest ? scenarios[0].title : scenarios[1].title)
  const tryDetail = (tryId: string) => ({
    qaTryId: tryId,
    status: 'COMPLETED',
    scenarioTitle: scenarioTitleOf(tryId),
    model: MODEL_ID,
    promptVersion: null,
    reasoningEffort: null,
    startedAt: tries.find((one) => one.id === tryId)?.startedAt ?? at(30),
    completedAt: tries.find((one) => one.id === tryId)?.completedAt ?? at(20),
    stepsPassed: tryId === IDS.tryHarvest ? 4 : 1,
    stepsTotal: tryId === IDS.tryHarvest ? 5 : 3,
    issues: 1,
    feedback: 0,
    usage: { calls: 18, pricedCalls: 18, costUsd: 0.42, costEstimated: false, inputTokens: 182_000, cachedInputTokens: 140_000, cacheWriteTokens: 12_000, outputTokens: 6_400 },
    toolCalls: [],
    cheatMode: 'on',
    behaviorMode: 'on',
    allowedCheats: null,
    allowedBehaviors: null,
    effectiveCheats: [],
    effectiveBehaviors: [],
  })

  const models = [
    { id: MODEL_ID, label: 'Claude Sonnet 5.5 (Claude API)', provider: 'anthropic' },
    { id: 'claude/claude-opus-5-5', label: 'Claude Opus 5.5 (Claude API)', provider: 'anthropic' },
  ].map((model) => ({
    ...model,
    supportsStrictJson: true,
    supportsVision: true,
    inputModalities: ['text', 'image'],
    multimodal: true,
    reasoning: { kind: 'effort', efforts: ['max', 'xhigh', 'high', 'medium', 'low'], minTokens: null, maxTokens: null, step: null },
    keySource: 'user',
    keyProvider: 'anthropic',
    keyRegistered: true,
    keyHint: 'sk-ant…EXMP',
    pricing: { inputPerMtok: 3, outputPerMtok: 15 },
  }))

  const members = [
    { userId: session.user.id, displayName: session.user.displayName, email: session.user.email, nickname: session.user.nickname, userTag: session.user.userTag, role: 'OWNER', joinedAt: at(60 * 24 * 4) },
    { userId: IDS.teammate, displayName: t({ ko: '김하늘', en: 'Sky Kim' }), email: 'sky@example.com', nickname: t({ ko: '하늘', en: 'Sky' }), userTag: '0002', role: 'MEMBER', joinedAt: at(60 * 24 * 2) },
  ]

  return {
    locale: session.locale,
    project: {
      id: projectId,
      name: t({ ko: '별빛 정원 (예시)', en: 'Starlight Garden (example)' }),
      description: t({ ko: '튜토리얼 예시 프로젝트', en: 'Tutorial example project' }),
      genre: 'PUZZLE',
      document: null,
      myRole: 'OWNER',
      createdAt: at(60 * 24 * 4),
      updatedAt: at(30),
    },
    build: { id: IDS.build, projectId, version: '1.0', label: null, notes: null, isEditor: true, createdAt: at(60 * 24 * 4), updatedAt: at(60 * 24 * 4) },
    gameBuild,
    instance: {
      id: IDS.instance,
      projectId,
      name: t({ ko: '개발용 PC', en: 'Dev PC' }),
      platform: 'UNITY',
      connected: true,
      lastConnectedAt: at(1),
      createdAt: at(60 * 24 * 4),
      updatedAt: at(1),
      lastGameBuild: gameBuild,
    },
    folders: Object.values(FOLDERS).map((folder) => ({ id: folder.id, parentId: null, name: t(folder.name) })),
    cases,
    scenarios,
    runs,
    qaRuns,
    tries,
    tryDetail,
    verdicts,
    attempts,
    issues,
    models,
    members,
    invitations: [] as unknown[],
    llmKeys: [] as { service: string; keyHint: string; verifiedAt: string }[],
    discussions: [] as { id: string }[],
    nextId: 9_950,
    now: () => new Date().toISOString(),
  }
}
