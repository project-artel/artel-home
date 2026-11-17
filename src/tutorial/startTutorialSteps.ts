import type { Messages } from '../i18n/messages'
import { IDS } from './mock/tutorialFixtures'

/**
 * 시작 튜토리얼 8단계(ARTEL-1461). 실제 서비스 화면 위에서 진행하고, 화면 데이터는 튜토리얼 목데이터다.
 *
 * 짚을 자리는 실제 화면의 요소다. 주소 · 클래스 · 화면 문구로 찾고, 화면 문구는 앱 문구(`t`)에서 읽어 언어가 바뀌어도
 * 같은 자리를 찾는다. 화면이 아직 뜨지 않았으면 뜰 때까지 기다린다.
 *
 * 동작은 다섯이다.
 * - click: 빛나는 자리를 사용자가 직접 눌러야 넘어간다. 누르면 실제 화면이 반응한다(목데이터로).
 * - look: 읽고 다음을 누른다. 그 자리는 눌리지 않는다.
 * - fill: 입력 칸이다. 장면에 들어가면 예시 글이 한 글자씩 써지고, 다 써지면 다음을 누른다.
 * - unity: 가상 Unity 화면. 1단계에서 SDK 를 넣고 게임을 연결하는 자리를 실제처럼 눌러 본다.
 * - mcp: 코딩 에이전트 창. 같은 일을 artel MCP 로 하면 어떻게 되는지 보여 준다.
 */

/**
 * 튜토리얼에서 새 탭으로 연 안내 화면에 붙이는 표시. 그 탭에서는 처음 온 사용자라도 튜토리얼을 다시 띄우지 않는다.
 */
export const TUTORIAL_SKIP_PARAM = 'from-tutorial'

export type CoachContext = {
  t: Messages
  /** 튜토리얼이 들어가 있는 프로젝트의 화면 주소. 예: `/projects/17` */
  base: string
}

export type TutorialCopy = { tag: string; title: string; body: string }

type Find = (ctx: CoachContext) => Element | null
type CopyOf = (m: Messages['tutorial']) => TutorialCopy

export type McpLine = { kind: 'user' | 'call' | 'out' | 'say' | 'ok'; text: string }

export type UnityStage = 'plus' | 'git' | 'add' | 'play' | 'login' | 'browser'

type Base = {
  id: string
  /** 이 동작을 시작할 때 있어야 할 화면. 다르면 그리로 옮긴다. 단계 첫 동작은 늘 정한다 — 단계로 바로 갈 때 쓴다. */
  at?: (ctx: CoachContext) => string
}

export type TutorialAction =
  | (Base & { kind: 'click' | 'look'; target: Find; copy: CopyOf })
  | (Base & { kind: 'fill'; target: Find; copy: CopyOf; fields: (ctx: CoachContext) => TypedField[] })
  | (Base & { kind: 'unity'; stage: UnityStage; copy: CopyOf })
  | (Base & { kind: 'mcp'; copy: (m: Messages['tutorial']) => { title: string; body: string }; lines: (m: Messages['tutorial']) => McpLine[] })

export type TutorialStepId = 'connect' | 'keys' | 'testCase' | 'testRun' | 'qa' | 'results' | 'issues' | 'team'

export type TutorialStep = { id: TutorialStepId; actions: TutorialAction[] }

// ── 요소 찾기 ────────────────────────────────────────────────

const $ = (selector: string): Element | null => document.querySelector(selector)

/** 화면 문구가 꼭 그것인 요소. 같은 글이 여럿이면 처음 것이다. */
function byText(selector: string, text: string, scope: ParentNode = document): Element | null {
  return Array.from(scope.querySelectorAll(selector)).find((element) => element.textContent?.trim() === text) ?? null
}

/** 화면 문구를 담은 요소. 버튼 안에 아이콘이 함께 있을 때 쓴다. */
function byTextIncludes(selector: string, text: string, scope: ParentNode = document): Element | null {
  return Array.from(scope.querySelectorAll(selector)).find((element) => element.textContent?.includes(text) === true) ?? null
}

const navItem = (path: string) => (ctx: CoachContext) => $(`.project-nav a.nav-item[href$="${ctx.base}/${path}"]`)

const visible = (element: Element | null): Element | null => {
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  return rect.width === 0 && rect.height === 0 ? null : element
}

/** React 가 쥔 입력 칸에 값을 넣는다. 화면이 사람이 친 것처럼 받는다. */
export function typeInto(element: Element | null, value: string): void {
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

/** 입력 장면이 채울 칸과 넣을 글. 칸은 그때그때 찾는다 — 화면이 다시 그려지면 요소가 바뀐다. */
export type TypedField = [() => Element | null, string]

const CHAR_MS = 28

/**
 * 칸마다 사람이 치듯 한 글자씩 넣는다. 칸 하나가 다 써지면 다음 칸으로 간다 — 화면이 `{ ...draft, 칸: 값 }` 으로
 * 받는 폼은 한 번에 여러 칸을 넣으면 마지막 칸만 남아서다. `cancelled` 가 참이 되면 멈춘다(장면을 떠났다).
 */
export async function typeFields(fields: TypedField[], cancelled: () => boolean): Promise<void> {
  for (const [find, value] of fields) {
    for (let length = 1; length <= value.length; length += 1) {
      if (cancelled()) return
      typeInto(find(), value.slice(0, length))
      await new Promise((resolve) => window.setTimeout(resolve, CHAR_MS))
    }
    await new Promise((resolve) => window.setTimeout(resolve, 120))
  }
}

const call = (text: string): McpLine => ({ kind: 'call', text: `artel · ${text}` })

// ── 8단계 ────────────────────────────────────────────────────

export const START_TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'connect',
    actions: [
      { id: 'setup', kind: 'click', at: (ctx) => ctx.base, target: navItem('setup'), copy: (m) => m.steps.connect.setup },
      { id: 'copy', kind: 'click', target: (ctx) => byText('button', ctx.t.projects.guide.copyUrl), copy: (m) => m.steps.connect.copy },
      { id: 'plus', kind: 'unity', stage: 'plus', copy: (m) => m.steps.connect.plus },
      { id: 'git', kind: 'unity', stage: 'git', copy: (m) => m.steps.connect.git },
      { id: 'add', kind: 'unity', stage: 'add', copy: (m) => m.steps.connect.add },
      { id: 'play', kind: 'unity', stage: 'play', copy: (m) => m.steps.connect.play },
      { id: 'login', kind: 'unity', stage: 'login', copy: (m) => m.steps.connect.login },
      { id: 'browser', kind: 'unity', stage: 'browser', copy: (m) => m.steps.connect.browser },
    ],
  },
  {
    id: 'keys',
    actions: [
      { id: 'account', kind: 'click', at: (ctx) => ctx.base, target: () => $('.user-account-link'), copy: (m) => m.steps.keys.account },
      { id: 'tab', kind: 'click', target: (ctx) => byText('.page--account a, .page--account button', ctx.t.usage.api.tab), copy: (m) => m.steps.keys.tab },
      { id: 'panel', kind: 'look', target: () => $('section.panel[aria-labelledby="llm-keys-title"]'), copy: (m) => m.steps.keys.panel },
      { id: 'register', kind: 'click', target: (ctx) => byText('.llm-key-row button', ctx.t.account.llmKeys.register), copy: (m) => m.steps.keys.register },
      {
        id: 'input',
        kind: 'fill',
        target: () => $('.llm-key-list input'),
        fields: () => [[() => $('.llm-key-list input'), 'sk-ant-tutorial-example-key']],
        copy: (m) => m.steps.keys.input,
      },
      { id: 'save', kind: 'click', target: (ctx) => byText('.llm-key-list button', ctx.t.account.llmKeys.submit), copy: (m) => m.steps.keys.save },
    ],
  },
  {
    id: 'testCase',
    actions: [
      { id: 'nav', kind: 'click', at: (ctx) => ctx.base, target: navItem('test-cases'), copy: (m) => m.steps.testCase.nav },
      { id: 'create', kind: 'click', target: (ctx) => byText('button', ctx.t.testCases.section.newCase), copy: (m) => m.steps.testCase.create },
      {
        id: 'fill',
        kind: 'fill',
        // 사전 조건 · 테스트 내용 · 기대 결과 세 칸을 함께 짚는다.
        target: () => $('[role="dialog"] textarea')?.closest('ol, ul, fieldset, section') ?? $('[role="dialog"] textarea'),
        fields: (ctx) => {
          const example = ctx.t.tutorial.steps.testCase.example
          const area = (index: number) => () => $('[role="dialog"]')?.querySelectorAll('textarea')[index] ?? null
          return [
            [area(0), example.precondition],
            [area(1), example.step],
            [area(2), example.expected],
            [() => $('[role="dialog"]')?.querySelector('input:not([type="checkbox"]):not([type="radio"])') ?? null, example.scene],
          ]
        },
        copy: (m) => m.steps.testCase.fill,
      },
      { id: 'add', kind: 'click', target: (ctx) => byText('[role="dialog"] button', ctx.t.testCases.editor.create), copy: (m) => m.steps.testCase.add },
      { id: 'added', kind: 'look', target: () => visible($('.workspace-body tr.tct-row.picked') ?? $('.workspace-body table tbody tr')), copy: (m) => m.steps.testCase.added },
      {
        id: 'mcp',
        kind: 'mcp',
        copy: (m) => m.steps.testCase.mcp,
        lines: (m) => [
          { kind: 'user', text: m.steps.testCase.lines.ask },
          call('save_test_cases(cases: 1)'),
          { kind: 'out', text: m.steps.testCase.lines.preview },
          { kind: 'say', text: m.steps.testCase.lines.confirm },
          { kind: 'user', text: m.steps.testCase.lines.yes },
          call('save_test_cases(preview_id)'),
          { kind: 'ok', text: m.steps.testCase.lines.saved },
        ],
      },
    ],
  },
  {
    id: 'testRun',
    actions: [
      { id: 'nav', kind: 'click', at: (ctx) => ctx.base, target: navItem('test-runs'), copy: (m) => m.steps.testRun.nav },
      { id: 'create', kind: 'click', target: (ctx) => byText('button', ctx.t.scenarios.runList.newButton), copy: (m) => m.steps.testRun.create },
      {
        id: 'name',
        kind: 'fill',
        target: () => $('[role="dialog"] input.field-input'),
        fields: (ctx) => [[() => $('[role="dialog"] input.field-input'), ctx.t.tutorial.steps.testRun.example]],
        copy: (m) => m.steps.testRun.name_,
      },
      { id: 'confirm', kind: 'click', target: (ctx) => byText('[role="dialog"] button', ctx.t.scenarios.runList.newDialog.confirm), copy: (m) => m.steps.testRun.confirm },
      { id: 'model', kind: 'look', target: () => $('.chat-composer .qa-model-picker'), copy: (m) => m.steps.testRun.model },
      { id: 'input', kind: 'look', target: () => $('.chat-composer .chat-input-frame'), copy: (m) => m.steps.testRun.input },
      {
        id: 'steps',
        kind: 'look',
        // 챗봇이 이미 써 둔 테스트 런을 연다. 편집 화면은 첫 시나리오로 스스로 옮겨 간다.
        at: (ctx) => `${ctx.base}/test-runs/${IDS.runHarvest}/edit`,
        target: () => visible($('.se-list')),
        copy: (m) => m.steps.testRun.steps,
      },
      { id: 'saved', kind: 'look', target: () => $('.scenario-studio .savebadge'), copy: (m) => m.steps.testRun.saved },
      {
        id: 'mcp',
        kind: 'mcp',
        copy: (m) => m.steps.testRun.mcp,
        lines: (m) => [
          { kind: 'user', text: m.steps.testRun.lines.ask },
          call('authoring_context()'),
          { kind: 'out', text: m.steps.testRun.lines.context },
          call('save_scenarios(scenarios: 1)'),
          { kind: 'out', text: m.steps.testRun.lines.written },
          { kind: 'ok', text: m.steps.testRun.lines.saved },
        ],
      },
    ],
  },
  {
    id: 'qa',
    actions: [
      { id: 'nav', kind: 'click', at: (ctx) => ctx.base, target: navItem('qa'), copy: (m) => m.steps.qa.nav },
      { id: 'testRun', kind: 'look', target: () => $('.ql-run-card'), copy: (m) => m.steps.qa.testRun },
      { id: 'console', kind: 'look', target: () => document.querySelectorAll('.ql-panel .ql-field')[0] ?? null, copy: (m) => m.steps.qa.console },
      { id: 'agent', kind: 'look', target: () => document.querySelectorAll('.ql-panel .ql-field')[1] ?? null, copy: (m) => m.steps.qa.agent },
      { id: 'checks', kind: 'look', target: () => Array.from(document.querySelectorAll('.ql-panel .ql-field')).pop() ?? null, copy: (m) => m.steps.qa.checks },
      { id: 'run', kind: 'look', target: () => $('.ql-run'), copy: (m) => m.steps.qa.run },
      {
        id: 'mcp',
        kind: 'mcp',
        copy: (m) => m.steps.qa.mcp,
        lines: (m) => [
          { kind: 'user', text: m.steps.qa.lines.ask },
          call('list_game_instances()'),
          { kind: 'out', text: m.steps.qa.lines.instances },
          call('start_qa(model: Sonnet 5.5)'),
          { kind: 'ok', text: m.steps.qa.lines.started },
          call('get_qa_result()'),
          { kind: 'out', text: m.steps.qa.lines.progress },
        ],
      },
    ],
  },
  {
    id: 'results',
    actions: [
      { id: 'nav', kind: 'click', at: (ctx) => ctx.base, target: navItem('qa-history'), copy: (m) => m.steps.results.nav },
      { id: 'card', kind: 'click', target: () => $('.qh-tile'), copy: (m) => m.steps.results.card },
      { id: 'review', kind: 'click', target: (ctx) => byText('.qh-inspector a, .qh-inspector button', ctx.t.qa.history.board.reviewVerdicts), copy: (m) => m.steps.results.review },
      { id: 'cards', kind: 'look', target: () => $('.qe-case-tabs'), copy: (m) => m.steps.results.cards },
      { id: 'failed', kind: 'click', target: () => byTextIncludes('.qe-case-tab', 'TC-004'), copy: (m) => m.steps.results.failed },
      { id: 'agent', kind: 'look', target: () => $('.qe-verdict'), copy: (m) => m.steps.results.agent },
      { id: 'human', kind: 'click', target: () => $('.qe-form .qe-seg'), copy: (m) => m.steps.results.human },
      {
        id: 'mcp',
        kind: 'mcp',
        copy: (m) => m.steps.results.mcp,
        lines: (m) => [
          { kind: 'user', text: m.steps.results.lines.ask },
          call('get_qa_result()'),
          { kind: 'out', text: m.steps.results.lines.summary },
          { kind: 'say', text: m.steps.results.lines.reason },
        ],
      },
    ],
  },
  {
    id: 'issues',
    actions: [
      { id: 'nav', kind: 'click', at: (ctx) => ctx.base, target: navItem('issues'), copy: (m) => m.steps.issues.nav },
      { id: 'tab', kind: 'click', target: (ctx) => byText('.section-nav__item', ctx.t.discussions.allIssues), copy: (m) => m.steps.issues.tab },
      { id: 'severity', kind: 'look', target: () => $('.ib-toolbar'), copy: (m) => m.steps.issues.severity },
      { id: 'runs', kind: 'look', target: () => $('.ib-runs'), copy: (m) => m.steps.issues.runs },
      { id: 'open', kind: 'click', target: () => $('tr.ib-row'), copy: (m) => m.steps.issues.open },
      { id: 'compare', kind: 'look', target: () => $('.ib-compare'), copy: (m) => m.steps.issues.compare },
      { id: 'repro', kind: 'look', target: () => $('.ib-compare')?.nextElementSibling ?? null, copy: (m) => m.steps.issues.repro },
      { id: 'actions', kind: 'look', target: () => $('.ib-sheet-actions'), copy: (m) => m.steps.issues.actions },
    ],
  },
  {
    id: 'team',
    actions: [
      { id: 'members', kind: 'click', at: (ctx) => ctx.base, target: navItem('members'), copy: (m) => m.steps.team.members },
      {
        id: 'invite',
        kind: 'fill',
        // 입력 칸만 연다. 보내기 버튼까지 열어 두면 이 장면에서 먼저 보내 버려 다음 장면이 막힌다.
        target: () => $('.invite-form input.field-input'),
        fields: (ctx) => [[() => $('.invite-form input.field-input'), ctx.t.tutorial.steps.team.exampleInvite]],
        copy: (m) => m.steps.team.invite,
      },
      { id: 'send', kind: 'click', target: (ctx) => byText('.invite-form button', ctx.t.projects.members.send), copy: (m) => m.steps.team.send },
      { id: 'issues', kind: 'click', target: navItem('issues'), copy: (m) => m.steps.team.issues },
      { id: 'write', kind: 'click', target: (ctx) => byTextIncludes('.workspace-body button', ctx.t.discussions.newPost), copy: (m) => m.steps.team.write },
      {
        id: 'title',
        kind: 'fill',
        target: () => $('.dc-canvas') ?? $('.dc-title-input'),
        fields: (ctx) => [
          [() => $('.dc-title-input'), ctx.t.tutorial.steps.team.exampleTitle],
          [() => $('.dc-canvas textarea.md-input'), ctx.t.tutorial.steps.team.exampleBody],
        ],
        copy: (m) => m.steps.team.title,
      },
      { id: 'kinds', kind: 'look', target: () => $('.dc-rail')?.firstElementChild ?? null, copy: (m) => m.steps.team.kinds },
      { id: 'share', kind: 'click', target: () => $('.dc-publish'), copy: (m) => m.steps.team.share },
    ],
  },
]

/** 단계를 건너 세는 동작 번호. 처음 보는 사람이 앞으로 건너뛰지 못하게 어디까지 왔는지 이 번호로 센다. */
export function flatIndex(steps: readonly TutorialStep[], stepIndex: number, actionIndex: number): number {
  let index = actionIndex
  for (let i = 0; i < stepIndex; i += 1) index += steps[i].actions.length
  return index
}
