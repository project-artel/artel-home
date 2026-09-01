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
  buildScreenMap,
  CONTAINER_HEADER,
  layoutScreenMap,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  type PlacedContainer,
} from './screenMapLayout.ts'

/*
 * 이 모듈이 틀리면 아무것도 던지지 않는다. 화면 하나가 컨테이너 밖으로 삐져나가거나, 두 전이가
 * 같은 곡선에 겹쳐 하나로 보이거나, 같은 빌드가 새로고침마다 다른 그림이 된다. 화면을 봐서는
 * 알 수 없는 것들만 여기서 잡는다.
 */

function screen(id: string, sceneId: string, over: Partial<ContentMapScreen> = {}): ContentMapScreen {
  return {
    id,
    sceneId,
    name: `화면 ${id}`,
    discriminator: `[{"selector":"Canvas/${id}","active":true}]`,
    observedCount: 1,
    firstSeenQaRunId: null,
    ...over,
  }
}

function scene(id: string, name: string, screens: ContentMapScreen[] = []): ContentMapScene {
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
    screens,
  }
}

function edge(
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

/** 화면이 컨테이너 안에 온전히 들어 있나. 이 그림의 전제 그 자체다. */
function contains(container: PlacedContainer, index: number): boolean {
  const inner = container.screens[index]
  return (
    inner.x >= container.x &&
    inner.y >= container.y + CONTAINER_HEADER &&
    inner.x + inner.width <= container.x + container.width &&
    inner.y + inner.height <= container.y + container.height
  )
}

test('빈 콘텐츠 맵도 그릴 수 있는 뷰 박스를 낸다', () => {
  const layout = layoutScreenMap(buildScreenMap([], [], []))

  assert.deepEqual(layout.containers, [])
  assert.deepEqual(layout.sceneEdges, [])
  assert.deepEqual(layout.screenTransitions, [])
  assert.equal(layout.layerCount, 0)
  // 크기 0 인 뷰 박스는 브라우저가 아무것도 전체로 확대하게 만든다.
  assert.ok(layout.width > 0)
  assert.ok(layout.height > 0)
  assert.notEqual(layout.viewBox, '0 0 0 0')
})

test('화면이 0 행인 빌드는 씬 컨테이너만 그려진다', () => {
  const model = buildScreenMap([scene('1', 'TitleScene'), scene('2', 'Map_scene')], [], [])
  const layout = layoutScreenMap(model)

  assert.equal(model.screenCount, 0)
  assert.equal(layout.containers.length, 2)
  assert.deepEqual(layout.screenTransitions, [])
  // 화면이 없어도 컨테이너는 몸통을 갖는다. 머리글만 남으면 빈 씬이 씬 카드와 구별되지 않는다.
  for (const container of layout.containers) {
    assert.deepEqual(container.screens, [])
    assert.ok(container.height > CONTAINER_HEADER, '빈 씬도 몸통이 남아야 한다')
    assert.ok(container.width >= SCREEN_WIDTH)
  }
})

test('한 씬의 화면 여럿이 그 씬의 컨테이너 안에 놓인다', () => {
  const screens = ['10', '11', '12', '13', '14'].map((id) => screen(id, '1'))
  const layout = layoutScreenMap(buildScreenMap([scene('1', 'TitleScene', screens)], [], []))

  const container = layout.containers[0]
  assert.equal(container.screens.length, 5)
  container.screens.forEach((_, index) => {
    assert.ok(contains(container, index), `화면 ${index} 가 컨테이너 밖으로 나갔다`)
  })

  // 격자가 겹치지 않는다. 겹치면 화면 두 개가 하나로 보인다.
  for (let left = 0; left < container.screens.length; left += 1) {
    for (let right = left + 1; right < container.screens.length; right += 1) {
      const a = container.screens[left]
      const b = container.screens[right]
      const apart =
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      assert.ok(apart, `화면 ${left} 와 ${right} 가 겹쳤다`)
    }
  }
})

test('컨테이너는 안에 든 화면 수만큼 커진다 — 안쪽을 먼저 재기 때문이다', () => {
  const one = layoutScreenMap(buildScreenMap([scene('1', 'A', [screen('10', '1')])], [], []))
  const many = layoutScreenMap(
    buildScreenMap([scene('1', 'A', ['10', '11', '12', '13'].map((id) => screen(id, '1')))], [], []),
  )

  assert.ok(
    many.containers[0].height > one.containers[0].height,
    '화면이 늘면 컨테이너 높이가 자라야 한다',
  )
  assert.ok(many.containers[0].width > one.containers[0].width)
})

test('화면 순서는 응답 배열 순서가 아니라 id 에서 나온다', () => {
  const ids = ['2', '10', '1']
  const forward = layoutScreenMap(
    buildScreenMap([scene('1', 'A', ids.map((id) => screen(id, '1')))], [], []),
  )
  const reversed = layoutScreenMap(
    buildScreenMap([scene('1', 'A', [...ids].reverse().map((id) => screen(id, '1')))], [], []),
  )

  const order = forward.containers[0].screens.map((placed) => placed.screen.id)
  // 숫자로 읽히는 id 는 숫자로 정렬한다. 문자열로만 비교하면 10 이 2 앞에 선다.
  assert.deepEqual(order, ['1', '2', '10'])
  assert.deepEqual(reversed.containers[0].screens.map((placed) => placed.screen.id), order)
})

test('같은 데이터를 두 번 배치하면 같은 좌표가 나온다', () => {
  const scenes = [
    scene('1', 'TitleScene', [screen('10', '1'), screen('11', '1')]),
    scene('2', 'Map_scene', [screen('12', '2')]),
    scene('3', 'BattleScene'),
  ]
  const edges = [
    edge('1', { id: '2', name: 'Map_scene' }, { verifiedAt: '2026-08-27T00:00:00Z' }),
    edge('2', { id: '3', name: 'BattleScene' }),
    edge('3', { name: 'CreditScene' }),
  ]
  const transitions = [
    transition('20', '10', '11', { kind: 'state' }),
    transition('21', '10', '12', { crossesScene: true }),
  ]

  const first = layoutScreenMap(buildScreenMap(scenes, edges, transitions))
  const second = layoutScreenMap(buildScreenMap(scenes, edges, transitions))
  assert.deepEqual(second, first)

  // 응답이 다른 순서로 와도 같은 그림이어야 두 빌드를 나란히 비교할 수 있다. 씬 순서는 서버가
  // 이름 오름차순으로 정한다고 했으므로 여기서 흔드는 것은 전이 두 목록이다.
  const shuffled = layoutScreenMap(
    buildScreenMap(scenes, [...edges].reverse(), [...transitions].reverse()),
  )
  assert.deepEqual(shuffled.containers, first.containers)
  assert.deepEqual(
    shuffled.sceneEdges.map((placed) => [placed.id, placed.path]),
    first.sceneEdges.map((placed) => [placed.id, placed.path]),
  )
  assert.deepEqual(
    shuffled.screenTransitions.map((placed) => [placed.id, placed.path]),
    first.screenTransitions.map((placed) => [placed.id, placed.path]),
  )
})

test('entry 씬이 첫 layer 에 서고 뒤따르는 씬이 아래로 쌓인다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'TitleScene'), scene('2', 'Map_scene'), scene('3', 'BattleScene')],
      [edge('1', { id: '2', name: 'Map_scene' }), edge('2', { id: '3', name: 'BattleScene' })],
      [],
    ),
  )

  const byName = new Map(layout.containers.map((container) => [container.node.name, container]))
  assert.equal(byName.get('TitleScene')!.layer, 0)
  assert.equal(byName.get('Map_scene')!.layer, 1)
  assert.equal(byName.get('BattleScene')!.layer, 2)
  assert.equal(layout.layerCount, 3)
  // layer 가 위에서 아래로 쌓인다. 상태 머신을 읽는 방향이다.
  assert.ok(byName.get('Map_scene')!.y > byName.get('TitleScene')!.y)
  assert.ok(byName.get('BattleScene')!.y > byName.get('Map_scene')!.y)
})

test('순환뿐이라 들어오는 선이 없는 씬이 하나도 없어도 배치된다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A'), scene('2', 'B')],
      [edge('1', { id: '2', name: 'B' }), edge('2', { id: '1', name: 'A' })],
      [],
    ),
  )

  assert.equal(layout.containers.length, 2)
  assert.equal(layout.sceneEdges.length, 2)
  // 입력 순서의 첫 씬을 시작점으로 삼는다. 임의로 고르는 것보다 결정적인 편이 낫다.
  assert.equal(layout.containers[0].layer, 0)
  assert.equal(layout.containers[1].layer, 1)
})

test('전이가 닿지 않는 씬도 자리를 받는다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A'), scene('2', 'B'), scene('3', '외딴 씬')],
      [edge('1', { id: '2', name: 'B' })],
      [],
    ),
  )

  assert.equal(layout.containers.length, 3)
  const points = new Set(layout.containers.map((container) => `${container.x},${container.y}`))
  assert.equal(points.size, 3, '컨테이너끼리 겹쳐 놓이면 안 된다')
})

test('이름만 아는 목적지도 컨테이너를 얻는다', () => {
  const model = buildScreenMap([scene('1', 'A')], [edge('1', { name: '아직 못 가본 씬' })], [])
  const layout = layoutScreenMap(model)

  assert.equal(model.unmappedScenes, 1)
  assert.equal(layout.containers.length, 2)
  assert.equal(layout.sceneEdges.length, 1)
  const destination = layout.containers.find((container) => container.node.scene === null)
  assert.ok(destination !== undefined)
  assert.equal(destination.node.name, '아직 못 가본 씬')
})

test('씬 경계를 넘는 화면 전이는 두 컨테이너를 가로지른다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A', [screen('10', '1')]), scene('2', 'B', [screen('20', '2')])],
      [edge('1', { id: '2', name: 'B' })],
      [transition('30', '10', '20', { crossesScene: true })],
    ),
  )

  const placed = layout.screenTransitions[0]
  assert.equal(placed.transition.crossesScene, true)
  assert.equal(placed.crossesContainer, true, '두 끝이 다른 컨테이너에 놓여야 한다')
})

test('씬 안에서만 일어나는 전이는 컨테이너를 벗어나지 않는다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A', [screen('10', '1'), screen('11', '1')])],
      [],
      [transition('30', '10', '11', { kind: 'state' })],
    ),
  )

  const placed = layout.screenTransitions[0]
  assert.equal(placed.crossesContainer, false)
  assert.equal(placed.loop, false)
})

test('같은 두 화면 사이의 전이 여럿이 서로 다른 곡선으로 갈린다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A', [screen('10', '1'), screen('11', '1')])],
      [],
      [
        transition('30', '10', '11', { kind: 'action' }),
        transition('31', '10', '11', { kind: 'state' }),
        // 반대 방향. 순서 없는 쌍으로 묶지 않으면 이것이 위의 것과 정확히 겹친다.
        transition('32', '11', '10', { kind: 'auto' }),
      ],
    ),
  )

  const paths = new Set(layout.screenTransitions.map((placed) => placed.path))
  assert.equal(layout.screenTransitions.length, 3)
  assert.equal(paths.size, 3, '같은 쌍의 전이가 같은 곡선 위에 겹치면 안 된다')
})

test('자기 자신으로 가는 화면 전이는 고리로 그려진다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A', [screen('10', '1')])],
      [],
      [transition('30', '10', '10', { kind: 'state' }), transition('31', '10', '10', { kind: 'auto' })],
    ),
  )

  assert.equal(layout.screenTransitions.length, 2)
  for (const placed of layout.screenTransitions) assert.equal(placed.loop, true)
  // 두 고리가 서로 다른 크기라야 전이가 둘이라는 사실이 보인다.
  assert.notEqual(layout.screenTransitions[0].path, layout.screenTransitions[1].path)
})

test('두 끝 중 하나가 없는 화면 전이는 선이 되지 않는다', () => {
  // 파서가 걸러 내지만 배치가 그 가정에 기대지는 않는다. 끝이 없는 선은 좌표가 NaN 이 되고,
  // NaN 이 든 `d` 는 아무 말 없이 DOM 에서 사라진다.
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A', [screen('10', '1')])],
      [],
      [transition('30', '10', '999')],
    ),
  )

  assert.deepEqual(layout.screenTransitions, [])
})

test('검증된 전이와 아직 못 가본 전이가 둘 다 그려진다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'A'), scene('2', 'B')],
      [
        edge('1', { id: '2', name: 'B' }, { verifiedAt: '2026-08-27T00:00:00Z', capabilityId: '5' }),
        edge('1', { id: '2', name: 'B' }, { capabilityId: '6' }),
      ],
      [],
    ),
  )

  assert.equal(layout.sceneEdges.length, 2)
  const verified = layout.sceneEdges.filter((placed) => placed.edge.transition.verifiedAt !== null)
  assert.equal(verified.length, 1)
  // 두 간선이 같은 쌍을 잇는다. 부채꼴로 갈리지 않으면 하나로 보인다.
  assert.notEqual(layout.sceneEdges[0].path, layout.sceneEdges[1].path)
})

test('화면과 씬 전이가 모두 뷰 박스 안에 든다', () => {
  const layout = layoutScreenMap(
    buildScreenMap(
      [
        scene('1', 'A', [screen('10', '1'), screen('11', '1')]),
        scene('2', 'B', [screen('20', '2')]),
      ],
      [edge('1', { id: '2', name: 'B' }), edge('1', { id: '1', name: 'A' })],
      [transition('30', '10', '20', { crossesScene: true })],
    ),
  )

  const [x, y, width, height] = layout.viewBox.split(' ').map(Number)
  for (const container of layout.containers) {
    assert.ok(container.x >= x && container.y >= y)
    assert.ok(container.x + container.width <= x + width)
    assert.ok(container.y + container.height <= y + height)
    for (const placed of container.screens) {
      assert.ok(placed.x >= x && placed.y >= y)
      assert.ok(placed.x + placed.width <= x + width)
      assert.ok(placed.y + placed.height <= y + height)
    }
  }
  // 자기 자신으로 가는 고리는 컨테이너 바깥으로 나간다. 여백이 고정값이면 여기서 잘린다.
  for (const placed of layout.sceneEdges) {
    assert.ok(placed.midX >= x && placed.midX <= x + width, '고리의 중점이 뷰 박스를 벗어났다')
    assert.ok(placed.midY >= y && placed.midY <= y + height)
  }
  assert.equal(SCREEN_HEIGHT > 0 && SCREEN_WIDTH > 0, true)
})

test('화면이 스물인 씬이 이웃과 한 줄에 서도 겹치지 않고 세로 가운데에 놓인다', () => {
  // 씬마다 화면 수가 크게 다른 것은 정상이다 — 한 씬에서만 오버레이가 여럿 갈리고, 판정
  // 임계값에 따라 같은 씬이 화면 셋이 되기도 스물이 되기도 한다. 그 경우에만 틀리는 배치는
  // 정확히 가장 필요할 때 거짓말을 한다.
  const many = Array.from({ length: 20 }, (_, index) => screen(String(100 + index), '1'))
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'TurnBattleScene', many), scene('2', 'Map_scene', [screen('200', '2')])],
      [],
      [],
    ),
  )

  const [big, small] = layout.containers
  assert.equal(big.screens.length, 20)
  big.screens.forEach((_, index) => {
    assert.ok(contains(big, index), `화면 ${index} 가 컨테이너 밖으로 나갔다`)
  })

  // 두 컨테이너는 같은 줄이다. 겹치면 안 되고, 서로 가로로 떨어져 있어야 한다.
  assert.equal(big.layer, small.layer)
  assert.ok(big.x + big.width <= small.x || small.x + small.width <= big.x)

  // 위 맞춤이면 작은 컨테이너가 큰 것의 위쪽 모서리에 매달려 사고처럼 보인다.
  const bigCentre = big.y + big.height / 2
  const smallCentre = small.y + small.height / 2
  assert.ok(Math.abs(bigCentre - smallCentre) < 0.51, '한 줄의 컨테이너는 세로 가운데로 맞춘다')

  // `sqrt` 열이라 폭과 높이가 함께 자란다. 한 줄로 늘어놓았다면 폭이 스무 배가 됐을 것이다.
  assert.ok(big.width < SCREEN_WIDTH * 20)
  assert.ok(big.height > SCREEN_HEIGHT * 3)
})

test('한 씬 안의 왕복 전이 두 개가 서로 다른 곡선으로 갈린다', () => {
  // 실측에 있는 모양이다: TurnBattleScene 안에서 화면 둘이 오갔다. 순서 없는 쌍으로 묶지
  // 않으면 두 선이 정확히 겹쳐, 왕복이 편도 하나로 보인다.
  const layout = layoutScreenMap(
    buildScreenMap(
      [scene('1', 'TurnBattleScene', [screen('10', '1'), screen('11', '1')])],
      [],
      [
        transition('30', '10', '11', { kind: 'state' }),
        transition('31', '11', '10', { kind: 'state' }),
      ],
    ),
  )

  assert.equal(layout.screenTransitions.length, 2)
  assert.notEqual(layout.screenTransitions[0].path, layout.screenTransitions[1].path)
  for (const placed of layout.screenTransitions) assert.equal(placed.crossesContainer, false)
})
