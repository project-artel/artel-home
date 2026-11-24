import { buildTutorialData, IDS, type TutorialData } from './tutorialFixtures'
import { notifyTutorialChange, type TutorialSession } from './tutorialMode'
import { createLiveRun, liveRun, resetPlayback } from './tutorialPlayback'

/**
 * 튜토리얼 모드에서 `apiFetch` 대신 답한다(ARTEL-1461). 서버로는 아무것도 보내지 않는다.
 *
 * 화면이 부르는 경로마다 목데이터로 답하고, 쓰기 요청은 목데이터에만 반영한다. 모르는 경로는 콘솔에 남기고 빈 답을
 * 준다 — 화면이 튜토리얼에 없는 칸을 열어도 깨지지 않게 하려는 것이다.
 */

type Handler = (match: RegExpMatchArray, request: MockRequest, data: TutorialData) => unknown

type MockRequest = { method: string; url: URL; body: unknown }

type Route = { method: string; pattern: RegExp; handle: Handler }

let data: TutorialData | null = null

export function resetTutorialData(session: TutorialSession): void {
  data = buildTutorialData(session)
  resetPlayback()
}

/** 스트림(`tutorialMode`)이 각본을 틀 때 읽는다. */
export function tutorialData(): TutorialData | null {
  return data
}

function tryShape(d: TutorialData, id: string, testScenarioId: number | string, qaRunId: string, status: string, startedAt: string, completedAt: string | null) {
  return {
    id,
    testScenarioId: String(testScenarioId),
    gameInstanceId: IDS.instance,
    startedBy: d.members[0].userId,
    status,
    startedAt,
    completedAt,
    model: 'claude/claude-sonnet-5-5',
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
    qaRunId,
    stop: null,
    inputMode: 'virtual',
  }
}

/** 실행 하나의 개요. 방금 시작한 실행이면 각본이 끝날 때까지 RUNNING 이다. */
function runShape(d: TutorialData, runId: string) {
  const current = liveRun()
  if (current !== null && current.runId === runId) {
    const status = current.done ? 'COMPLETED' : 'RUNNING'
    return {
      id: runId,
      testRunId: current.testRunId,
      gameInstanceId: IDS.instance,
      gameBuildId: IDS.build,
      startedBy: d.members[0].userId,
      status,
      startedAt: current.startedAt,
      completedAt: current.completedAt,
      label: null,
      tries: [tryShape(d, current.tryId, current.scenarioId, runId, status, current.startedAt, current.completedAt)],
    }
  }
  const run = d.qaRuns.find((one) => one.id === runId)
  if (run === undefined) return NOT_FOUND
  const one = d.tries.find((entry) => entry.qaRunId === runId)
  return {
    id: runId,
    testRunId: run.testRunId,
    gameInstanceId: IDS.instance,
    gameBuildId: IDS.build,
    startedBy: run.startedBy,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    label: null,
    tries: one === undefined ? [] : [tryShape(d, one.id, one.testScenarioId, runId, one.status, one.startedAt, one.completedAt)],
  }
}

const P = String.raw`/api/projects/[^/]+`

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  })

const items = <T>(list: T[]) => ({ items: list })

const ROUTES: Route[] = [
  // ── 셸 · 계정 ───────────────────────────────────────────────
  { method: 'GET', pattern: /^\/api\/qa-question-subscriptions$/, handle: () => [] },
  { method: 'GET', pattern: /^\/api\/qa-notices$/, handle: () => ({ items: [], unreadCount: 0 }) },
  { method: 'GET', pattern: /^\/api\/projects$/, handle: (_m, _r, d) => ({ items: [{ ...d.project, documentCount: 0, latestDocument: null }], page: 0, size: 50, total: 1 }) },
  { method: 'GET', pattern: /^\/api\/auth\/cli-tokens$/, handle: () => [] },
  { method: 'GET', pattern: /^\/api\/auth\/me\/llm-keys$/, handle: (_m, _r, d) => d.llmKeys },
  {
    method: 'PUT',
    pattern: /^\/api\/auth\/me\/llm-keys\/([^/]+)$/,
    handle: (match, _r, d) => {
      const key = { service: match[1], keyHint: `${keyPrefix(match[1])}…EXMP`, verifiedAt: d.now() }
      d.llmKeys = [...d.llmKeys.filter((one) => one.service !== key.service), key]
      return key
    },
  },

  // ── 프로젝트 공통 ────────────────────────────────────────────
  { method: 'GET', pattern: new RegExp(`^${P}$`), handle: (_m, _r, d) => d.project },
  { method: 'GET', pattern: new RegExp(`^${P}/documents$`), handle: () => [] },
  { method: 'GET', pattern: new RegExp(`^${P}/game-instances$`), handle: (_m, _r, d) => items([d.instance]) },
  { method: 'GET', pattern: new RegExp(`^${P}/game-builds$`), handle: (_m, _r, d) => items([d.build]) },
  { method: 'GET', pattern: new RegExp(`^${P}/game-builds/[^/]+/game-functions$`), handle: (_m, _r, d) => ({ revision: 1, receivedAt: d.now(), cheats: [], behaviors: [] }) },
  { method: 'GET', pattern: new RegExp(`^${P}/tracker-link$`), handle: () => ({ link: null }) },
  { method: 'GET', pattern: new RegExp(`^${P}/members$`), handle: (_m, _r, d) => d.members },
  { method: 'GET', pattern: new RegExp(`^${P}/invitations$`), handle: (_m, _r, d) => d.invitations },
  {
    method: 'POST',
    pattern: new RegExp(`^${P}/invitations$`),
    handle: (_m, request, d) => {
      const body = record(request.body)
      const invitation = { id: String(d.nextId++), email: String(body.email ?? body.query ?? ''), role: String(body.role ?? 'MEMBER'), createdAt: d.now(), invitedBy: d.members[0].userId }
      d.invitations = [...d.invitations, invitation]
      return invitation
    },
  },
  { method: 'GET', pattern: /^\/api\/qa-models$/, handle: (_m, _r, d) => d.models },

  // ── Test Case ───────────────────────────────────────────────
  { method: 'GET', pattern: new RegExp(`^${P}/test-cases$`), handle: (_m, _r, d) => items(d.cases) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-case-identifiers$`), handle: (_m, _r, d) => d.cases.map((one) => ({ testCaseId: one.id, caseNumber: String(one.number) })) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-case-folders$`), handle: (_m, _r, d) => items(d.folders.map((folder) => ({ ...folder, caseCount: d.cases.filter((one) => one.folderId === folder.id).length, visibleCount: null }))) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-case-versions$`), handle: (_m, _r, d) => ({ items: [{ gameBuildId: IDS.build, version: '1.0', label: null, createdAt: d.build.createdAt, isEditor: true, latest: true, total: d.cases.length, counts: countStatuses(d), groupId: null, hidden: false }], groups: [], unversionedTotal: 0 }) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-case-versions/[^/]+/cases$`), handle: (_m, _r, d) => ({ gameBuildId: IDS.build, compareToGameBuildId: null, items: d.cases.map((one) => ({ ...one, presence: 'BOTH', compareVerificationStatus: null })) }) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-cases/coverage$`), handle: (_m, _r, d) => { const counts = countStatuses(d); return { total: d.cases.length, authored: d.cases.length, unauthored: 0, verified: counts.VERIFIED, draft: counts.DRAFT, broken: 0, uncoveredScenes: [] } } },
  { method: 'GET', pattern: new RegExp(`^${P}/test-cases/review-queue$`), handle: () => [] },
  {
    method: 'POST',
    pattern: new RegExp(`^${P}/test-cases$`),
    handle: (_m, request, d) => {
      const body = record(request.body)
      const created = {
        ...d.cases[0],
        id: String(d.nextId++),
        number: Math.max(...d.cases.map((one) => one.number)) + 1,
        scene: String(body.scene ?? ''),
        step: String(body.step ?? ''),
        precondition: String(body.precondition ?? ''),
        expectedValue: String(body.expectedValue ?? ''),
        verificationStatus: 'DRAFT',
        lastVerifiedBuildId: null,
        createdAt: d.now(),
        folderId: typeof body.folderId === 'string' ? body.folderId : null,
        kind: body.kind === 'EXCEPTION' ? 'EXCEPTION' : 'FUNCTION',
        arrivesAt: typeof body.arrivesAt === 'string' && body.arrivesAt.length > 0 ? body.arrivesAt : null,
      }
      d.cases = [created, ...d.cases]
      return created
    },
  },

  // ── 테스트 런 · 시나리오 ──────────────────────────────────────
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs$`), handle: (_m, _r, d) => items(d.runs) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-run-folders$`), handle: () => items([]) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)$`), handle: (match, _r, d) => d.runs.find((one) => one.id === match[1]) ?? NOT_FOUND },
  {
    method: 'POST',
    pattern: new RegExp(`^${P}/test-runs$`),
    handle: (_m, request, d) => {
      const body = record(request.body)
      const run = { ...d.runs[0], id: String(d.nextId++), name: String(body.name ?? ''), createdAt: d.now(), scenarioCount: 0, lastQaRun: null }
      d.runs = [run, ...d.runs]
      return run
    },
  },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)/scenarios$`), handle: (match, _r, d) => items(d.scenarios.filter((one) => one.runId === match[1]).map((one, position) => ({ position, testScenarioId: String(one.testScenarioId) }))) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)/coverage$`), handle: (match, _r, d) => runCoverage(d, match[1]) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)/cases-outside-build$`), handle: () => ({ items: [] }) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)/since-last-qa$`), handle: (match, _r, d) => { const run = d.runs.find((one) => one.id === match[1]); const last = d.qaRuns.find((one) => one.testRunId === match[1]) ?? null; return { lastQaRun: run?.lastQaRun === null ? null : last, issues: [], changes: [] } } },
  { method: 'GET', pattern: new RegExp(`^${P}/test-scenario$`), handle: (_m, _r, d) => items(d.scenarios.map((one) => ({ testScenarioId: one.testScenarioId, projectId: Number(d.project.id) || 0, title: one.title, execution_mode: 'ORDERED', reviewStatus: 'READY', createdAt: one.createdAt, updatedAt: one.createdAt }))) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-scenario/review-queue$`), handle: () => [] },
  { method: 'GET', pattern: /^\/api\/test-scenario\/([^/]+)$/, handle: (match, _r, d) => { const one = d.scenarios.find((scenario) => String(scenario.testScenarioId) === match[1]); return one === undefined ? NOT_FOUND : { testScenarioId: one.testScenarioId, projectId: Number(d.project.id) || 0, payload: { title: one.title, description: one.description, steps: one.steps, execution_mode: 'ORDERED' }, reviewStatus: 'READY' } } },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/([^/]+)/messages$`), handle: () => items([]) },

  // ── QA 실행 · 결과 ───────────────────────────────────────────
  { method: 'GET', pattern: /^\/api\/qa-tries$/, handle: (_m, _r, d) => d.tries },
  { method: 'GET', pattern: /^\/api\/qa-tries\/([^/]+)\/detail$/, handle: (match, _r, d) => d.tryDetail(match[1]) },
  {
    method: 'GET',
    pattern: new RegExp(`^${P}/qa-runs$`),
    handle: (_m, request, d) => {
      const testRunId = request.url.searchParams.get('testRunId')
      return items(d.qaRuns.filter((one) => testRunId === null || one.testRunId === testRunId))
    },
  },
  { method: 'GET', pattern: /^\/api\/qa-runs\/([^/]+)\/verdicts$/, handle: (match, _r, d) => d.verdicts[match[1]] ?? NOT_FOUND },
  { method: 'GET', pattern: new RegExp(`^${P}/qa-evaluation/reliability$`), handle: (_m, request) => ({ from: request.url.searchParams.get('from') ?? '', to: request.url.searchParams.get('to') ?? '', overall: emptyCounts(), daily: [], cases: [], sample: 'USER_SELECTED_REVIEWS', includesInterruptedFailures: false }) },
  {
    method: 'GET',
    pattern: new RegExp(`^${P}/qa-evaluation/attempts$`),
    handle: (_m, request, d) => {
      const qaTryId = request.url.searchParams.get('qaTryId')
      const testCaseId = request.url.searchParams.get('testCaseId')
      return d.attempts.filter((one) => (qaTryId === null || one.qaTryId === qaTryId) && (testCaseId === null || one.testCaseId === testCaseId))
    },
  },
  {
    method: 'PUT',
    pattern: new RegExp(`^${P}/qa-evaluation/verdicts/([^/]+)/review$`),
    handle: (match, request, d) => {
      const decision = record(request.body).decision
      d.attempts = d.attempts.map((one) => (one.logId === match[1] ? { ...one, review: typeof decision === 'string' ? decision : null } : one))
      return undefined
    },
  },
  { method: 'GET', pattern: new RegExp(`^${P}/qa-evaluation/verdicts/[^/]+/reviews$`), handle: () => [] },
  { method: 'GET', pattern: new RegExp(`^${P}/qa-evaluation/(questions|case-content-reviews)$`), handle: () => [] },
  {
    method: 'GET',
    pattern: new RegExp(`^${P}/release-criteria$`),
    // 서버 기본값(`ReleaseCriteria.DEFAULT`)과 같다.
    handle: () => ({ criteria: RELEASE_DEFAULTS, defaults: RELEASE_DEFAULTS, isDefault: true, updatedAt: null }),
  },
  { method: 'GET', pattern: /^\/api\/llm-usage\/qa-runs$/, handle: () => ({ items: [] }) },
  { method: 'GET', pattern: new RegExp(`^${P}/game-builds/[^/]+/verification-progress$`), handle: (_m, _r, d) => verificationProgress(d) },
  { method: 'GET', pattern: new RegExp(`^${P}/qa-evaluation/tries/[^/]+/recording$`), handle: () => ({ recording: null, segments: [], gaps: [] }) },
  { method: 'GET', pattern: new RegExp(`^${P}/qa-evaluation/issues/([^/]+)$`), handle: (match) => ({ issueId: match[1], testCaseId: null, previousIssueId: null, mergedInto: null, autoClosed: false, occurrences: [] }) },
  { method: 'PUT', pattern: new RegExp(`^${P}/qa-evaluation/.+$`), handle: (_m, request) => request.body ?? {} },
  { method: 'POST', pattern: new RegExp(`^${P}/qa-evaluation/.+$`), handle: (_m, request) => request.body ?? {} },

  // ── 방금 시작하는 QA 실행 ────────────────────────────────────
  {
    method: 'POST',
    pattern: /^\/api\/qa-runs$/,
    handle: (_m, request, d) => {
      const testRunId = String(record(request.body).testRunId ?? '')
      const run = createLiveRun(d, testRunId)
      if (run === null) return INVALID
      return runShape(d, run.runId)
    },
  },
  { method: 'GET', pattern: /^\/api\/qa-runs\/([^/]+)$/, handle: (match, _r, d) => runShape(d, match[1]) },
  { method: 'GET', pattern: /^\/api\/qa-runs\/[^/]+\/changes$/, handle: () => items([]) },
  { method: 'POST', pattern: /^\/api\/qa-runs\/[^/]+\/cancel$/, handle: () => undefined },
  {
    method: 'GET',
    pattern: /^\/api\/qa-tries\/([^/]+)$/,
    handle: (match, _r, d) => {
      const current = liveRun()
      if (current !== null && current.tryId === match[1]) {
        const status = current.done ? 'COMPLETED' : 'RUNNING'
        return tryShape(d, current.tryId, current.scenarioId, current.runId, status, current.startedAt, current.completedAt)
      }
      const one = d.tries.find((entry) => entry.id === match[1])
      return one === undefined ? NOT_FOUND : tryShape(d, one.id, one.testScenarioId, one.qaRunId, one.status, one.startedAt, one.completedAt)
    },
  },
  { method: 'GET', pattern: /^\/api\/qa-tries\/([^/]+)\/logs$/, handle: (match) => ({ items: liveLogs(match[1]), nextBeforeId: null, hasMore: false }) },
  { method: 'GET', pattern: /^\/api\/qa-tries\/([^/]+)\/verdicts$/, handle: (match) => liveLogs(match[1]).filter((log) => log.type === 'STATUS' || log.type === 'CASE_VERDICT') },
  {
    method: 'GET',
    pattern: /^\/api\/llm-usage\/qa-runs\/([^/]+)$/,
    handle: (match, _r, d) => ({
      qaTryId: match[1],
      projectId: d.project.id,
      status: liveRun()?.done === false ? 'RUNNING' : 'COMPLETED',
      startedAt: liveRun()?.startedAt ?? d.now(),
      completedAt: liveRun()?.completedAt ?? null,
      model: 'claude/claude-sonnet-5-5',
      reasoningEffort: null,
      promptVersion: null,
      agentArch: null,
      totals: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, costUsd: null, costEstimated: false, calls: 0, pricedCalls: 0 },
    }),
  },

  // ── 이슈 · 팀 공유 ───────────────────────────────────────────
  { method: 'GET', pattern: new RegExp(`^${P}/issues$`), handle: (_m, request, d) => { const status = request.url.searchParams.get('status'); return { items: d.issues.filter((one) => status === null || one.status === status), nextBeforeId: null, hasMore: false } } },
  { method: 'GET', pattern: new RegExp(`^${P}/issues/facets$`), handle: (_m, _r, d) => ({ total: d.issues.length, archived: 0, builds: [{ gameBuildId: IDS.build, version: '1.0', label: null, count: d.issues.length, openCount: d.issues.length }], testRuns: d.runs.map((run) => ({ testRunId: run.id, name: run.name, gameBuildId: IDS.build, count: d.issues.filter((one) => one.origin.testRunId === run.id).length, openCount: d.issues.filter((one) => one.origin.testRunId === run.id).length })), severities: { MAJOR: d.issues.length } }) },
  { method: 'GET', pattern: new RegExp(`^${P}/issues/([^/]+)$`), handle: (match, _r, d) => d.issues.find((one) => one.id === match[1]) ?? NOT_FOUND },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-(categories|folders)$`), handle: () => items([]) },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-discussions/pages$`), handle: (_m, _r, d) => ({ items: d.discussions, page: 0, size: 20, total: d.discussions.length }) },
  {
    method: 'POST',
    pattern: new RegExp(`^${P}/issue-discussions$`),
    handle: (_m, request, d) => {
      const body = record(request.body)
      const text = String(body.body ?? '')
      const linked = Array.isArray(body.issueIds) ? d.issues.filter((one) => (body.issueIds as unknown[]).map(String).includes(one.id)) : []
      const author = d.members[0]
      const discussion = {
        id: String(d.nextId++),
        title: String(body.title ?? ''),
        excerpt: text.slice(0, 160),
        purpose: body.purpose === 'RESOLUTION' || body.purpose === 'DECISION' ? body.purpose : 'QUESTION',
        state: body.state === 'DRAFT' ? 'DRAFT' : 'OPEN',
        pinned: false,
        author: { id: author.userId, displayName: author.displayName, userTag: author.userTag },
        issueCount: linked.length,
        commentCount: 0,
        createdAt: d.now(),
        updatedAt: d.now(),
        subscribed: true,
        version: 1,
        categories: [],
        reviewerCount: 0,
        approvalCount: 0,
        number: String(d.discussions.length + 1),
        gameBuildId: IDS.build,
        buildVersion: '1.0',
        body: text,
        issues: linked.map((one) => ({ id: one.id, title: one.title, severity: one.severity, status: one.status, qaTryId: one.qaTryId, qaRunId: one.qaRunId, number: one.number })),
        mentions: [],
        decision: null,
        canEdit: true,
        canPin: true,
        reviewers: [],
        approvalsRequired: 1,
        canManage: true,
        canApprove: false,
      }
      d.discussions = [discussion, ...d.discussions]
      return discussion
    },
  },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-discussions/settings$`), handle: () => ({ approvalsRequired: 1 }) },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-discussions/([^/]+)$`), handle: (match, _r, d) => d.discussions.find((one) => one.id === match[1]) ?? NOT_FOUND },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-discussions/[^/]+/comments$`), handle: () => ({ items: [], nextCursor: null, hasMore: false }) },
  { method: 'GET', pattern: new RegExp(`^${P}/issue-discussions$`), handle: (_m, _r, d) => ({ items: d.discussions, nextCursor: null, hasMore: false }) },

  // ── 화면이 곁들여 읽는 것. 튜토리얼에서는 비어 있다. ─────────────────
  { method: 'GET', pattern: new RegExp(`^${P}/test-cases/([^/]+)$`), handle: (match, _r, d) => d.cases.find((one) => one.id === match[1]) ?? NOT_FOUND },
  { method: 'GET', pattern: new RegExp(`^${P}/invitation-suggestions$`), handle: () => items([]) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/[^/]+/chat/messages$`), handle: () => items([]) },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/[^/]+/chat/draft$`), handle: () => null },
  { method: 'GET', pattern: new RegExp(`^${P}/test-runs/[^/]+/authoring-lock$`), handle: () => null },
  { method: 'GET', pattern: /^\/api\/llm-usage\/stats$/, handle: () => ({ items: [] }) },
]

const NOT_FOUND = Symbol('not found')
const INVALID = Symbol('invalid')

function liveLogs(tryId: string) {
  const current = liveRun()
  return current !== null && current.tryId === tryId ? current.logs : []
}

/**
 * 목데이터로 답한다. 화면이 부르는 순서 그대로 실제 서버처럼 비동기로 답해, 화면의 로딩 처리도 그대로 지나가게 한다.
 */
export async function tutorialResponse(
  path: string,
  init: RequestInit | undefined,
  session: TutorialSession,
  passthrough: () => Promise<Response>,
): Promise<Response> {
  if (data === null) resetTutorialData(session)
  const current = data as TutorialData
  const url = new URL(path, 'http://tutorial.local')
  const method = (init?.method ?? 'GET').toUpperCase()

  // 사용자의 프로젝트 안에서 돌 때는 그 프로젝트의 이름 · 장르만 실제로 읽는다. 내용은 모두 목데이터다.
  if (session.realProject && method === 'GET' && url.pathname === `/api/projects/${session.projectId}`) {
    const response = await passthrough()
    if (!response.ok) return response
    const { name, genre } = record(await response.json())
    return json(200, {
      ...current.project,
      name: typeof name === 'string' ? name : current.project.name,
      genre: typeof genre === 'string' ? genre : current.project.genre,
    })
  }
  const request: MockRequest = { method, url, body: parseBody(init?.body) }

  await new Promise((resolve) => window.setTimeout(resolve, 60))

  for (const route of ROUTES) {
    if (route.method !== method) continue
    const match = url.pathname.match(route.pattern)
    if (match === null) continue
    const body = route.handle(match, request, current)
    if (body === NOT_FOUND) return json(404, { code: 'not_found', message: 'Not found' })
    if (body === INVALID) return json(422, { code: 'error', message: session.locale === 'en' ? 'This test run has no scenario yet.' : '이 테스트 런에는 아직 시나리오가 없습니다.' })
    const topic = method === 'GET' ? null : changedTopic(url.pathname)
    if (topic !== null) window.setTimeout(() => notifyTutorialChange(topic), 120)
    return body === undefined ? new Response(null, { status: 204 }) : json(200, body)
  }

  // 튜토리얼이 다루지 않는 경로. 읽기는 비어 있는 것으로, 쓰기는 받은 것으로 답한다.
  console.info('[tutorial] 목데이터에 없는 요청', method, url.pathname)
  if (method === 'GET') return json(200, { items: [] })
  return json(200, request.body ?? {})
}

/** 쓰기가 바꾼 것을 화면에 알릴 주제. 실제 서버가 같은 쓰기 뒤에 보내는 것과 같다. */
function changedTopic(pathname: string): string | null {
  if (/\/test-cases(\/|$)/.test(pathname)) return 'TEST_CASES'
  if (/\/test-runs(\/|$)/.test(pathname)) return 'TEST_RUNS'
  if (/\/issue/.test(pathname)) return 'ISSUES'
  if (/\/qa-evaluation\//.test(pathname)) return 'QA_RUNS'
  return null
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') return undefined
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function keyPrefix(service: string): string {
  if (service === 'anthropic') return 'sk-ant'
  if (service === 'openrouter') return 'sk-or'
  return 'sk'
}

function countStatuses(d: TutorialData) {
  const counts = { DRAFT: 0, VERIFIED: 0, FAILED: 0, REGRESSION: 0, BROKEN: 0 }
  d.cases.forEach((one) => {
    const status = one.verificationStatus as keyof typeof counts
    if (status in counts) counts[status] += 1
  })
  return counts
}

function emptyCounts() {
  return { total: 0, reviewed: 0, inconclusiveReviews: 0, truePositives: 0, trueNegatives: 0, falsePositives: 0, falseNegatives: 0, interruptedFalseNegatives: 0, falsePositiveRate: null, falseNegativeRate: null, reviewCoverage: 0 }
}

function runCoverage(d: TutorialData, runId: string) {
  const scenarios = d.scenarios.filter((one) => one.runId === runId)
  return {
    scenarios: scenarios.map((one, position) => ({ position, testScenarioId: String(one.testScenarioId), title: one.title, executionMode: 'ORDERED', steps: one.steps.length, cases: one.steps.length })),
    cases: scenarios.flatMap((one) => one.steps.map((step) => String(step.case_id))),
  }
}

const RELEASE_DEFAULTS = { maxPending: 0, maxRegression: 0, minPassRate: 95, maxOpenBlockers: 0, maxInconclusiveRate: 5 }

/** 대시보드 출시 준비 칸. TC 의 지금 판정을 세고, 날마다의 누적은 QA 실행이 있던 날에 오른다. */
function verificationProgress(d: TutorialData) {
  const passed = d.cases.filter((one) => one.verificationStatus === 'VERIFIED').length
  const failed = d.cases.filter((one) => one.verificationStatus === 'FAILED').length
  const firstCase = [...d.cases].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  const summary = {
    build: { gameBuildId: IDS.build, version: '1.0', isEditor: true, createdAt: firstCase?.createdAt ?? d.now() },
    total: d.cases.length,
    passed,
    failed,
    regression: 0,
    inconclusive: 0,
    pending: d.cases.length - passed - failed,
    carried: 0,
    openBlockers: 0,
    lastJudgedAt: d.qaRuns[0]?.completedAt ?? null,
  }
  const today = localDate(new Date())
  const days = [3, 2, 1, 0].map((back) => {
    const date = localDate(new Date(Date.now() - back * 24 * 60 * 60 * 1000))
    const runs = d.qaRuns.filter((one) => localDate(new Date(one.startedAt)) === date).length
    return date === today ? { date, passed, failed, regression: 0, inconclusive: 0, runs } : { date, passed: 0, failed: 0, regression: 0, inconclusive: 0, runs }
  })
  return { summary, previousBuild: null, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, days }
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
