/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createActionRegistry } from './createActionRegistry.ts'
import { derivePage } from './pageFromPath.ts'
import type { ActionBinding, ActionSpec, FieldBinding, PageId } from './types.ts'

function makeAction(overrides: Partial<ActionSpec> = {}, extra: Partial<ActionBinding> = {}) {
  const calls: Record<string, unknown>[] = []
  const binding: ActionBinding = {
    spec: {
      id: 'qa.startRun',
      page: 'qa',
      description: 'start',
      args: { type: 'object', required: ['testRunId'], properties: { testRunId: { type: 'string' } } },
      risk: 'auto',
      summarize: (args) => `start ${String(args.testRunId)}`,
      ...overrides,
    },
    target: () => null,
    blocked: () => null,
    run: async (args) => {
      calls.push(args)
      return 'started'
    },
    ...extra,
  }
  return { binding, calls }
}

function makeField(name = 'qa.testRunId', page: PageId = 'qa') {
  let value: unknown = 'a'
  const binding: FieldBinding = {
    spec: { name, page, description: 'field' },
    target: () => null,
    read: () => value,
    options: () => [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
    write: (next) => {
      value = next
    },
  }
  return { binding, current: () => value }
}

const fast = { highlightMilliseconds: 5, emptyPageGraceMilliseconds: 5, pageHasCatalogBindings: () => false }

test('snapshot lists registered actions and fields, and unregister removes them', () => {
  const registry = createActionRegistry(fast)
  const action = makeAction()
  const field = makeField()
  registry.setLocation('qa', { build: 'b1' })
  const offAction = registry.registerAction(action.binding)
  const offField = registry.registerField(field.binding)
  const snapshot = registry.snapshot()
  assert.equal(snapshot.page, 'qa')
  assert.deepEqual(snapshot.params, { build: 'b1' })
  assert.deepEqual(snapshot.actions, [{ id: 'qa.startRun', blocked: null }])
  assert.deepEqual(snapshot.fields['qa.testRunId'], {
    value: 'a',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  })
  offAction()
  offField()
  assert.deepEqual(registry.snapshot().actions, [])
  assert.deepEqual(registry.snapshot().fields, {})
})

test('a stale unregister does not remove a newer binding with the same id', () => {
  const registry = createActionRegistry(fast)
  const first = makeAction()
  const second = makeAction()
  const offFirst = registry.registerAction(first.binding)
  registry.registerAction(second.binding)
  offFirst()
  assert.equal(registry.snapshot().actions.length, 1)
})

test('subscribe is notified on registration and can be cancelled', () => {
  const registry = createActionRegistry(fast)
  let count = 0
  const off = registry.subscribe(() => {
    count += 1
  })
  const stop = registry.registerAction(makeAction().binding)
  assert.equal(count, 1)
  off()
  stop()
  assert.equal(count, 1)
})

test('callAction rejects unknown ids, bad args, and blocked actions', async () => {
  const registry = createActionRegistry(fast)
  assert.deepEqual(await registry.callAction('nope', {}), { status: 'unavailable' })
  const action = makeAction({}, { blocked: () => 'no build connected' })
  registry.registerAction(action.binding)
  const missing = await registry.callAction('qa.startRun', {})
  assert.equal(missing.status, 'error')
  assert.match(String((missing as { error?: string }).error), /testRunId is required/)
  const wrongType = await registry.callAction('qa.startRun', { testRunId: 3 })
  assert.match(String((wrongType as { error?: string }).error), /must be of type string/)
  const blocked = await registry.callAction('qa.startRun', { testRunId: 'r' })
  assert.deepEqual(blocked, { status: 'error', error: 'no build connected' })
  assert.equal(action.calls.length, 0)
})

test('auto action highlights, then runs and clears the highlight', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction()
  registry.registerAction(action.binding)
  const pending = registry.callAction('qa.startRun', { testRunId: 'r1' })
  assert.deepEqual(
    { label: registry.highlight()?.label, mode: registry.highlight()?.mode },
    { label: 'start r1', mode: 'acting' },
  )
  assert.equal(action.calls.length, 0)
  assert.deepEqual(await pending, { status: 'ok', result: 'started' })
  assert.deepEqual(action.calls, [{ testRunId: 'r1' }])
  assert.equal(registry.highlight(), null)
})

test('a handler that throws becomes an error outcome', async () => {
  const registry = createActionRegistry(fast)
  registry.registerAction(
    makeAction({}, { run: async () => Promise.reject(new Error('boom')) }).binding,
  )
  assert.deepEqual(await registry.callAction('qa.startRun', { testRunId: 'r' }), {
    status: 'error',
    error: 'boom',
  })
})

test('approve action waits, keeps the highlight, and runs after approve', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction({ risk: 'approve' })
  registry.registerAction(action.binding)
  const outcome = registry.callAction('qa.startRun', { testRunId: 'r2' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(registry.highlight()?.mode, 'approval')
  assert.equal(action.calls.length, 0)
  const approval = registry.pendingApproval()
  assert.equal(approval?.summary, 'start r2')
  approval?.approve()
  assert.deepEqual(await outcome, { status: 'ok', result: 'started' })
  assert.equal(registry.pendingApproval(), null)
  assert.equal(registry.highlight(), null)
})

test('reject returns rejected and does not run', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction({ risk: 'approve' })
  registry.registerAction(action.binding)
  const outcome = registry.callAction('qa.startRun', { testRunId: 'r3' })
  registry.pendingApproval()?.reject()
  assert.deepEqual(await outcome, { status: 'rejected' })
  assert.equal(action.calls.length, 0)
  assert.equal(registry.highlight(), null)
})

test('setField highlights, writes, and reports unavailable for unknown fields', async () => {
  const registry = createActionRegistry(fast)
  const field = makeField()
  registry.registerField(field.binding)
  assert.deepEqual(await registry.setField('missing', 1), { status: 'unavailable' })
  const pending = registry.setField('qa.testRunId', 'b')
  assert.equal(registry.highlight()?.mode, 'acting')
  assert.equal(field.current(), 'a')
  assert.equal((await pending).status, 'ok')
  assert.equal(field.current(), 'b')
  assert.equal(registry.highlight(), null)
})

test('setField rejects a value outside the options and a non-boolean for a boolean field', async () => {
  const registry = createActionRegistry(fast)
  const field = makeField()
  registry.registerField(field.binding)
  const outside = await registry.setField('qa.testRunId', 'z')
  assert.equal(outside.status, 'error')
  assert.match(String((outside as { error?: string }).error), /must be one of "a", "b"/)
  assert.equal(field.current(), 'a')

  let flag = false
  registry.registerField({
    spec: { name: 'qa.verbose', page: 'qa', description: 'flag' },
    target: () => null,
    read: () => flag,
    write: (next) => {
      flag = next as boolean
    },
  })
  const notBoolean = await registry.setField('qa.verbose', 'true')
  assert.equal(notBoolean.status, 'error')
  assert.equal(flag, false)
  assert.equal((await registry.setField('qa.verbose', true)).status, 'ok')
  assert.equal(flag, true)
})

test('setField compares options as strings, so a numeric option accepts its string form', async () => {
  const registry = createActionRegistry(fast)
  let value: unknown = 1
  registry.registerField({
    spec: { name: 'qa.reasoning', page: 'qa', description: 'index' },
    target: () => null,
    read: () => value,
    options: () => [
      { value: 0, label: 'low' },
      { value: 1, label: 'high' },
    ],
    write: (next) => {
      value = next
    },
  })
  assert.equal((await registry.setField('qa.reasoning', '0')).status, 'ok')
  assert.equal(value, '0')
})

test('setField leaves an empty options list to the page writer', async () => {
  const registry = createActionRegistry(fast)
  let value: unknown = 1024
  registry.registerField({
    spec: { name: 'qa.reasoningValue', page: 'qa', description: 'token budget' },
    target: () => null,
    read: () => value,
    options: () => [],
    write: (next) => {
      value = next
    },
  })
  assert.equal((await registry.setField('qa.reasoningValue', 2048)).status, 'ok')
  assert.equal(value, 2048)
})

test('aborting during the highlight cancels setField and callAction without writing or running', async () => {
  const registry = createActionRegistry({ ...fast, highlightMilliseconds: 200 })
  const field = makeField()
  const action = makeAction()
  registry.registerField(field.binding)
  registry.registerAction(action.binding)

  const fieldController = new AbortController()
  const fieldOutcome = registry.setField('qa.testRunId', 'b', fieldController.signal)
  fieldController.abort()
  assert.deepEqual(await fieldOutcome, { status: 'cancelled' })
  assert.equal(field.current(), 'a')

  const actionController = new AbortController()
  const actionOutcome = registry.callAction('qa.startRun', { testRunId: 'r' }, actionController.signal)
  actionController.abort()
  assert.deepEqual(await actionOutcome, { status: 'cancelled' })
  assert.equal(action.calls.length, 0)
  assert.equal(registry.highlight(), null)

  const alreadyAborted = AbortSignal.abort()
  assert.deepEqual(await registry.callAction('qa.startRun', { testRunId: 'r' }, alreadyAborted), {
    status: 'cancelled',
  })
})

test('aborting while waiting for approval cancels and closes the approval', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction({ risk: 'approve' })
  registry.registerAction(action.binding)
  const controller = new AbortController()
  const outcome = registry.callAction('qa.startRun', { testRunId: 'r' }, controller.signal)
  assert.notEqual(registry.pendingApproval(), null)
  controller.abort()
  assert.deepEqual(await outcome, { status: 'cancelled' })
  assert.equal(registry.pendingApproval(), null)
  assert.equal(registry.highlight(), null)
  assert.equal(action.calls.length, 0)
})

test('a stale approve does not settle a newer approval', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction({ risk: 'approve' })
  registry.registerAction(action.binding)
  const first = registry.callAction('qa.startRun', { testRunId: 'r1' })
  const firstApproval = registry.pendingApproval()
  firstApproval?.reject()
  assert.deepEqual(await first, { status: 'rejected' })

  const second = registry.callAction('qa.startRun', { testRunId: 'r2' })
  firstApproval?.approve()
  assert.equal(registry.pendingApproval()?.summary, 'start r2')
  assert.equal(action.calls.length, 0)
  registry.pendingApproval()?.approve()
  assert.deepEqual(await second, { status: 'ok', result: 'started' })
  assert.deepEqual(action.calls, [{ testRunId: 'r2' }])
})

test('unregistering the binding that waits for approval rejects it with "the page closed"', async () => {
  const registry = createActionRegistry(fast)
  const action = makeAction({ risk: 'approve' })
  const unregister = registry.registerAction(action.binding)
  const outcome = registry.callAction('qa.startRun', { testRunId: 'r' })
  unregister()
  assert.deepEqual(await outcome, { status: 'rejected', error: 'the page closed' })
  assert.equal(registry.pendingApproval(), null)
  assert.equal(action.calls.length, 0)
})

test('approve re-checks blocked before running', async () => {
  const registry = createActionRegistry(fast)
  let blockedReason: string | null = null
  const action = makeAction({ risk: 'approve' }, { blocked: () => blockedReason })
  registry.registerAction(action.binding)
  const outcome = registry.callAction('qa.startRun', { testRunId: 'r' })
  blockedReason = 'a run is already in progress'
  registry.pendingApproval()?.approve()
  assert.deepEqual(await outcome, { status: 'error', error: 'a run is already in progress' })
  assert.equal(action.calls.length, 0)
})

test('waitForPage resolves true once the page has a binding, false on timeout', async () => {
  const registry = createActionRegistry({ ...fast, pageHasCatalogBindings: () => true })
  const waiting = registry.waitForPage('qa', 500)
  registry.setLocation('qa', {})
  registry.registerAction(makeAction().binding)
  assert.equal(await waiting, true)
  assert.equal(await registry.waitForPage('issues', 20), false)
})

test('waitForPage resolves for an empty catalog page after the grace period', async () => {
  const registry = createActionRegistry(fast)
  registry.setLocation('issues', {})
  assert.equal(await registry.waitForPage('issues', 200), true)
})

test('derivePage maps pathnames and query params to page ids', () => {
  const project = 'p 1'
  const base = `/projects/${encodeURIComponent(project)}`
  assert.deepEqual(derivePage(project, base), { page: 'home', params: {} })
  assert.equal(derivePage(project, `${base}/qa`).page, 'qa')
  assert.deepEqual(derivePage(project, `${base}/content-map`, '?build=b7'), {
    page: 'contentMap',
    params: { build: 'b7' },
  })
  assert.deepEqual(derivePage(project, `${base}/qa-runs/r9`), { page: 'qaRun', params: { qaRunId: 'r9' } })
  assert.deepEqual(derivePage(project, `${base}/test-runs/t1`), { page: 'testRun', params: { runId: 't1' } })
  assert.deepEqual(derivePage(project, `${base}/test-runs/t1/edit`), { page: 'testRunEdit', params: { runId: 't1' } })
  assert.equal(derivePage(project, `${base}/test-runs`).page, 'testRuns')
  assert.equal(derivePage(project, `${base}/members`).page, 'members')
  assert.equal(derivePage(project, `${base}/usage-history`).page, null)
  assert.equal(derivePage(project, '/projects/other/qa').page, null)
})
