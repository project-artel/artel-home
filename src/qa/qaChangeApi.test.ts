import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { ProjectApiError } from '../projects/projectApi'
import { listQaChanges, parseQaChange, parseQaChangeList, revertQaChange } from './qaChangeApi'

const documented = {
  kind: 'KNOWLEDGE',
  targetId: '45',
  name: 'Slime takes double fire damage',
  change: 'UPDATE',
  before: 'tag: combat\nsummary: a\n\nold',
  after: 'tag: combat\nsummary: a\n\nnew',
  qaTryId: '9',
  changedAt: '2026-10-13T04:12:00Z',
  decision: 'APPLIED',
  revertible: true,
  notRevertibleReason: null,
}

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function mockFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return calls
}

test('reads a documented item field by field', () => {
  assert.deepEqual(parseQaChange(documented), documented)
})

test('CREATE and DELETE keep the missing side as null', () => {
  const created = parseQaChange({ ...documented, change: 'CREATE', before: null })
  assert.equal(created?.before, null)
  assert.equal(created?.after, documented.after)
  const deleted = parseQaChange({ ...documented, change: 'DELETE', after: null })
  assert.equal(deleted?.after, null)
})

test('a numeric targetId becomes a string', () => {
  assert.equal(parseQaChange({ ...documented, targetId: 45 })?.targetId, '45')
})

test('an item without a known kind, target, or change is dropped', () => {
  assert.equal(parseQaChange({ ...documented, kind: 'ISSUE' }), null)
  assert.equal(parseQaChange({ ...documented, targetId: null }), null)
  assert.equal(parseQaChange({ ...documented, change: 'RESTORE' }), null)
  assert.equal(parseQaChange('x'), null)
})

test('a reverted item is never revertible, whatever the flag says', () => {
  const parsed = parseQaChange({ ...documented, decision: 'REVERTED', revertible: true })
  assert.equal(parsed?.revertible, false)
})

test('the reason for a blocked revert is read', () => {
  const parsed = parseQaChange({ ...documented, revertible: false, notRevertibleReason: 'SUPERSEDED' })
  assert.equal(parsed?.notRevertibleReason, 'SUPERSEDED')
})

test('the list is an items envelope and a bad row does not drop the others', () => {
  const list = parseQaChangeList({ items: [documented, { kind: 'MACRO' }] })
  assert.equal(list.length, 1)
  assert.deepEqual(parseQaChangeList({ items: [] }), [])
  assert.throws(() => parseQaChangeList({}), ProjectApiError)
})

test('listQaChanges calls the run changes endpoint', async () => {
  const calls = mockFetch(200, { items: [documented] })
  const list = await listQaChanges('12')
  assert.equal(list.length, 1)
  assert.match(calls[0].url, /\/api\/qa-runs\/12\/changes$/)
})

test('revertQaChange posts to the lower case kind path and returns the updated item', async () => {
  const calls = mockFetch(200, { ...documented, kind: 'MACRO', targetId: '7', decision: 'REVERTED', revertible: false })
  const updated = await revertQaChange('12', { kind: 'MACRO', targetId: '7' })
  assert.match(calls[0].url, /\/api\/qa-runs\/12\/changes\/macro\/7\/revert$/)
  assert.equal(calls[0].init?.method, 'POST')
  assert.equal(updated.decision, 'REVERTED')
})

test('a 409 rejects with the status and the server reason', async () => {
  mockFetch(409, { code: 'CONFLICT', message: 'Changed again after this run.' })
  await assert.rejects(
    revertQaChange('12', { kind: 'KNOWLEDGE', targetId: '45' }),
    (error: unknown) =>
      error instanceof ProjectApiError && error.status === 409 && error.message === 'Changed again after this run.',
  )
})
