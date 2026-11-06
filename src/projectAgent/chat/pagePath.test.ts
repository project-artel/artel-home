/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogEntry } from '../catalog.ts'
import { projectRoute, resolvePagePath } from './pagePath.ts'

function entry(page: Parameters<typeof catalogEntry>[0]) {
  const found = catalogEntry(page)
  assert.ok(found)
  return found
}

test('resolvePagePath fills a path param and encodes it', () => {
  assert.deepEqual(resolvePagePath(entry('qaRun'), { qaRunId: '55' }), { ok: true, path: 'qa-runs/55' })
  assert.deepEqual(resolvePagePath(entry('testRunEdit'), { runId: 7 }), { ok: true, path: 'test-runs/7/edit' })
  assert.deepEqual(resolvePagePath(entry('qaRun'), { qaRunId: 'a/b' }), { ok: true, path: 'qa-runs/a%2Fb' })
})

test('resolvePagePath fails when a path param is missing', () => {
  const resolved = resolvePagePath(entry('testRun'), {})
  assert.equal(resolved.ok, false)
})

test('resolvePagePath puts declared non-path params in the query and drops unknown ones', () => {
  assert.deepEqual(resolvePagePath(entry('contentMap'), { build: '3', other: 'x' }), {
    ok: true,
    path: 'content-map?build=3',
  })
  assert.deepEqual(resolvePagePath(entry('contentMap'), {}), { ok: true, path: 'content-map' })
})

test('resolvePagePath gives an empty path for home', () => {
  assert.deepEqual(resolvePagePath(entry('home'), {}), { ok: true, path: '' })
})

test('projectRoute joins the project base', () => {
  assert.equal(projectRoute('4', ''), '/projects/4')
  assert.equal(projectRoute('4', 'qa-runs/55'), '/projects/4/qa-runs/55')
  assert.equal(projectRoute('4', '/qa'), '/projects/4/qa')
})
