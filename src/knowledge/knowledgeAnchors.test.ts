/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  anchoredSceneNames,
  matchesSceneFilter,
  sceneFilterValue,
  SCENE_FILTER_ALL,
  SCENE_FILTER_GAME_WIDE,
} from './knowledgeAnchors.ts'
import type { KnowledgeAnchor, KnowledgeNode } from './knowledgeTypes.ts'

/*
 * 목록을 씬 하나로 좁히는 술어. 여기서 못 박는 것은 두 가지다. 앵커가 없는 항목은 어떤 씬을
 * 골라도 나오지 않는다는 것(게임 전체라는 말이 "모든 씬에 속한다"로 새면 필터가 아무것도
 * 걸러 내지 못한다), 그리고 그런 항목만 따로 볼 통로가 있다는 것.
 */

function node(id: string, anchors: KnowledgeAnchor[]): KnowledgeNode {
  return {
    id,
    tag: 'MISC',
    source: 'QA',
    summary: `항목 ${id}`,
    version: 1,
    createdByQaTryId: null,
    createdByQaRunId: null,
    createdAt: '2026-08-27T00:00:00Z',
    anchors,
  }
}

const gameWide = node('1', [])
const battle = node('2', [{ sceneName: 'BattleScene', screenId: '4242' }])
const shopAndBattle = node('3', [
  { sceneName: 'ShopScene', screenId: null },
  { sceneName: 'BattleScene', screenId: null },
])

test('the scene list is every anchored scene, once, in a stable order', () => {
  assert.deepEqual(anchoredSceneNames([gameWide, battle, shopAndBattle]), [
    'BattleScene',
    'ShopScene',
  ])
})

test('nothing is anchored, so there is no scene to narrow by', () => {
  assert.deepEqual(anchoredSceneNames([gameWide]), [])
})

test('every item passes the unnarrowed filter', () => {
  for (const entry of [gameWide, battle, shopAndBattle]) {
    assert.equal(matchesSceneFilter(entry, SCENE_FILTER_ALL), true)
  }
})

test('one scene keeps only the items anchored to it', () => {
  const filter = sceneFilterValue('BattleScene')

  assert.equal(matchesSceneFilter(battle, filter), true)
  assert.equal(matchesSceneFilter(shopAndBattle, filter), true, 'a second anchor still counts')
  assert.equal(matchesSceneFilter(gameWide, filter), false, 'game-wide is not every scene')
})

test('the game-wide filter keeps only items with no anchor', () => {
  assert.equal(matchesSceneFilter(gameWide, SCENE_FILTER_GAME_WIDE), true)
  assert.equal(matchesSceneFilter(battle, SCENE_FILTER_GAME_WIDE), false)
})

test('a scene named like a sentinel is still just a scene', () => {
  // 값에 접두사를 붙이는 이유. 씬 이름이 `ALL` 이어도 "전체"와 섞이지 않는다.
  const oddly = node('4', [{ sceneName: SCENE_FILTER_ALL, screenId: null }])

  assert.equal(matchesSceneFilter(oddly, sceneFilterValue(SCENE_FILTER_ALL)), true)
  assert.equal(matchesSceneFilter(gameWide, sceneFilterValue(SCENE_FILTER_ALL)), false)
})

test('a filter value this build does not recognise narrows nothing', () => {
  // 좁히지 못할 바에는 전부 보인다. 조용히 빈 목록을 보이면 사람은 항목이 사라졌다고 읽는다.
  assert.equal(matchesSceneFilter(gameWide, 'garbage'), true)
  assert.equal(matchesSceneFilter(battle, 'garbage'), true)
})
