import assert from 'node:assert/strict'
import test from 'node:test'
import { SCENE_FILTER_ALL, SCENE_FILTER_GAME_WIDE, sceneFilterValue } from './knowledgeAnchors'
import { degreesOf, exploreKnowledge, type ExplorerQuery } from './knowledgeGrouping'
import type { KnowledgeEdge, KnowledgeNode } from './knowledgeTypes'

function node(id: string, tag: string, source: string, summary: string, createdAt: string, scenes: string[] = []): KnowledgeNode {
  return {
    id,
    tag,
    source,
    summary,
    version: 1,
    createdByQaTryId: null,
    createdByQaRunId: null,
    createdAt,
    anchors: scenes.map((sceneName) => ({ sceneName, screenId: null })),
  }
}

// 문서 하나(36)에 항목 셋, 따로 이어진 두 항목, 연결 없는 관측 하나.
const nodes = [
  node('36', 'MISC', 'DOCS', '기획서.pdf', '2026-10-01T00:00:00Z'),
  node('27', 'RULE', 'DOCS', '응시 자격', '2026-10-02T00:00:00Z'),
  node('28', 'RULE', 'DOCS', '입실 및 퇴실', '2026-10-03T00:00:00Z', ['Title']),
  node('32', 'CONTROL', 'DOCS', '당일 응시', '2026-10-04T00:00:00Z'),
  node('40', 'INFO', 'QA', 'HP 가 0 이면 게임 오버', '2026-10-05T00:00:00Z', ['Battle', 'Title']),
  node('41', 'RULE', 'QA', '보스는 3페이즈', '2026-10-06T00:00:00Z', ['Battle']),
  node('2', 'RULE', 'QA', '카드 놓는 자리', '2026-09-15T00:00:00Z'),
]
const edges: KnowledgeEdge[] = [
  { from: '27', to: '36', relation: 'PART_OF', note: null },
  { from: '28', to: '36', relation: 'PART_OF', note: null },
  { from: '32', to: '36', relation: 'PART_OF', note: null },
  { from: '40', to: '41', relation: 'LEADS_TO', note: '죽으면 보스전이 끝난다' },
]
const titleOf = (n: KnowledgeNode) => n.summary
const base: ExplorerQuery = { mode: 'document', sort: 'degree', tags: new Set(), text: '', sceneFilter: SCENE_FILTER_ALL }

test('degreesOf: 닿은 관계 수를 센다', () => {
  const degree = degreesOf(nodes, edges)
  assert.equal(degree.get('36'), 3)
  assert.equal(degree.get('40'), 1)
  assert.equal(degree.get('2'), 0)
})

test('문서로 묶으면 문서 노드가 자기 묶음 맨 앞이고, 관측 · 문서 없음이 따로 선다', () => {
  const result = exploreKnowledge(nodes, edges, { ...base, sort: 'name' }, titleOf)
  assert.deepEqual(result.groups.map((g) => g.kind), ['document', 'observed'])
  assert.equal(result.groups[0].nodeId, '36')
  assert.deepEqual(result.groups[0].items.map((i) => i.node.id), ['36', '32', '27', '28'])
  assert.deepEqual(result.groups[1].items.map((i) => i.node.id), ['40', '41', '2'])
})

test('종류로 묶으면 많은 종류가 위다', () => {
  const result = exploreKnowledge(nodes, edges, { ...base, mode: 'tag' }, titleOf)
  assert.equal(result.groups[0].name, 'RULE')
  assert.equal(result.groups[0].items.length, 4)
  assert.equal(result.tagCounts.get('RULE'), 4)
})

test('씬으로 묶으면 여러 씬에 걸린 항목은 씬마다 보이고 걸린 데 없는 것은 게임 전체로 간다', () => {
  const result = exploreKnowledge(nodes, edges, { ...base, mode: 'scene' }, titleOf)
  assert.deepEqual(result.groups.map((g) => g.name || g.kind), ['Battle', 'Title', 'gameWide'])
  assert.deepEqual(result.groups[0].items.map((i) => i.node.id).sort(), ['40', '41'])
  assert.deepEqual(result.groups[1].items.map((i) => i.node.id).sort(), ['28', '40'])
  assert.equal(result.groups[2].items.length, 4)
  assert.equal(result.shown, 7)
})

test('찾기 · 종류 · 씬 거르기는 함께 걸리고, 남은 것이 없는 묶음은 빠진다', () => {
  assert.equal(exploreKnowledge(nodes, edges, { ...base, text: '보스' }, titleOf).shown, 1)
  const ruleOnly = exploreKnowledge(nodes, edges, { ...base, tags: new Set(['CONTROL']) }, titleOf)
  assert.deepEqual(ruleOnly.groups.map((g) => g.items.map((i) => i.node.id)), [['32']])
  assert.equal(exploreKnowledge(nodes, edges, { ...base, sceneFilter: sceneFilterValue('Battle') }, titleOf).shown, 2)
  assert.equal(exploreKnowledge(nodes, edges, { ...base, sceneFilter: SCENE_FILTER_GAME_WIDE }, titleOf).shown, 4)
})

test('정렬: 연결 많은 순 · 최근 순', () => {
  const byDegree = exploreKnowledge(nodes, edges, { ...base, mode: 'tag', sort: 'degree' }, titleOf)
  assert.equal(byDegree.groups[0].items[0].degree, 1)
  const recent = exploreKnowledge(nodes, edges, { ...base, mode: 'tag', sort: 'recent' }, titleOf)
  assert.equal(recent.groups[0].items[0].node.id, '41')
})
