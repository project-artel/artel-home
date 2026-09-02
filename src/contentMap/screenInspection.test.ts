/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { KnowledgeNode } from '../knowledge/knowledgeTypes.ts'
import type {
  ContentMapScene,
  ContentMapScreen,
  SceneCapability,
  SceneTransition,
  ScreenTransition,
} from './contentMapTypes.ts'
import {
  anchoredToScreen,
  indexScreenMap,
  readSceneEvidence,
  readScreenEvidence,
} from './screenInspection.ts'
import { buildScreenMap } from './screenMapLayout.ts'

/*
 * 이 모듈이 틀리면 패널이 조용히 거짓말을 한다 — 같은 조작이 목록에 세 줄로 서거나, 씬 경계를
 * 넘는 전이의 배지가 아무 말 없이 사라지거나, 씬에 묶인 지식이 그 씬의 화면 스물아홉 개에 전부
 * 달린다. 어느 것도 화면을 봐서는 알 수 없다.
 */

function capability(id: string, over: Partial<SceneCapability> = {}): SceneCapability {
  return {
    id,
    summary: `capability ${id}`,
    status: 'runnable',
    origin: 'evidence',
    verification: 'unverified',
    actionability: 'runnable',
    observability: 'observable',
    applicability: 'applies',
    interaction: 'click',
    ...over,
  }
}

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

function scene(
  id: string,
  name: string,
  screens: ContentMapScreen[] = [],
  capabilityList: SceneCapability[] = [],
): ContentMapScene {
  return {
    id,
    name,
    walked: true,
    capabilities: {
      total: capabilityList.length,
      runnable: capabilityList.length,
      needsProbe: 0,
      notAStep: 0,
      unreachablePrecondition: 0,
    },
    steps: null,
    thumbnail: null,
    screens,
    capabilityList,
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
    toSceneName: `씬 ${toSceneId}`,
    toSceneId,
    capabilityId: null,
    source: 'static',
    verifiedAt: null,
    given: null,
    ...over,
  }
}

test('화면의 capability 는 나가는 전이에서 나오고 id 로 접힌다', () => {
  const battle = scene('1', 'TurnBattleScene', [screen('10', '1'), screen('11', '1'), screen('12', '1')], [
    capability('100', { summary: '공격 버튼을 누른다' }),
  ])
  const model = buildScreenMap(
    [battle],
    [],
    [
      transition('1', '10', '11', { capabilityId: '100', capabilitySummary: '공격' }),
      transition('2', '10', '12', { capabilityId: '100', capabilitySummary: '공격' }),
      transition('3', '10', '11', { capabilityId: null }),
    ],
  )

  const evidence = readScreenEvidence(indexScreenMap(model), '10')

  assert.ok(evidence !== null)
  // 같은 조작이 화면 둘로 갈려도 목록에는 한 줄이다. 접지 않으면 "무엇을 할 수 있나"에
  // 같은 답이 두 번 선다.
  assert.equal(evidence.capabilities.length, 1)
  assert.equal(evidence.capabilities[0].transitionCount, 2)
  // capability 행의 요약이 이긴다. 전이 쪽 요약은 그 행에서 복사된 값이다.
  assert.equal(evidence.capabilities[0].summary, '공격 버튼을 누른다')
  assert.equal(evidence.capabilities[0].capability?.origin, 'evidence')
  // 자동 전이는 목록을 늘리지 않지만 전이 자체는 셋 다 남는다.
  assert.equal(evidence.outgoing.length, 3)
})

test('목록은 씬의 것에서 나오고, 쓰인 것이 앞에 서고, not-a-step 은 빠진다', () => {
  const battle = scene(
    '1',
    'TurnBattleScene',
    [screen('10', '1'), screen('11', '1')],
    [
      capability('100', { summary: '공격' }),
      capability('101', { summary: '방어' }),
      // 조작이 없어 단독으로 지시할 수 없는 행. 실측 빌드에서는 이쪽이 스물여덟 배 많다.
      capability('102', { summary: '초기화한다', status: 'not-a-step' }),
    ],
  )
  const model = buildScreenMap([battle], [], [transition('1', '10', '11', { capabilityId: '101' })])

  const evidence = readScreenEvidence(indexScreenMap(model), '10')

  assert.ok(evidence !== null)
  // 관측된 것이 앞이다. 나머지는 서버 순서를 지킨다.
  assert.deepEqual(
    evidence.capabilities.map((use) => [use.id, use.transitionCount]),
    [
      ['101', 1],
      ['100', 0],
    ],
  )
  assert.equal(evidence.notAStepCount, 1)
})

test('씬 경계를 넘는 전이의 capability 도 배지를 잃지 않는다', () => {
  const from = scene('1', 'Map_scene', [screen('10', '1')])
  const to = scene('2', 'TurnBattleScene', [screen('20', '2')], [
    capability('200', { origin: 'observed', verification: 'confirmed' }),
  ])
  const model = buildScreenMap(
    [from, to],
    [],
    [transition('1', '10', '20', { capabilityId: '200', crossesScene: true })],
  )

  const evidence = readScreenEvidence(indexScreenMap(model), '10')

  assert.ok(evidence !== null)
  // capability 는 도착 씬에 앉아 있다. 색인을 씬별로 나눴다면 여기서 배지가 사라진다.
  assert.equal(evidence.capabilities.length, 1)
  assert.equal(evidence.capabilities[0].capability?.verification, 'confirmed')
  assert.equal(evidence.outgoing[0].capability?.origin, 'observed')
})

test('사라진 capability 는 줄을 지우지 않고 전이가 든 요약만 남긴다', () => {
  const only = scene('1', 'TitleScene', [screen('10', '1'), screen('11', '1')])
  const model = buildScreenMap(
    [only],
    [],
    [transition('1', '10', '11', { capabilityId: '999', capabilitySummary: '시작한다' })],
  )

  const evidence = readScreenEvidence(indexScreenMap(model), '10')

  assert.ok(evidence !== null)
  assert.equal(evidence.capabilities[0].capability, null)
  assert.equal(evidence.capabilities[0].summary, '시작한다')
})

test('들어오는 전이는 세기만 하고 나가는 것과 섞이지 않는다', () => {
  const only = scene('1', 'TitleScene', [screen('10', '1'), screen('11', '1')])
  const model = buildScreenMap(
    [only],
    [],
    [transition('1', '10', '11'), transition('2', '11', '10'), transition('3', '11', '10', { capabilityId: '5' })],
  )

  const evidence = readScreenEvidence(indexScreenMap(model), '10')

  assert.ok(evidence !== null)
  assert.equal(evidence.outgoing.length, 1)
  assert.equal(evidence.incomingCount, 2)
})

test('없는 화면을 물으면 null 이다', () => {
  const model = buildScreenMap([scene('1', 'TitleScene')], [], [])

  assert.equal(readScreenEvidence(indexScreenMap(model), '없는것'), null)
})

test('씬은 자기 화면과 나가는 전이를 들고, 들어오는 것은 세기만 한다', () => {
  const map = scene('1', 'Map_scene', [screen('10', '1'), screen('11', '1')])
  const battle = scene('2', 'TurnBattleScene', [screen('20', '2')])
  const model = buildScreenMap(
    [map, battle],
    [edge('1', '2', { verifiedAt: '2026-08-27T00:00:00Z' }), edge('2', '1')],
    [transition('1', '10', '11'), transition('2', '11', '20', { crossesScene: true })],
  )

  const evidence = readSceneEvidence(indexScreenMap(model), 'scene:1')

  assert.ok(evidence !== null)
  assert.equal(evidence.screens.length, 2)
  assert.equal(evidence.outgoing.length, 1)
  assert.equal(evidence.outgoing[0].edge.transition.verifiedAt, '2026-08-27T00:00:00Z')
  assert.equal(evidence.incoming.length, 1)
  // 씬 안 화면들에서 나가는 전이 전부. 씬 경계를 넘는 것도 이 씬에서 나간 것이다.
  assert.equal(evidence.screenTransitionCount, 2)
})

test('전이만 가리킨 자리표시 씬도 물을 수 있다', () => {
  const model = buildScreenMap([scene('1', 'TitleScene')], [edge('1', '9')], [])
  const index = indexScreenMap(model)

  const placeholder = readSceneEvidence(index, 'scene:9')

  assert.ok(placeholder !== null)
  // 응답이 설명하지 않는 씬이다. 그 사실 자체가 패널이 말해야 하는 것이라 null 로 접지 않는다.
  assert.equal(placeholder.scene, null)
  assert.equal(placeholder.screens.length, 0)
})

test('앵커는 화면 id 로만 맞춘다', () => {
  const nodes: KnowledgeNode[] = [
    {
      id: 'k1',
      tag: 'RULE',
      source: 'QA',
      summary: '이 화면에서만 참',
      version: 1,
      createdByQaTryId: null,
      createdByQaRunId: null,
      createdAt: '',
      anchors: [{ sceneName: 'TurnBattleScene', screenId: '10' }],
    },
    {
      id: 'k2',
      tag: 'INFO',
      source: 'DOCS',
      summary: '씬 전체에서 참',
      version: 1,
      createdByQaTryId: null,
      createdByQaRunId: null,
      createdAt: '',
      anchors: [{ sceneName: 'TurnBattleScene', screenId: null }],
    },
  ]

  // 씬 이름으로도 맞추면 그 씬의 화면 스물아홉 개가 전부 같은 지식을 달고 선다.
  assert.deepEqual(
    anchoredToScreen(nodes, '10').map((node) => node.id),
    ['k1'],
  )
  assert.deepEqual(anchoredToScreen(nodes, '11'), [])
})
