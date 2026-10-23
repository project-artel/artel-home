import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmptyStep, type ScenarioDraft } from '../../testScenarios/scenarioTypes'
import { buildMapScenario, previewScenario, sceneSegments } from './runMapModel'

const draft = (steps: Partial<ReturnType<typeof createEmptyStep>>[]): ScenarioDraft => ({
  title: 'T', description: '', execution_mode: 'ORDERED', steps: steps.map((s) => ({ ...createEmptyStep(), ...s })),
})

test('TC numbers follow consecutive case ids like the editor', () => {
  const scenes: Record<number, string> = { 1: 'TitleScene', 2: 'Map_scene' }
  const map = buildMapScenario('7', draft([{ action: '부팅', case_id: null }, { action: 'a', case_id: 1 }, { action: 'b', case_id: 1 }, { action: 'c', case_id: 2 }, { action: 'd', case_id: 1 }]), (id) => scenes[id] ?? null)
  assert.deepEqual(map.steps.map((s) => s.tc), [null, 1, 1, 2, 3])
  assert.deepEqual(map.steps.map((s) => s.tcStart), [false, true, false, true, true])
  assert.equal(map.tcCount, 3)
  assert.equal(map.steps[1].scene, 'TitleScene')
})

test('a gap is counted and has no target', () => {
  const map = buildMapScenario('1', draft([{ action: '경로 모름', step_kind: 'GAP' }]), () => null)
  assert.equal(map.gapCount, 1)
  assert.equal(map.steps[0].verb, 'gap')
  assert.equal(map.steps[0].target, '')
})

test('steps with no scene join the segment before them', () => {
  assert.deepEqual(
    sceneSegments([{ scene: null }, { scene: 'A' }, { scene: null }, { scene: 'A' }, { scene: 'B' }, { scene: null }]),
    [{ scene: 'A', from: 0, to: 3 }, { scene: 'B', from: 4, to: 5 }],
  )
  assert.deepEqual(sceneSegments([{ scene: null }, { scene: null }]), [{ scene: null, from: 0, to: 1 }])
  assert.deepEqual(sceneSegments([]), [])
})

test('while dragging, the frame closes the gap it left and opens one where the steps will land', () => {
  const draft = { title: 'T', description: '', execution_mode: 'ORDERED' as const, steps: ['a', 'b', 'c', 'd'].map((action) => ({ ...createEmptyStep(), action })) }
  const s = buildMapScenario('1', draft, () => null)
  const moved = previewScenario(s, { remove: { start: 0, end: 0 }, insert: { before: 3, steps: [s.steps[0]] } })
  assert.deepEqual(moved.steps.map((step) => (step.slot ? 'slot' : step.action)), ['b', 'c', 'slot', 'd'])
  assert.deepEqual(moved.steps.map((step) => step.key), ['1', '2', 'slot0', '3'])
  const left = previewScenario(s, { remove: { start: 1, end: 2 } })
  assert.deepEqual(left.steps.map((step) => step.action), ['a', 'd'])
})
