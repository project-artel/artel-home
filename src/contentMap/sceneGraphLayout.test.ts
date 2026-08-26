/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NODE_RADIUS } from '../knowledge/knowledgeLayout.ts'
import type { ContentMapScene, SceneTransition } from './contentMapTypes.ts'
import {
  buildSceneGraph,
  incidenceByNode,
  layoutSceneGraph,
} from './sceneGraphLayout.ts'

/*
 * 이 모듈이 틀리면 아무것도 던지지 않는다. 전이 하나가 조용히 사라지거나,
 * 두 전이가 같은 곡선 위에 겹쳐 그려져 하나로 보인다. 화면을 봐서는 알 수
 * 없는 경우들만 여기서 잡는다: 이름만 아는 목적지, 응답에서 빠진 씬,
 * 자기 자신으로 가는 전이, 같은 쌍의 전이 여러 개, 그리고 빈 그래프.
 */

function scene(id: string, name: string, over: Partial<ContentMapScene> = {}): ContentMapScene {
  return {
    id,
    name,
    walked: false,
    capabilities: {
      total: 0,
      runnable: 0,
      needsProbe: 0,
      notAStep: 0,
      unreachablePrecondition: 0,
    },
    steps: null,
    thumbnail: null,
    ...over,
  }
}

function transition(
  fromSceneId: string,
  to: { id?: string | null; name?: string },
  over: Partial<SceneTransition> = {},
): SceneTransition {
  return {
    fromSceneId,
    toSceneName: to.name ?? '',
    toSceneId: to.id ?? null,
    capabilityId: null,
    source: 'static',
    verifiedAt: null,
    given: null,
    ...over,
  }
}

test('씬만 있고 전이가 없으면 씬 수만큼 노드가 서로 다른 자리에 놓인다', () => {
  const model = buildSceneGraph([scene('1', 'Title'), scene('2', 'Lobby')], [])
  const layout = layoutSceneGraph(model)

  assert.equal(model.nodes.length, 2)
  assert.equal(model.unmappedScenes, 0)
  assert.equal(layout.edges.length, 0)

  const points = new Set(layout.nodes.map((placed) => `${placed.x},${placed.y}`))
  assert.equal(points.size, 2, '연결이 없는 씬끼리 겹쳐 놓이면 안 된다')
})

test('빈 콘텐츠 맵도 그릴 수 있는 뷰 박스를 낸다', () => {
  const layout = layoutSceneGraph(buildSceneGraph([], []))

  assert.deepEqual(layout.nodes, [])
  assert.deepEqual(layout.edges, [])
  assert.ok(layout.width > 0)
  assert.ok(layout.height > 0)
  assert.notEqual(layout.viewBox, '0 0 0 0')
})

test('toSceneId 가 있으면 그 씬으로 이어진다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [transition('1', { id: '2', name: 'Lobby' })],
  )

  assert.equal(model.nodes.length, 2)
  assert.equal(model.unmappedScenes, 0)
  assert.deepEqual(
    model.edges.map((edge) => [edge.from, edge.to]),
    [['scene:1', 'scene:2']],
  )
})

test('toSceneId 가 없으면 이름으로 씬을 찾는다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [transition('1', { name: 'Lobby' })],
  )

  assert.equal(model.nodes.length, 2, '이름이 맞는 씬이 있으면 자리표시를 만들지 않는다')
  assert.equal(model.unmappedScenes, 0)
  assert.equal(model.edges[0].to, 'scene:2')
})

test('이름만 아는 목적지는 자리표시 노드가 되고, 전이는 살아남는다', () => {
  const model = buildSceneGraph([scene('1', 'Title')], [transition('1', { name: 'Shop' })])

  assert.equal(model.edges.length, 1, '목적지를 모른다고 전이를 지우면 화면이 거짓말을 한다')
  assert.equal(model.unmappedScenes, 1)

  const placed = model.nodes.find((node) => node.id === 'name:Shop')
  assert.notEqual(placed, undefined)
  assert.equal(placed?.scene, null)
  assert.equal(placed?.name, 'Shop')
  assert.equal(placed?.missingFromResponse, false)
})

test('같은 이름을 가리키는 전이 여럿은 자리표시 하나를 함께 쓴다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [transition('1', { name: 'Shop' }), transition('2', { name: 'Shop' })],
  )

  assert.equal(model.unmappedScenes, 1)
  assert.equal(model.nodes.filter((node) => node.id === 'name:Shop').length, 1)
})

test('id 는 아는데 응답에 없는 씬은 이름만 아는 목적지와 구분된다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title')],
    [transition('1', { id: '9', name: 'Boss' })],
  )

  const placed = model.nodes.find((node) => node.id === 'scene:9')
  assert.equal(placed?.missingFromResponse, true, '서버가 씬 하나를 빼먹었다는 사실은 다른 사실이다')
  assert.equal(placed?.scene, null)
})

test('응답에 없는 씬의 이름은 전이 순서와 무관하게 채워진다', () => {
  // 출발 씬 자리표시는 이름 없이 먼저 생긴다. 같은 씬을 이름과 함께
  // 가리키는 전이가 나중에 오는 경우에도 그 이름이 남아야 한다 — 아니면
  // 같은 응답이 전이 순서에 따라 다른 그림이 된다.
  const incoming = transition('99', { id: '1' })
  const outgoing = transition('1', { id: '99', name: 'Boss' })

  const sourceFirst = buildSceneGraph([scene('1', 'Title')], [incoming, outgoing])
  const namedFirst = buildSceneGraph([scene('1', 'Title')], [outgoing, incoming])

  assert.equal(sourceFirst.nodes.find((node) => node.id === 'scene:99')?.name, 'Boss')
  assert.equal(namedFirst.nodes.find((node) => node.id === 'scene:99')?.name, 'Boss')
  assert.equal(sourceFirst.unmappedScenes, 1)
  assert.equal(namedFirst.unmappedScenes, sourceFirst.unmappedScenes)
})

test('출발 씬이 응답에 없어도 전이는 그려진다', () => {
  const model = buildSceneGraph([scene('2', 'Lobby')], [transition('7', { id: '2' })])

  assert.equal(model.edges.length, 1)
  assert.equal(model.edges[0].from, 'scene:7')
  assert.equal(model.nodes.find((node) => node.id === 'scene:7')?.missingFromResponse, true)
})

test('이름도 id 도 없는 목적지는 하나의 미상 노드로 모인다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [transition('1', {}), transition('2', {})],
  )

  assert.equal(model.edges.length, 2)
  assert.equal(model.unmappedScenes, 1)
  assert.deepEqual(new Set(model.edges.map((edge) => edge.to)), new Set(['name:']))
})

test('씬 이름이 겹치면 첫 번째 씬이 결정적으로 선택된다', () => {
  const first = buildSceneGraph(
    [scene('1', 'Lobby'), scene('2', 'Lobby'), scene('3', 'Title')],
    [transition('3', { name: 'Lobby' })],
  )
  const second = buildSceneGraph(
    [scene('1', 'Lobby'), scene('2', 'Lobby'), scene('3', 'Title')],
    [transition('3', { name: 'Lobby' })],
  )

  assert.equal(first.edges[0].to, 'scene:1')
  assert.equal(second.edges[0].to, first.edges[0].to)
})

test('자기 자신으로 가는 전이는 길이 0 짜리 선이 아니라 고리로 그려진다', () => {
  const model = buildSceneGraph([scene('1', 'Battle')], [transition('1', { id: '1' })])
  const layout = layoutSceneGraph(model)

  assert.equal(layout.edges.length, 1)
  assert.equal(layout.edges[0].selfEdge, true)
  assert.match(layout.edges[0].path, /^M [-\d.]+ [-\d.]+ A /)
  assert.ok(!layout.edges[0].path.includes('NaN'))
  assert.ok(layout.edges[0].midY < layout.nodes[0].y - NODE_RADIUS)
})

test('같은 씬으로 가는 전이 여럿은 서로 다른 곡선으로 벌어진다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [
      transition('1', { id: '2' }, { source: 'static' }),
      transition('1', { id: '2' }, { source: 'runtime' }),
      transition('1', { id: '2' }, { source: 'inferred' }),
    ],
  )
  const layout = layoutSceneGraph(model)

  assert.equal(new Set(layout.edges.map((edge) => edge.path)).size, 3)
  assert.equal(new Set(layout.edges.map((edge) => `${edge.midX},${edge.midY}`)).size, 3)
})

test('서로 반대 방향인 두 전이가 한 곡선으로 겹치지 않는다', () => {
  const model = buildSceneGraph(
    [scene('1', 'Title'), scene('2', 'Lobby')],
    [transition('1', { id: '2' }), transition('2', { id: '1' })],
  )
  const layout = layoutSceneGraph(model)

  assert.equal(layout.edges.length, 2)
  assert.notEqual(layout.edges[0].path, layout.edges[1].path)
})

test('모르는 source 도 아는 것과 똑같이 배치되고, 스타일만 갈린다', () => {
  const known = buildSceneGraph(
    [scene('1', 'A'), scene('2', 'B')],
    [transition('1', { id: '2' }, { source: 'runtime' })],
  )
  const unknown = buildSceneGraph(
    [scene('1', 'A'), scene('2', 'B')],
    [transition('1', { id: '2' }, { source: 'PROPHECY' })],
  )

  assert.equal(known.edges[0].style, 'runtime')
  assert.equal(unknown.edges[0].style, 'unknown')
  assert.equal(
    layoutSceneGraph(unknown).edges[0].path,
    layoutSceneGraph(known).edges[0].path,
    '배치는 source 어휘에 대해 의견이 없어야 한다',
  )
})

test('모든 노드가 뷰 박스 안에 들어온다', () => {
  const scenes = Array.from({ length: 24 }, (_, index) => scene(String(index + 1), `S${index + 1}`))
  const transitions = scenes
    .slice(1)
    .map((target, index) => transition(scenes[index].id, { id: target.id }))
  const layout = layoutSceneGraph(buildSceneGraph(scenes, transitions))

  const [x, y, width, height] = layout.viewBox.split(' ').map(Number)
  for (const placed of layout.nodes) {
    assert.ok(placed.x >= x && placed.x <= x + width, `${placed.node.id} 가 가로로 벗어났다`)
    assert.ok(placed.y >= y && placed.y <= y + height, `${placed.node.id} 가 세로로 벗어났다`)
  }
})

test('같은 응답은 언제나 같은 그림이 된다', () => {
  const scenes = [scene('1', 'A'), scene('2', 'B'), scene('3', 'C')]
  const transitions = [
    transition('1', { id: '2' }),
    transition('2', { id: '3' }),
    transition('3', { id: '1' }),
  ]

  const first = layoutSceneGraph(buildSceneGraph(scenes, transitions))
  const second = layoutSceneGraph(buildSceneGraph(scenes, transitions))

  assert.deepEqual(second.nodes, first.nodes)
  assert.deepEqual(second.edges, first.edges)
  assert.equal(second.viewBox, first.viewBox)
})

test('인접 목록은 양방향을 풀어 주고 자기 전이를 한 번만 센다', () => {
  const model = buildSceneGraph(
    [scene('1', 'A'), scene('2', 'B'), scene('3', 'C')],
    [
      transition('1', { id: '2' }),
      transition('3', { id: '1' }),
      transition('1', { id: '1' }),
    ],
  )

  const grouped = incidenceByNode(model)
  assert.deepEqual(
    (grouped.get('scene:1') ?? []).map(({ direction, other }) => [direction, other.id]),
    [
      ['out', 'scene:2'],
      ['in', 'scene:3'],
      ['self', 'scene:1'],
    ],
  )
  assert.deepEqual(
    (grouped.get('scene:2') ?? []).map(({ direction }) => direction),
    ['in'],
  )
})
