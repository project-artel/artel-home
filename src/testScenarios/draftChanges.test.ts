import assert from 'node:assert/strict'
import test from 'node:test'
import { compareDraftSteps } from './draftChanges'
import type { ScenarioStep } from './scenarioTypes'

const step = (action: string, caseId: number | null = null): ScenarioStep =>
  ({ action, case_id: caseId, hint: null, input: null, step_kind: 'ACTION' }) as ScenarioStep

test('기준이 없으면(처음 생긴 draft) 칠하지 않는다', () => {
  assert.equal(compareDraftSteps(null, [step('a')]), null)
})

test('그대로인 스텝은 칠하지 않고, 문구가 바뀐 스텝은 바뀐 것이다', () => {
  const result = compareDraftSteps([step('a'), step('b'), step('c')], [step('a'), step('B 고침'), step('c')])
  assert.deepEqual(result, { marks: ['same', 'changed', 'same'], removed: 0 })
})

test('사이에 끼운 스텝과 끝에 붙인 스텝은 새로 들어온 것이다', () => {
  const result = compareDraftSteps([step('a'), step('c')], [step('a'), step('b'), step('c'), step('d')])
  assert.deepEqual(result, { marks: ['same', 'added', 'same', 'added'], removed: 0 })
})

test('뺀 스텝은 줄이 없으니 수로 센다', () => {
  const result = compareDraftSteps([step('a'), step('b'), step('c'), step('d')], [step('a'), step('d')])
  assert.deepEqual(result, { marks: ['same', 'same'], removed: 2 })
})

test('한 자리에서 둘을 바꾸고 하나를 더하면 둘은 바뀐 것, 하나는 새것이다', () => {
  const result = compareDraftSteps(
    [step('a'), step('x'), step('y'), step('z')],
    [step('a'), step('x2'), step('y2'), step('w'), step('z')],
  )
  assert.deepEqual(result, { marks: ['same', 'changed', 'changed', 'added', 'same'], removed: 0 })
})

test('케이스를 바꿔 잡은 스텝도 바뀐 것이다', () => {
  const result = compareDraftSteps([step('a', 1)], [step('a', 2)])
  assert.deepEqual(result, { marks: ['changed'], removed: 0 })
})
