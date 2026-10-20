/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEP_TARGET_MAX, stepTarget } from './stepLabel.ts'

test('stepTarget names the page, field, action or query', () => {
  assert.equal(stepTarget('open_page', { page: 'qa' }), 'Run QA')
  assert.equal(stepTarget('set_field', { field: 'build' }), 'build')
  assert.equal(stepTarget('call_action', { action: 'qa.startRun' }), 'qa.startRun')
  assert.equal(stepTarget('query', { kind: 'issues' }), 'issues')
  assert.equal(stepTarget('watch_job', { kind: 'qa_run', id: 55 }), 'qa_run 55')
  assert.equal(stepTarget('read_page', {}), '')
})

test('stepTarget shortens a long target', () => {
  const target = stepTarget('ask_choice', { question: 'x'.repeat(100) })
  assert.equal(target.length, STEP_TARGET_MAX)
  assert.ok(target.endsWith('…'))
})
