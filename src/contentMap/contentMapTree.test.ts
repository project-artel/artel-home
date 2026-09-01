/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  ContentMapScene,
  ContentMapScreen,
  SceneTransition,
  ScreenTransition,
} from './contentMapTypes.ts'
import {
  buildContentMapTree,
  expandTreePath,
  NOTHING_EXPANDED,
  rowKey,
  toggleTreeRow,
  treeKeyCommand,
  treePathTo,
  visibleTreeRows,
} from './contentMapTree.ts'
import { indexScreenMap } from './screenInspection.ts'
import { buildScreenMap } from './screenMapLayout.ts'

/*
 * 이 모듈이 틀리면 tree 가 조용히 거짓말을 한다 — 경계를 넘는 전이가 두 씬 밑에 두 번 서거나,
 * 그림에서 고른 것이 접힌 가지 안에 숨어 아무 일도 안 일어난 것처럼 보이거나, 화살표가 접힌 줄의
 * 자식으로 내려간다. 어느 것도 렌더를 봐서는 잡히지 않는다.
 */

function screen(id: string, sceneId: string, over: Partial<ContentMapScreen> = {}): ContentMapScreen {
  return {
    id,
    sceneId,
    name: null,
    discriminator: `[{"selector":"Canvas/${id}","active":true}]`,
    observedCount: 3,
    firstSeenQaRunId: null,
    image: null,
    ...over,
  }
}

function scene(id: string, name: string, screens: ContentMapScreen[] = []): ContentMapScene {
  return {
    id,
    name,
    walked: true,
    capabilities: { total: 0, runnable: 0, needsProbe: 0, notAStep: 0, unreachablePrecondition: 0 },
    steps: null,
    thumbnail: null,
    screens,
    capabilityList: [],
  }
}

function transition(
  id: string,
  fromScreenId: string,
  toScreenId: string,
  over: Partial<ScreenTransition> = {},
): ScreenTransition {
  return {
    id,
    fromScreenId,
    toScreenId,
    capabilityId: null,
    capabilitySummary: null,
    kind: 'action',
    crossesScene: false,
    observedCount: 1,
    firstSeenQaRunId: null,
    ...over,
  }
}

function edge(fromSceneId: string, toSceneId: string, over: Partial<SceneTransition> = {}): SceneTransition {
  return {
    fromSceneId,
    toSceneName: `scene ${toSceneId}`,
    toSceneId,
    capabilityId: null,
    source: 'static',
    verifiedAt: null,
    given: null,
    ...over,
  }
}

/** 씬 둘, 화면 셋, 경계를 넘는 전이 하나, 씬 전이 하나. */
function sample() {
  const battle = scene('1', 'TurnBattleScene', [screen('10', '1'), screen('11', '1')])
  const map = scene('2', 'Map_scene', [screen('20', '2')])
  const model = buildScreenMap(
    [battle, map],
    [edge('1', '2')],
    [
      transition('t1', '10', '11'),
      transition('t2', '11', '20', { crossesScene: true }),
    ],
  )
  const index = indexScreenMap(model)
  return {
    index,
    model,
    tree: buildContentMapTree(model, index),
    keys: {
      battle: rowKey({ kind: 'scene', id: 'scene:1' }),
      map: rowKey({ kind: 'scene', id: 'scene:2' }),
      ten: rowKey({ kind: 'screen', id: '10' }),
      eleven: rowKey({ kind: 'screen', id: '11' }),
      twenty: rowKey({ kind: 'screen', id: '20' }),
      sceneEdge: rowKey({ kind: 'sceneEdge', id: model.sceneEdges[0].id }),
      inside: rowKey({ kind: 'screenTransition', id: 'screenTransition:t1' }),
      crossing: rowKey({ kind: 'screenTransition', id: 'screenTransition:t2' }),
    },
  }
}

test('전이는 씬과 화면 밑으로 들어가고, 경계를 넘어도 출발 화면 밑에만 선다', () => {
  const { tree } = sample()

  const battle = tree.scenes.find((node) => node.container.node.name === 'TurnBattleScene')
  const map = tree.scenes.find((node) => node.container.node.name === 'Map_scene')
  assert.ok(battle !== undefined && map !== undefined)

  assert.deepEqual(
    battle.screens.map((node) => node.screen.id),
    ['10', '11'],
  )
  assert.deepEqual(battle.sceneEdges.length, 1)

  // 경계를 넘는 전이는 출발 화면(11) 밑에 한 번. 도착 씬(Map_scene) 밑에는 없다 —
  // 두 곳에 놓으면 전이 하나가 둘로 읽힌다.
  const eleven = battle.screens.find((node) => node.screen.id === '11')
  assert.ok(eleven !== undefined)
  assert.equal(eleven.transitions.length, 1)
  assert.equal(eleven.transitions[0].placed.transition.toScreenId, '20')
  assert.equal(eleven.transitions[0].crossesTo?.node.name, 'Map_scene')

  assert.deepEqual(
    map.screens.flatMap((node) => node.transitions),
    [],
  )
})

test('경계를 넘지 않는 전이에는 도착 씬을 달지 않는다', () => {
  const { tree } = sample()
  const battle = tree.scenes.find((node) => node.container.node.name === 'TurnBattleScene')
  const ten = battle?.screens.find((node) => node.screen.id === '10')

  // 모든 줄이 씬 이름을 달면 정작 경계를 넘는 줄이 눈에 띄지 않는다.
  assert.equal(ten?.transitions[0].crossesTo, null)
})

test('접힌 씬은 그 안의 화면을 목록에 내지 않는다', () => {
  const { keys, tree } = sample()

  const collapsed = visibleTreeRows(tree, NOTHING_EXPANDED)
  assert.deepEqual(
    collapsed.map((row) => row.kind),
    ['scene', 'scene'],
  )
  assert.deepEqual(
    collapsed.map((row) => row.expandable),
    [true, true],
  )

  const opened = visibleTreeRows(tree, new Set([keys.battle]))
  assert.deepEqual(
    opened.map((row) => row.key),
    [keys.battle, keys.ten, keys.eleven, keys.sceneEdge, keys.map],
  )
})

test('화면을 펼치면 그 화면에서 나가는 전이가 한 단계 더 들어간다', () => {
  const { keys, tree } = sample()
  const expanded = new Set([keys.battle, keys.ten])

  const rows = visibleTreeRows(tree, expanded)
  const levels = rows.map((row) => [row.kind, row.level] as const)

  assert.deepEqual(levels, [
    ['scene', 1],
    ['screen', 2],
    ['screenTransition', 3],
    ['screen', 2],
    ['sceneEdge', 2],
    ['scene', 1],
  ])
})

test('형제 수를 줄마다 들려 보낸다 — 평평한 목록이라 스크린 리더가 셀 수 없다', () => {
  const { keys, tree } = sample()
  const rows = visibleTreeRows(tree, new Set([keys.battle]))

  const battleChildren = rows.filter((row) => row.level === 2)
  // 화면 둘과 씬 전이 하나가 한 씬의 자식 셋이다. 화면만 세면 씬 전이가 목록 밖의 것처럼 읽힌다.
  assert.deepEqual(
    battleChildren.map((row) => [row.position, row.setSize]),
    [
      [1, 3],
      [2, 3],
      [3, 3],
    ],
  )
})

test('전이가 없는 화면은 펼칠 수 없다', () => {
  const { keys, tree } = sample()
  const rows = visibleTreeRows(tree, new Set([keys.map]))
  const twenty = rows.find((row) => row.kind === 'screen' && row.id === '20')

  assert.equal(twenty?.expandable, false)
})

test('그림에서 고른 것이 어느 가지 안에 있는지 말한다', () => {
  const { index, keys, model } = sample()

  // 씬은 언제나 맨 위에 있다. 펼칠 것이 없다.
  assert.deepEqual(treePathTo(index, { kind: 'scene', id: 'scene:1' }), [])
  assert.deepEqual(treePathTo(index, { kind: 'screen', id: '11' }), [keys.battle])
  assert.deepEqual(treePathTo(index, { kind: 'sceneEdge', id: model.sceneEdges[0].id }), [
    keys.battle,
  ])
  // 화면 전이는 두 단계 안에 있다. 씬만 펼치면 그 줄은 여전히 안 보인다.
  assert.deepEqual(treePathTo(index, { kind: 'screenTransition', id: 'screenTransition:t2' }), [
    keys.battle,
    keys.eleven,
  ])
})

test('그림에 없는 것을 고르면 펼칠 가지도 없다', () => {
  const { index } = sample()
  assert.deepEqual(treePathTo(index, { kind: 'screen', id: '999' }), [])
  assert.deepEqual(treePathTo(index, { kind: 'screenTransition', id: '999' }), [])
  assert.deepEqual(treePathTo(index, { kind: 'sceneEdge', id: '999' }), [])
})

test('이미 펼쳐진 경로는 같은 집합을 그대로 돌려준다', () => {
  const expanded: ReadonlySet<string> = new Set(['a', 'b'])

  // 같은 참조여야 한다. 매번 새 Set 이면 이것을 보는 effect 가 스스로를 다시 부른다.
  assert.equal(expandTreePath(expanded, ['a']), expanded)
  assert.notEqual(expandTreePath(expanded, ['c']), expanded)
})

test('펼치는 것은 더하기만 한다 — 열어 둔 다른 씬을 접지 않는다', () => {
  const expanded = expandTreePath(new Set(['b']), ['a', 'c'])
  assert.deepEqual([...expanded].sort(), ['a', 'b', 'c'])
})

test('같은 줄을 다시 누르면 접힌다', () => {
  const opened = toggleTreeRow(NOTHING_EXPANDED, 'a')
  assert.deepEqual([...opened], ['a'])
  assert.deepEqual([...toggleTreeRow(opened, 'a')], [])
})

test('오른쪽 화살표는 접힌 줄에서는 펼치고 펼쳐진 줄에서는 첫 자식으로 내려간다', () => {
  const { keys, tree } = sample()

  const collapsed = visibleTreeRows(tree, NOTHING_EXPANDED)
  assert.deepEqual(treeKeyCommand(collapsed, keys.battle, 'ArrowRight'), {
    action: 'expand',
    key: keys.battle,
  })

  const opened = visibleTreeRows(tree, new Set([keys.battle]))
  assert.deepEqual(treeKeyCommand(opened, keys.battle, 'ArrowRight'), {
    action: 'focus',
    key: keys.ten,
  })

  // 펼칠 것이 없는 줄에서는 아무 일도 하지 않는다. 다음 줄로 넘어가면 오른쪽 화살표가
  // 아래쪽 화살표가 되어 버린다.
  assert.equal(treeKeyCommand(opened, keys.sceneEdge, 'ArrowRight'), null)
})

test('왼쪽 화살표는 펼쳐진 줄을 접고, 접힌 줄에서는 부모로 올라간다', () => {
  const { keys, tree } = sample()
  const opened = visibleTreeRows(tree, new Set([keys.battle, keys.ten]))

  assert.deepEqual(treeKeyCommand(opened, keys.battle, 'ArrowLeft'), {
    action: 'collapse',
    key: keys.battle,
  })
  assert.deepEqual(treeKeyCommand(opened, keys.eleven, 'ArrowLeft'), {
    action: 'focus',
    key: keys.battle,
  })
  // 화면 전이의 부모는 그 위의 씬이 아니라 화면이다.
  assert.deepEqual(treeKeyCommand(opened, keys.inside, 'ArrowLeft'), {
    action: 'focus',
    key: keys.ten,
  })
  assert.equal(treeKeyCommand(opened, keys.map, 'ArrowLeft'), null)
})

test('위아래와 Home·End 는 보이는 줄만 돈다', () => {
  const { keys, tree } = sample()
  const rows = visibleTreeRows(tree, new Set([keys.battle]))

  assert.deepEqual(treeKeyCommand(rows, keys.battle, 'ArrowDown'), {
    action: 'focus',
    key: keys.ten,
  })
  assert.equal(treeKeyCommand(rows, keys.map, 'ArrowDown'), null)
  assert.equal(treeKeyCommand(rows, keys.battle, 'ArrowUp'), null)
  assert.deepEqual(treeKeyCommand(rows, keys.map, 'Home'), { action: 'focus', key: keys.battle })
  assert.deepEqual(treeKeyCommand(rows, keys.battle, 'End'), { action: 'focus', key: keys.map })
})

test('포커스가 아직 없으면 첫 줄부터 시작한다', () => {
  const { keys, tree } = sample()
  const rows = visibleTreeRows(tree, NOTHING_EXPANDED)

  // 아무 일도 안 일어나면 사용자는 tree 가 키보드를 안 받는다고 읽는다.
  assert.deepEqual(treeKeyCommand(rows, null, 'ArrowDown'), { action: 'focus', key: keys.battle })
})

test('Enter 와 Space 는 고른다', () => {
  const { keys, tree } = sample()
  const rows = visibleTreeRows(tree, new Set([keys.battle]))

  assert.deepEqual(treeKeyCommand(rows, keys.ten, 'Enter'), { action: 'select', key: keys.ten })
  assert.deepEqual(treeKeyCommand(rows, keys.ten, ' '), { action: 'select', key: keys.ten })
  assert.equal(treeKeyCommand(rows, keys.ten, 'Escape'), null)
})
