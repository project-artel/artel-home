import assert from 'node:assert/strict'
import test from 'node:test'
import { wireCatalog } from '../catalog'
import { readGuide } from '../chat/tools/readGuide'
import type { ToolContext } from '../chat/toolTypes'
import { findGuide, GUIDES } from './index'

const context = {} as ToolContext

test('every guide has a unique id in kebab-case and non-empty text', () => {
  assert.ok(GUIDES.length > 0)
  const ids = GUIDES.map((guide) => guide.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const guide of GUIDES) {
    assert.match(guide.id, /^[a-z0-9-]+$/)
    assert.ok(guide.title.trim().length > 0, guide.id)
    assert.ok(guide.summary.trim().length > 0, guide.id)
    assert.ok(guide.body.trim().length > 0, guide.id)
  }
})

test('the guides the project agent promises exist', () => {
  for (const id of [
    'sdk-connect', 'cli-install', 'cli-run-qa', 'skills-install', 'mcp-connect',
    'account-and-keys', 'create-project', 'invite-members', 'admin',
  ]) {
    assert.ok(findGuide(id) !== undefined, id)
  }
})

test('read_guide returns the body of a known guide', async () => {
  const outcome = await readGuide({ topic: 'cli-install' }, context)
  assert.equal(outcome.status, 'ok')
  const result = outcome.result as { id: string; body: string }
  assert.equal(result.id, 'cli-install')
  assert.equal(result.body, findGuide('cli-install')?.body)
})

test('read_guide lists the known ids for an unknown topic', async () => {
  const outcome = await readGuide({ topic: 'nope' }, context)
  assert.equal(outcome.status, 'error')
  for (const guide of GUIDES) assert.ok(outcome.error?.includes(guide.id), guide.id)
})

test('the wire catalog carries every guide without its body', () => {
  const { guides } = wireCatalog()
  assert.deepEqual(guides.map((guide) => guide.id), GUIDES.map((guide) => guide.id))
  for (const guide of guides) {
    assert.deepEqual(Object.keys(guide).sort(), ['id', 'summary', 'title'])
  }
})
