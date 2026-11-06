/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentRegistryApi, PageSnapshot } from '../registry/types.ts'
import { executeToolCall, outcomeToResult, parseChoiceOptions } from './toolExecutor.ts'
import type { ToolContext } from './toolTypes.ts'

const snapshot: PageSnapshot = { page: 'qa', params: {}, fields: {}, actions: [] }

function context(overrides: Partial<AgentRegistryApi> = {}, extra: Partial<ToolContext> = {}) {
  const navigated: string[] = []
  const registry: AgentRegistryApi = {
    snapshot: () => snapshot,
    waitForPage: async () => true,
    setField: async () => ({ status: 'ok', result: undefined }),
    callAction: async () => ({ status: 'ok', result: { qaRunId: '55' } }),
    pendingApproval: () => null,
    subscribe: () => () => {},
    ...overrides,
  }
  const toolContext: ToolContext = {
    projectId: '1',
    conversationId: 12,
    registry,
    navigate: (path) => navigated.push(path),
    upsertJob: () => {},
    postEvent: () => {},
    askChoice: async () => null,
    signal: new AbortController().signal,
    ...extra,
  }
  return { toolContext, navigated }
}

test('outcomeToResult attaches the snapshot to every outcome', () => {
  assert.deepEqual(outcomeToResult({ status: 'ok', result: 1 }, snapshot), { status: 'ok', result: 1, page: snapshot })
  assert.deepEqual(outcomeToResult({ status: 'ok', result: undefined }, snapshot), { status: 'ok', page: snapshot })
  assert.deepEqual(outcomeToResult({ status: 'error', error: 'blocked' }, snapshot), {
    status: 'error',
    error: 'blocked',
    page: snapshot,
  })
  assert.deepEqual(outcomeToResult({ status: 'rejected' }, snapshot), { status: 'rejected', page: snapshot })
})

test('open_page navigates to the resolved path and returns the snapshot', async () => {
  const { toolContext, navigated } = context()
  const result = await executeToolCall({ callId: 'c', tool: 'open_page', args: { page: 'qaRun', params: { qaRunId: 55 } } }, toolContext)
  assert.deepEqual(navigated, ['qa-runs/55'])
  assert.deepEqual(result, { status: 'ok', page: snapshot })
})

test('open_page reports an unknown page or a missing param without navigating', async () => {
  const { toolContext, navigated } = context()
  assert.equal((await executeToolCall({ callId: 'c', tool: 'open_page', args: { page: 'nowhere' } }, toolContext)).status, 'error')
  assert.equal((await executeToolCall({ callId: 'c', tool: 'open_page', args: { page: 'qaRun' } }, toolContext)).status, 'error')
  assert.deepEqual(navigated, [])
})

test('open_page reports a page that does not register in time', async () => {
  const { toolContext } = context({ waitForPage: async () => false })
  const result = await executeToolCall({ callId: 'c', tool: 'open_page', args: { page: 'qa' } }, toolContext)
  assert.equal(result.status, 'error')
  assert.deepEqual(result.page, snapshot)
})

test('call_action passes args and maps the outcome', async () => {
  let received: unknown = null
  const { toolContext } = context({
    callAction: async (id, args) => {
      received = { id, args }
      return { status: 'unavailable' }
    },
  })
  const result = await executeToolCall({ callId: 'c', tool: 'call_action', args: { action: 'qa.startRun', args: { build: '1' } } }, toolContext)
  assert.deepEqual(received, { id: 'qa.startRun', args: { build: '1' } })
  assert.deepEqual(result, { status: 'unavailable', page: snapshot })
})

test('a handler that throws becomes an error result', async () => {
  const { toolContext } = context({
    setField: async () => {
      throw new Error('boom')
    },
  })
  const result = await executeToolCall({ callId: 'c', tool: 'set_field', args: { field: 'build', value: 1 } }, toolContext)
  assert.deepEqual(result, { status: 'error', error: 'boom' })
})

test('ask_choice returns picked ids or cancelled', async () => {
  const args = { question: 'Which build?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }
  const picked = context({}, { askChoice: async () => ['b'] })
  assert.deepEqual(await executeToolCall({ callId: 'c', tool: 'ask_choice', args }, picked.toolContext), {
    status: 'ok',
    result: { optionIds: ['b'] },
  })
  const stopped = context()
  assert.deepEqual(await executeToolCall({ callId: 'c', tool: 'ask_choice', args }, stopped.toolContext), { status: 'cancelled' })
})

test('parseChoiceOptions keeps options with id and label', () => {
  assert.deepEqual(parseChoiceOptions([{ id: 1, label: 'one' }, { id: 'x' }, 'bad']), [{ id: '1', label: 'one' }])
})

test('an unknown tool is an error', async () => {
  const { toolContext } = context()
  assert.equal((await executeToolCall({ callId: 'c', tool: 'fly', args: {} }, toolContext)).status, 'error')
})
