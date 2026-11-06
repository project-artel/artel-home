import assert from 'node:assert/strict'
import test from 'node:test'
import { sceneNamesOf, scenePattern, splitScenes } from './sceneHighlight'
import type { TestCase } from './testCaseTypes'

test('한글 씬 이름은 두 글자부터 강조하고, 영어는 세 글자부터다', () => {
  const pattern = scenePattern(['광장', '숲', 'UI', 'Map_scene', '광산 안'])
  assert.deepEqual(splitScenes('광장에서 광산 안으로 간다', pattern), ['', '광장', '에서 ', '광산 안', '으로 간다'])
  assert.deepEqual(splitScenes('숲으로 간다', pattern), ['숲으로 간다'])
  assert.deepEqual(splitScenes('UI 를 연다', pattern), ['UI 를 연다'])
  assert.deepEqual(splitScenes('Map_scene 에서 Map 을 본다', pattern), ['', 'Map_scene', ' 에서 Map 을 본다'])
})

test('씬 이름은 TC 의 화면과 도착 화면에서 모은다', () => {
  const cases = [
    { scene: '광장', arrivesAt: '대장간' },
    { scene: '여관', arrivesAt: null },
  ] as unknown as TestCase[]
  assert.deepEqual(sceneNamesOf(cases), ['광장', '대장간', '여관'])
})
