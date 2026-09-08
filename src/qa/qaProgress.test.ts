import assert from 'node:assert/strict'
import test from 'node:test'
import { createEmptyStep, type ScenarioStep } from '../testScenarios/scenarioTypes'
import { deriveQaProgress } from './qaProgress'
import type { QaLog } from './qaTypes'

function step(action: string, expectedPassed: boolean | null = null): ScenarioStep {
  return { ...createEmptyStep(), action, expected_passed: expectedPassed }
}

/** One `report_step` frame: the per-step `STATUS` row carrying the verdict. */
function verdict(id: string, stepNumber: number, passed: boolean): QaLog {
  return {
    id,
    qaTryId: '1',
    messageId: null,
    correlationId: null,
    direction: 'AGENT_TO_ORCHE',
    type: 'STATUS',
    message: '',
    payload: { step: stepNumber, status: passed ? 'COMPLETED' : 'FAILED', message: '' },
    createdAt: '2026-09-08T00:00:00Z',
  }
}

function derive(scenarioSteps: ScenarioStep[], logs: QaLog[]) {
  return deriveQaProgress({
    scenarioSteps,
    logs,
    status: 'COMPLETED',
    historyComplete: true,
  })
}

test('a step with no expectation is never graded', () => {
  const progress = derive([step('타이틀을 연다')], [verdict('l1', 1, true)])

  assert.equal(progress.steps[0].state, 'passed')
  assert.equal(progress.steps[0].expectedPassed, null)
  assert.equal(progress.steps[0].grade, null)
  assert.deepEqual(
    { labeled: progress.labeled, correct: progress.correct, wrong: progress.wrong },
    { labeled: 0, correct: 0, wrong: 0 },
  )
})

test('a failed step the game is supposed to refuse grades as correct', () => {
  const progress = derive([step('대사창을 마우스로 넘긴다', false)], [verdict('l1', 1, false)])

  // The verdict still says failed — only the grade says the agent was right.
  assert.equal(progress.steps[0].state, 'failed')
  assert.equal(progress.steps[0].grade, 'correct')
  assert.equal(progress.correct, 1)
  assert.equal(progress.failed, 1)
})

test('reporting a step that should fail as passed grades as wrong', () => {
  const progress = derive([step('대사창을 마우스로 넘긴다', false)], [verdict('l1', 1, true)])

  assert.equal(progress.steps[0].state, 'passed')
  assert.equal(progress.steps[0].grade, 'wrong')
  assert.equal(progress.wrong, 1)
})

test('failing a step that should pass grades as wrong', () => {
  const progress = derive([step('새 게임 버튼을 누른다', true)], [verdict('l1', 1, false)])

  assert.equal(progress.steps[0].grade, 'wrong')
  assert.equal(progress.wrong, 1)
})

test('an expectation the run never judged counts as labelled but is graded neither way', () => {
  const progress = derive([step('보스를 두 방에 잡는다', false)], [])

  assert.equal(progress.steps[0].state, 'unreported')
  assert.equal(progress.steps[0].expectedPassed, false)
  assert.equal(progress.steps[0].grade, null)
  assert.deepEqual(
    { labeled: progress.labeled, correct: progress.correct, wrong: progress.wrong },
    { labeled: 1, correct: 0, wrong: 0 },
  )
})

test('the tallies count only the labelled steps, not the whole run', () => {
  const scenarioSteps = [
    step('새 게임 버튼을 누른다'),
    step('안 열린 노드로 이동한다', false),
    step('평원 세 웨이브를 격파한다', true),
  ]
  const progress = derive(scenarioSteps, [
    verdict('l1', 1, true),
    verdict('l2', 2, false),
    verdict('l3', 3, false),
  ])

  assert.deepEqual(
    progress.steps.map((row) => row.grade),
    [null, 'correct', 'wrong'],
  )
  assert.deepEqual(
    { labeled: progress.labeled, correct: progress.correct, wrong: progress.wrong },
    { labeled: 2, correct: 1, wrong: 1 },
  )
  // The pass/fail counts are untouched: they are what the run reported.
  assert.deepEqual({ passed: progress.passed, failed: progress.failed }, { passed: 1, failed: 2 })
})
