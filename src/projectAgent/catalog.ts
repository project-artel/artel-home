/**
 * agent 에게 보내는 page catalog. 계약 4절의 형식이다. fields 와 actions 는 `specs/` 의 정의를
 * 그대로 가리킨다. 페이지의 binding 도 같은 정의를 쓴다.
 */
import type { ActionSpec, FieldSpec, JsonSchema, PageId } from './registry/types'
import { CONTENT_MAP_ACTIONS, CONTENT_MAP_FIELDS } from './specs/contentMap'
import { QA_ACTIONS, QA_FIELDS } from './specs/qa'
import { TEST_RUNS_ACTIONS } from './specs/testRuns'
import { DOCUMENTS_ACTIONS, DOCUMENTS_FIELDS } from './specs/documents'
import { TEST_CASES_ACTIONS, TEST_CASES_FIELDS } from './specs/testCases'
import { ISSUES_ACTIONS, ISSUES_FIELDS } from './specs/issues'
import { QA_HISTORY_ACTIONS, QA_HISTORY_FIELDS } from './specs/qaHistory'
import { QA_RUN_ACTIONS, QA_RUN_FIELDS } from './specs/qaRun'
import { MEMBERS_ACTIONS, MEMBERS_FIELDS } from './specs/members'
import { SETTINGS_ACTIONS, SETTINGS_FIELDS } from './specs/settings'
import { SETUP_ACTIONS, SETUP_FIELDS } from './specs/setup'
import { USAGE_ACTIONS, USAGE_FIELDS } from './specs/usage'
import { MACROS_ACTIONS, MACROS_FIELDS } from './specs/macros'
import { PERFORMANCE_ACTIONS, PERFORMANCE_FIELDS } from './specs/performance'
import { KNOWLEDGE_ACTIONS, KNOWLEDGE_FIELDS } from './specs/knowledge'
import { TEST_RUN_ACTIONS, TEST_RUN_FIELDS } from './specs/testRun'
import { TEST_RUN_EDIT_ACTIONS, TEST_RUN_EDIT_FIELDS } from './specs/testRunEdit'
import { GUIDES } from './guides/index'

export type PageCatalogEntry = {
  id: PageId
  title: string
  path: string
  /** 같은 binding 이 다른 주소에서도 열릴 때의 path 들. `path` 와 같은 식으로 쓴다. */
  aliases?: string[]
  params: string[]
  description: string
  fields: FieldSpec[]
  actions: ActionSpec[]
}

export type WirePageCatalog = {
  pages: {
    id: PageId
    title: string
    path: string
    params: string[]
    description: string
    fields: { name: string; description: string }[]
    actions: { id: string; description: string; args: JsonSchema; risk: 'auto' | 'approve' }[]
  }[]
  /** project 밖 페이지. agent 는 열지 않고 링크로 안내한다. */
  links: { id: string; title: string; url: string; description: string }[]
  /** `read_guide` 로 읽을 수 있는 안내 문서 목록. 본문은 보내지 않는다. */
  guides: { id: string; title: string; summary: string }[]
}

export type GlobalLink = WirePageCatalog['links'][number]

/** project 밖에서 하는 일의 자리. 대화창은 project 안에만 있으므로 agent 는 이 주소를 링크로 준다. */
export const GLOBAL_LINKS: GlobalLink[] = [
  { id: 'projects', title: 'Projects', url: '/projects', description: 'All projects of the user, with the received project invitations on top. Create a new project here.' },
  { id: 'account', title: 'Account settings', url: '/account', description: 'Nickname, email address, the user\'s own LLM API keys, and CLI tokens. The language is a select in the top bar, and there is no password form here.' },
  { id: 'setupGuide', title: 'Setup guide', url: '/setup', description: 'Install the Unity SDK, the artel CLI, and the ARTEL agent skills on a machine. Not tied to one project.' },
  { id: 'admin', title: 'Admin', url: '/admin', description: 'Platform administration (ADMIN only, other users see a not-found page): QA run stats, token usage, knowledge, knowledge graph, expected-judgement labels, users, and settings (models, Bedrock and TypeSafe keys).' },
]

export const PAGE_CATALOG: PageCatalogEntry[] = [
  { id: 'home', title: 'Agent home', path: '', params: [], description: 'The index route. No page is open beside the chat.', fields: [], actions: [] },
  { id: 'documents', title: 'Planning documents', path: 'documents', params: [], description: 'Uploaded planning documents of the project.', fields: DOCUMENTS_FIELDS, actions: DOCUMENTS_ACTIONS },
  { id: 'testCases', title: 'Case library', path: 'test-cases', params: [], description: 'Test cases (TC) grouped by game version.', fields: TEST_CASES_FIELDS, actions: TEST_CASES_ACTIONS },
  { id: 'testRuns', title: 'Test runs', path: 'test-runs', params: [], description: 'Test runs: a named set of scenarios to run as QA. List of runs with a button to create a new one.', fields: [], actions: TEST_RUNS_ACTIONS },
  { id: 'qa', title: 'Run QA', path: 'qa', params: [], description: 'Start a QA run of a test run on a connected game. Set the form fields, then call qa.startRun.', fields: QA_FIELDS, actions: QA_ACTIONS },
  { id: 'qaHistory', title: 'QA history', path: 'qa-history', params: [], description: 'Past QA runs and their results.', fields: QA_HISTORY_FIELDS, actions: QA_HISTORY_ACTIONS },
  { id: 'contentMap', title: 'Screen map', path: 'content-map', params: ['build'], description: 'The content map of a game build: scenes and screens found by an evidence scan. Scan actions act on the selected build.', fields: CONTENT_MAP_FIELDS, actions: CONTENT_MAP_ACTIONS },
  { id: 'macros', title: 'Macros', path: 'macros', params: [], description: 'Macros registered by a game build.', fields: MACROS_FIELDS, actions: MACROS_ACTIONS },
  { id: 'performance', title: 'Performance', path: 'performance', params: [], description: 'Performance reports per build.', fields: PERFORMANCE_FIELDS, actions: PERFORMANCE_ACTIONS },
  { id: 'issues', title: 'Issues', path: 'issues', params: [], description: 'Issues found by QA runs.', fields: ISSUES_FIELDS, actions: ISSUES_ACTIONS },
  { id: 'knowledge', title: 'Knowledge graph', path: 'knowledge', params: [], description: 'Knowledge extracted from documents.', fields: KNOWLEDGE_FIELDS, actions: KNOWLEDGE_ACTIONS },
  { id: 'usage', title: 'Spend', path: 'usage', params: [], description: 'LLM spend of the project.', fields: USAGE_FIELDS, actions: USAGE_ACTIONS },
  { id: 'qaRun', title: 'QA run', path: 'qa-runs/:qaRunId', params: ['qaRunId'], description: 'One QA run: live game, scenario steps, logs.', fields: QA_RUN_FIELDS, actions: QA_RUN_ACTIONS },
  { id: 'testRun', title: 'Test run map', path: 'test-runs/:runId', params: ['runId'], description: 'The scenario map of one test run.', fields: TEST_RUN_FIELDS, actions: TEST_RUN_ACTIONS },
  { id: 'members', title: 'Members', path: 'members', params: [], description: 'Members of this project and invitations.', fields: MEMBERS_FIELDS, actions: MEMBERS_ACTIONS },
  { id: 'settings', title: 'Project settings', path: 'settings', params: [], description: 'Project name, genre, issue tracker link, and deleting the project.', fields: SETTINGS_FIELDS, actions: SETTINGS_ACTIONS },
  { id: 'setup', title: 'Setup', path: 'setup', params: [], description: 'Per-project setup guide: the Unity SDK install step and the artel CLI commands with this project\'s id filled in. It has no list of game instances or builds.', fields: SETUP_FIELDS, actions: SETUP_ACTIONS },
  { id: 'testRunEdit', title: 'Test run editor', path: 'test-runs/:runId/edit', aliases: ['test-scenarios/:testScenarioId'], params: ['runId', 'testScenarioId'], description: 'Edit the scenarios of one test run.', fields: TEST_RUN_EDIT_FIELDS, actions: TEST_RUN_EDIT_ACTIONS },
]

/** 서버로 보내는 모양. 함수(`summarize`)를 빼고 JSON 으로 만든다. */
export function wireCatalog(entries: PageCatalogEntry[] = PAGE_CATALOG): WirePageCatalog {
  return {
    pages: entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      path: entry.path,
      params: entry.params,
      description: entry.description,
      fields: entry.fields.map((field) => ({ name: field.name, description: field.description })),
      actions: entry.actions.map((action) => ({
        id: action.id,
        description: action.description,
        args: action.args,
        risk: action.risk,
      })),
    })),
    links: GLOBAL_LINKS,
    guides: GUIDES.map((guide) => ({ id: guide.id, title: guide.title, summary: guide.summary })),
  }
}

export function catalogEntry(page: PageId): PageCatalogEntry | undefined {
  return PAGE_CATALOG.find((entry) => entry.id === page)
}
