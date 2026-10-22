/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestCase } from '../testCases/testCaseTypes.ts'
import { combineCaseListStatus, describeFreeCases, indexCasesById, selectAddableCases } from './freeScenarioCases.ts'
import {
  createFreeScenario,
  parseExecutionMode,
  parseScenarioDraft,
  parseScenarioSummary,
} from './scenarioApi.ts'
import { buildFreeScenarioDraft, createEmptyStep, isFreeScenario, type ScenarioStep } from './scenarioTypes.ts'

/*
 * The server's `execution_mode` is not merged yet. These cases pin the contract as the
 * ticket states it: the field is snake_case, FREE has one `{ action: '', case_id }` step per
 * TC, and a response without the field is ORDERED.
 */

function testCase(id: string, overrides: Partial<TestCase> = {}): TestCase {
  return {
    id,
    projectId: '1',
    scene: 'Shop',
    step: `step of ${id}`,
    precondition: null,
    expectedValue: `expected of ${id}`,
    status: null,
    verificationStatus: 'DRAFT',
    lastVerifiedBuildId: null,
    createdAt: '',
    folderId: null,
    evidenceGaps: [],
    ...overrides,
  }
}

test('a draft or summary without execution_mode is ORDERED', () => {
  assert.equal(parseExecutionMode(undefined), 'ORDERED')
  assert.equal(parseExecutionMode('something-new'), 'ORDERED')
  assert.equal(parseScenarioDraft({ title: 'old', steps: [] }).execution_mode, 'ORDERED')
  assert.equal(parseScenarioSummary({ testScenarioId: 3, title: 'old' })?.executionMode, 'ORDERED')
})

test('execution_mode FREE is read from a draft and from a list row', () => {
  const draft = parseScenarioDraft({ title: 'free', steps: [{ action: '', case_id: 7 }], execution_mode: 'FREE' })
  assert.equal(draft.execution_mode, 'FREE')
  assert.equal(isFreeScenario(draft), true)
  assert.equal(draft.steps[0].case_id, 7)
  assert.equal(parseScenarioSummary({ testScenarioId: 3, execution_mode: 'FREE' })?.executionMode, 'FREE')
})

test('the FREE draft has one blank-action step per case, without duplicates', () => {
  const draft = buildFreeScenarioDraft('Shop checks', ['11', '12', '11'])
  assert.equal(draft.title, 'Shop checks')
  assert.equal(draft.execution_mode, 'FREE')
  assert.deepEqual(
    draft.steps.map((step) => [step.action, step.case_id]),
    [['', 11], ['', 12]],
  )
})

test('creating a FREE scenario creates, then saves the draft with execution_mode', async () => {
  const originalFetch = globalThis.fetch
  const calls: { method: string; url: string; body: unknown }[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, url: String(input), body })
    const payload = method === 'POST' ? { testScenarioId: 42 } : { testScenarioId: 42, projectId: 5, payload: body.draft }
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch

  try {
    const id = await createFreeScenario(5, 'Shop checks', ['11', '12'])
    assert.equal(id, 42)
    assert.deepEqual(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`), [
      'POST /api/test-scenario',
      'PUT /api/test-scenario/42',
    ])
    assert.deepEqual(calls[0].body, { projectId: 5 })
    assert.deepEqual(calls[1].body, { draft: buildFreeScenarioDraft('Shop checks', ['11', '12']) })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('FREE rows are numbered among the case steps and keep the step index', () => {
  const steps: ScenarioStep[] = [
    { ...createEmptyStep(), case_id: 11 },
    { ...createEmptyStep(), case_id: 99 },
  ]
  const rows = describeFreeCases(steps, indexCasesById([testCase('11')]))
  assert.deepEqual(rows.map((row) => [row.index, row.number, row.caseId, row.testCase?.id ?? null, row.availability]), [
    [0, 1, '11', '11', 'present'],
    [1, 2, '99', null, 'missing'],
  ])
})

test('with a run build, a case outside the build is notInBuild, not missing, and a build case shows its build content', () => {
  const steps: ScenarioStep[] = [
    { ...createEmptyStep(), case_id: 11 },
    { ...createEmptyStep(), case_id: 12 },
    { ...createEmptyStep(), case_id: 99 },
  ]
  const project = indexCasesById([testCase('11'), testCase('12')])
  const build = indexCasesById([testCase('11', { step: 'build content' })])
  const rows = describeFreeCases(steps, project, build)
  assert.deepEqual(rows.map((row) => [row.caseId, row.availability, row.testCase?.step ?? null]), [
    ['11', 'present', 'build content'],
    ['12', 'notInBuild', 'step of 12'],
    ['99', 'missing', null],
  ])
})

test('the FREE lists are loading until both arrive and an error when either fails', () => {
  assert.equal(combineCaseListStatus('ready', null), 'ready')
  assert.equal(combineCaseListStatus('ready', 'loading'), 'loading')
  assert.equal(combineCaseListStatus('loading', 'error'), 'error')
  assert.equal(combineCaseListStatus('ready', 'ready'), 'ready')
})

test('the add dialog offers only cases the scenario does not hold, narrowed by search', () => {
  const steps: ScenarioStep[] = [{ ...createEmptyStep(), case_id: 11 }]
  const all = [testCase('11'), testCase('12', { scene: 'Boss', step: 'defeat the boss' }), testCase('13')]
  assert.deepEqual(selectAddableCases(all, steps, '').map((c) => c.id), ['12', '13'])
  assert.deepEqual(selectAddableCases(all, steps, 'BOSS').map((c) => c.id), ['12'])
  assert.deepEqual(selectAddableCases(all, steps, 'nothing like this'), [])
})
