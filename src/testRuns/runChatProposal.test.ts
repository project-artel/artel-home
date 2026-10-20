/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDrafts, parseProposal, parseRunStreamEvent } from './runChatApi.ts'

test('a proposal without execution_mode is ORDERED', () => {
  const proposal = parseProposal({ scenario_id: 4, title: 'old', steps: [{ action: 'Open' }] })
  assert.equal(proposal.executionMode, 'ORDERED')
  assert.equal(proposal.scenarioId, 4)
})

test('a FREE proposal keeps its mode and its case ids', () => {
  const proposal = parseProposal({
    scenario_id: null,
    title: 'Shop checks',
    steps: [{ action: '', case_id: 31 }, { action: '', case_id: 32 }],
    execution_mode: 'FREE',
  })
  assert.equal(proposal.executionMode, 'FREE')
  assert.deepEqual(proposal.steps.map((step) => step.case_id), [31, 32])
})

test('a result frame carries the mode of each proposal', () => {
  const event = parseRunStreamEvent(
    JSON.stringify({
      type: 'result',
      message: 'done',
      scenarios: [{ title: 'a', execution_mode: 'FREE' }, { title: 'b' }],
    }),
  )
  assert.equal(event?.type, 'result')
  if (event?.type !== 'result') return
  assert.deepEqual(event.scenarios.map((s) => s.executionMode), ['FREE', 'ORDERED'])
})

test('a draft keeps FREE, and one without execution_mode is ORDERED', () => {
  const [free, plain] = parseDrafts([
    { draft_id: 'new-1', title: 'Shop checks', steps: [], execution_mode: 'FREE' },
    { draft_id: 'edit-2', scenario_id: 2, title: 'old', steps: [] },
  ])
  assert.equal(free?.executionMode, 'FREE')
  assert.equal(plain?.executionMode, 'ORDERED')
})
