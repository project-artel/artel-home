/**
 * agent 에게 보내는 page catalog. 계약 4절의 형식이다. 페이지마다 fields 와 actions 는
 * 그 페이지의 binding 을 만드는 작업(ARTEL-1130)이 채운다.
 */
import type { ActionSpec, FieldSpec, JsonSchema, PageId } from './registry/types'

export type PageCatalogEntry = {
  id: PageId
  title: string
  path: string
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
}

export const PAGE_CATALOG: PageCatalogEntry[] = [
  { id: 'home', title: 'Agent home', path: '', params: [], description: 'The index route. No page is open beside the chat.', fields: [], actions: [] },
  { id: 'documents', title: 'Planning documents', path: 'documents', params: [], description: 'Uploaded planning documents of the project.', fields: [], actions: [] },
  { id: 'testCases', title: 'Case library', path: 'test-cases', params: [], description: 'Test cases (TC) grouped by game version.', fields: [], actions: [] },
  { id: 'testRuns', title: 'Test runs', path: 'test-runs', params: [], description: 'Test runs: a named set of scenarios to run as QA.', fields: [], actions: [] },
  { id: 'qa', title: 'Run QA', path: 'qa', params: [], description: 'Start a QA run of a test run on a connected game.', fields: [], actions: [] },
  { id: 'qaHistory', title: 'QA history', path: 'qa-history', params: [], description: 'Past QA runs and their results.', fields: [], actions: [] },
  { id: 'contentMap', title: 'Screen map', path: 'content-map', params: ['build'], description: 'The content map of a game build: scenes and screens found by an evidence scan.', fields: [], actions: [] },
  { id: 'macros', title: 'Macros', path: 'macros', params: [], description: 'Macros registered by a game build.', fields: [], actions: [] },
  { id: 'performance', title: 'Performance', path: 'performance', params: [], description: 'Performance reports per build.', fields: [], actions: [] },
  { id: 'issues', title: 'Issues', path: 'issues', params: [], description: 'Issues found by QA runs.', fields: [], actions: [] },
  { id: 'knowledge', title: 'Knowledge graph', path: 'knowledge', params: [], description: 'Knowledge extracted from documents.', fields: [], actions: [] },
  { id: 'usage', title: 'Spend', path: 'usage', params: [], description: 'LLM spend of the project.', fields: [], actions: [] },
  { id: 'qaRun', title: 'QA run', path: 'qa-runs/:qaRunId', params: ['qaRunId'], description: 'One QA run: live game, scenario steps, logs.', fields: [], actions: [] },
  { id: 'testRun', title: 'Test run map', path: 'test-runs/:runId', params: ['runId'], description: 'The scenario map of one test run.', fields: [], actions: [] },
  { id: 'testRunEdit', title: 'Test run editor', path: 'test-runs/:runId/edit', params: ['runId'], description: 'Edit the scenarios of one test run.', fields: [], actions: [] },
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
  }
}

export function catalogEntry(page: PageId): PageCatalogEntry | undefined {
  return PAGE_CATALOG.find((entry) => entry.id === page)
}
