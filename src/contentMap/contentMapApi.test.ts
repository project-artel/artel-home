/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseContentMapView } from './contentMapApi.ts'
import { sumCapabilities, transitionKindStyle } from './contentMapTypes.ts'

/*
 * 이 파서가 지켜야 하는 두 가지.
 *
 *  1. id 가 Long 으로 온다. 숫자를 문자열로 정규화하지 못하면 씬과 전이가
 *     서로를 찾지 못하고, 그래프는 아무 말 없이 텅 빈다.
 *  2. 서버가 이 빌드 이후에 추가한 값 — 전이 출처, 결손 사유 — 은 그대로
 *     화면에 남아야 한다. 아는 값으로 접으면 없는 사실을 말한다. 반대로
 *     `capabilities` 의 모르는 숫자 키는 상태라는 보장이 없으므로 읽지
 *     않는다.
 *
 * 쓰기 경로는 없다. 근거는 SDK 가 올리고 서버가 적재하므로 이 모듈이 하는
 * 일은 조회 응답을 읽는 것뿐이다.
 *
 * 서버가 아직 만들어지는 중이라 실제 응답으로 검증할 수 없다. 그래서 여기
 * 있는 페이로드는 명세 그대로 손으로 쓴 것이고, 이 시험이 증명하는 것은
 * "명세대로 오면 이렇게 읽는다"이지 "서버가 이렇게 준다"가 아니다.
 */

test('숫자 id 를 문자열로 정규화해 씬과 전이가 서로를 찾게 한다', () => {
  const view = parseContentMapView({
    contentMap: {
      id: 12,
      capture: 7,
      schemaVersion: 3,
      evidenceDigest: 'sha256:abc',
      unity: '2022.3.10f1',
      platform: 'Android',
      sdkVersion: '0.4.1',
      ingestedAt: '2026-08-21T04:00:00Z',
    },
    scenes: [
      { id: 1, name: 'Title', walked: true, capabilities: { total: 2, runnable: 2 } },
      { id: 2, name: 'Lobby', walked: false, capabilities: { total: 0 } },
    ],
    edges: [{ fromSceneId: 1, toSceneName: 'Lobby', toSceneId: 2, capabilityId: 5, source: 'static' }],
    gaps: [],
    verification: { verified: 1, total: 4 },
    pendingDocuments: [],
  })

  assert.equal(view.contentMap?.id, '12')
  assert.equal(view.contentMap?.capture, '7')
  assert.equal(view.contentMap?.schemaVersion, '3')
  assert.deepEqual(
    view.scenes.map((scene) => scene.id),
    ['1', '2'],
  )
  assert.equal(view.edges[0].fromSceneId, '1')
  assert.equal(view.edges[0].toSceneId, '2')
  assert.equal(view.edges[0].capabilityId, '5')
})

test('한 번도 올린 적 없는 빌드는 contentMap 이 null 이고 나머지는 빈 배열이다', () => {
  const view = parseContentMapView({
    contentMap: null,
    scenes: [],
    edges: [],
    gaps: [],
    verification: { verified: 0, total: 0 },
    pendingDocuments: [],
  })

  assert.equal(view.contentMap, null)
  assert.deepEqual(view.scenes, [])
  assert.deepEqual(view.verification, { verified: 0, total: 0 })
})

test('올렸지만 아직 반영되지 않은 상태는 ingestedAt 이 null 로 남는다', () => {
  const view = parseContentMapView({
    contentMap: { id: 3, capture: 'c1', schemaVersion: '1', evidenceDigest: 'd', ingestedAt: null },
    pendingDocuments: [{ documentId: 8, receivedAt: '2026-08-21T03:00:00Z' }],
  })

  assert.equal(view.contentMap?.ingestedAt, null)
  assert.equal(view.contentMap?.unity, null)
  assert.deepEqual(view.pendingDocuments, [
    { documentId: '8', receivedAt: '2026-08-21T03:00:00Z', ingestFailedAt: null, ingestError: null },
  ])
})

test('capabilities 의 모르는 숫자 키는 버려지고 total 도 부풀리지 않는다', () => {
  // 서버가 이 객체에 넣는 숫자 필드가 전부 상태인 것은 아니다 — 버전이나
  // id 일 수도 있다. 상태로 승격시키면 없는 상태를 하나 지어내는 동시에
  // 합까지 함께 틀어진다.
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        name: 'Title',
        capabilities: {
          total: 3,
          runnable: 2,
          needsProbe: 1,
          notAStep: 0,
          unreachablePrecondition: 0,
          awaitingHumanReview: 2,
        },
      },
    ],
  })

  assert.deepEqual(view.scenes[0].capabilities, {
    total: 3,
    runnable: 2,
    needsProbe: 1,
    notAStep: 0,
    unreachablePrecondition: 0,
  })
})

test('total 이 상태 합보다 작으면 합을 쓴다', () => {
  // 서버가 total 을 늦게 갱신하면 막대가 칸을 넘는다. 사용자가 볼 수 있는
  // 자기모순이라 파서에서 미리 맞춘다.
  const view = parseContentMapView({
    scenes: [{ id: 1, capabilities: { total: 1, runnable: 3, needsProbe: 2 } }],
  })

  assert.equal(view.scenes[0].capabilities.total, 5)
})

test('능력 필드가 통째로 빠져도 씬은 살아남는다', () => {
  const view = parseContentMapView({ scenes: [{ id: 4, name: 'Boss' }] })

  assert.equal(view.scenes.length, 1)
  assert.equal(view.scenes[0].walked, false)
  assert.deepEqual(view.scenes[0].capabilities, {
    total: 0,
    runnable: 0,
    needsProbe: 0,
    notAStep: 0,
    unreachablePrecondition: 0,
  })
})

test('여러 씬의 능력을 더할 때 아는 상태만 더해진다', () => {
  const view = parseContentMapView({
    scenes: [
      { id: 1, capabilities: { runnable: 1, awaitingHumanReview: 2 } },
      { id: 2, capabilities: { runnable: 3, needsProbe: 1, quarantined: 4 } },
    ],
  })

  const totals = sumCapabilities(view.scenes)
  assert.deepEqual(totals, {
    total: 5,
    runnable: 4,
    needsProbe: 1,
    notAStep: 0,
    unreachablePrecondition: 0,
  })
})

test('모르는 전이 출처는 그대로 남는다', () => {
  const view = parseContentMapView({
    scenes: [{ id: 1 }],
    edges: [{ fromSceneId: 1, toSceneName: 'Shop', toSceneId: null, source: 'PROPHECY' }],
  })

  assert.equal(view.edges[0].source, 'PROPHECY')
  assert.equal(view.edges[0].toSceneId, null)
})

test('id 없는 씬은 버리고 나머지는 남긴다', () => {
  const view = parseContentMapView({
    scenes: [{ name: '이름만 있는 씬' }, { id: 2, name: 'Lobby' }, 'not an object'],
  })

  assert.deepEqual(
    view.scenes.map((scene) => scene.name),
    ['Lobby'],
  )
})

test('같은 씬 id 가 두 번 오면 첫 번째만 남는다', () => {
  const view = parseContentMapView({
    scenes: [
      { id: 1, name: 'Title' },
      { id: 1, name: 'Title (dup)' },
    ],
  })

  assert.equal(view.scenes.length, 1)
  assert.equal(view.scenes[0].name, 'Title')
})

test('완전히 같은 전이가 두 번 오면 하나로 접힌다', () => {
  const view = parseContentMapView({
    scenes: [{ id: 1 }, { id: 2 }],
    edges: [
      { fromSceneId: 1, toSceneId: 2, toSceneName: 'Lobby', capabilityId: 9, source: 'static' },
      { fromSceneId: 1, toSceneId: 2, toSceneName: 'Lobby', capabilityId: 9, source: 'static' },
      { fromSceneId: 1, toSceneId: 2, toSceneName: 'Lobby', capabilityId: 9, source: 'runtime' },
    ],
  })

  // 출처가 다르면 다른 사실이다. 접히는 것은 완전히 같은 것뿐이다.
  assert.equal(view.edges.length, 2)
})

test('확인 수가 전체보다 크면 전체에 맞춰 자른다', () => {
  const view = parseContentMapView({ verification: { verified: 12, total: 4 } })

  assert.deepEqual(view.verification, { verified: 4, total: 4 })
})

test('응답이 아예 객체가 아니어도 빈 콘텐츠 맵으로 읽힌다', () => {
  const view = parseContentMapView('nope')

  assert.equal(view.contentMap, null)
  assert.deepEqual(view.scenes, [])
  assert.deepEqual(view.edges, [])
  assert.deepEqual(view.gaps, [])
  assert.deepEqual(view.pendingDocuments, [])
})

test('결손 사유는 번역하지 않고 서버가 쓴 문자열 그대로 남는다', () => {
  const view = parseContentMapView({
    gaps: [{ reason: 'NO_EVIDENCE_FOR_PRECONDITION', count: 3 }, { count: 1 }],
  })

  assert.deepEqual(view.gaps, [{ reason: 'NO_EVIDENCE_FOR_PRECONDITION', count: 3 }])
})

test('같은 결손 사유가 두 번 오면 첫 번째만 남는다', () => {
  // 화면이 `reason` 을 React key 로 쓴다. 겹치면 두 항목 중 하나가 아무 말
  // 없이 사라진다.
  const view = parseContentMapView({
    gaps: [
      { reason: 'NO_EVIDENCE_FOR_PRECONDITION', count: 3 },
      { reason: 'NO_EVIDENCE_FOR_PRECONDITION', count: 1 },
    ],
  })

  assert.deepEqual(view.gaps, [{ reason: 'NO_EVIDENCE_FOR_PRECONDITION', count: 3 }])
})

/*
 * 화면과 화면 전이 (ARTEL-596 · ARTEL-597).
 *
 * 아래 페이로드는 orchestration 의 `ContentMapViewDtos.kt` 와 그 골든 시험의 픽스처를 그대로
 * 옮긴 것이다. 그래도 이 시험이 증명하는 것은 "명세대로 오면 이렇게 읽는다"이지 "서버가 이렇게
 * 준다"가 아니다.
 */

test('씬 안의 화면을 씬에 붙여 읽고 화면 전이를 최상위로 읽는다', () => {
  const view = parseContentMapView({
    contentMap: { id: 12, capture: 'editor', schemaVersion: 3, evidenceDigest: 'sha256:abc' },
    scenes: [
      {
        id: 1,
        name: 'TitleScene',
        walked: true,
        capabilities: { total: 1, runnable: 1 },
        screens: [
          {
            id: 10,
            sceneId: 1,
            name: '타이틀',
            discriminator: [{ selector: 'Canvas[2]/settings[1]', active: false }],
            observedCount: 4,
            firstSeenQaRunId: 77,
          },
          {
            id: 11,
            sceneId: 1,
            name: '타이틀 · 설정 팝업',
            discriminator: [{ selector: 'Canvas[2]/settings[1]', active: true }],
            observedCount: 2,
            firstSeenQaRunId: null,
          },
        ],
      },
      { id: 2, name: 'Map_scene', walked: false, capabilities: { total: 0 }, screens: [{ id: 12, sceneId: 2, name: '맵', discriminator: [], observedCount: 5 }] },
    ],
    screenTransitions: [
      { id: 20, fromScreenId: 10, toScreenId: 11, capabilityId: 91, capabilitySummary: '설정을 연다', kind: 'state', crossesScene: false, observedCount: 2, firstSeenQaRunId: 77 },
      { id: 21, fromScreenId: 10, toScreenId: 12, capabilityId: 91, capabilitySummary: '게임을 시작한다', kind: 'action', crossesScene: true, observedCount: 5, firstSeenQaRunId: 77 },
      { id: 22, fromScreenId: 11, toScreenId: 10, kind: 'auto', crossesScene: false, observedCount: 1 },
    ],
  })

  assert.deepEqual(
    view.scenes.map((scene) => scene.screens.map((screen) => screen.id)),
    [['10', '11'], ['12']],
  )
  // 한 씬에 화면이 둘이고 그 둘을 가르는 것은 이름이 아니라 `discriminator` 다.
  const [title, popup] = view.scenes[0].screens
  assert.notEqual(title.discriminator, popup.discriminator)
  assert.equal(title.discriminator, '[{"selector":"Canvas[2]/settings[1]","active":false}]')
  assert.equal(title.firstSeenQaRunId, '77')
  assert.equal(popup.firstSeenQaRunId, null)

  assert.equal(view.screenTransitions.length, 3)
  const crossing = view.screenTransitions.find((transition) => transition.id === '21')
  assert.deepEqual(crossing, {
    id: '21',
    fromScreenId: '10',
    toScreenId: '12',
    capabilityId: '91',
    capabilitySummary: '게임을 시작한다',
    kind: 'action',
    crossesScene: true,
    observedCount: 5,
    firstSeenQaRunId: '77',
  })
  // 기능이 없는 자동 전이. 요약도 없지만 "갔다는 사실"은 남는다.
  const auto = view.screenTransitions.find((transition) => transition.id === '22')
  assert.equal(auto?.capabilityId, null)
  assert.equal(auto?.capabilitySummary, null)
  assert.equal(auto?.kind, 'auto')
})

test('화면 절이 없는 응답은 빈 배열로 읽힌다', () => {
  // QA 런 전의 정상 상태이자, 이 절을 아직 보내지 않는 서버의 응답이다. 사용자가 할 일이
  // 같으므로 두 사실을 가르지 않는다.
  const view = parseContentMapView({
    contentMap: { id: 12, capture: 'editor', schemaVersion: 3, evidenceDigest: 'sha256:abc' },
    scenes: [{ id: 1, name: 'Title', walked: false, capabilities: { total: 0 } }],
  })

  assert.deepEqual(view.scenes[0].screens, [])
  assert.deepEqual(view.screenTransitions, [])
})

test('이름 없는 화면과 빈 이름의 화면을 가른다', () => {
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        name: 'Title',
        screens: [
          { id: 10, sceneId: 1, discriminator: [] },
          { id: 11, sceneId: 1, name: '', discriminator: [{ active: true }] },
        ],
      },
    ],
  })

  // null 은 아무도 이름을 붙이지 않은 것이고 `''` 는 빈 이름을 붙인 것이다. 화면이 두 문장을
  // 다르게 쓸 수 있으려면 파서가 먼저 갈라야 한다.
  assert.equal(view.scenes[0].screens[0].name, null)
  assert.equal(view.scenes[0].screens[1].name, '')
})

test('id 나 sceneId 가 없는 화면만 버리고 나머지 화면은 살린다', () => {
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        name: 'Title',
        screens: [
          { sceneId: 1, name: '어디 화면인지는 아는데 누구인지 모른다', discriminator: [] },
          { id: 11, name: '어느 씬인지 모른다', discriminator: [] },
          { id: 12, sceneId: 1, name: '멀쩡한 화면', discriminator: [] },
          // 같은 id 가 두 번. 접지 않으면 화면 전이가 어느 노드에 붙을지 정해지지 않는다.
          { id: 12, sceneId: 1, name: '같은 화면이 또', discriminator: [] },
        ],
      },
    ],
  })

  assert.deepEqual(
    view.scenes[0].screens.map((screen) => [screen.id, screen.name]),
    [['12', '멀쩡한 화면']],
  )
})

test('두 끝 중 하나가 이 응답의 화면이 아니면 그 전이는 버린다', () => {
  // 끝이 없는 선은 배치가 좌표를 낼 수 없다. 조용히 사라지는 선보다 애초에 없는 편이 낫다.
  const view = parseContentMapView({
    scenes: [{ id: 1, name: 'Title', screens: [{ id: 10, sceneId: 1, discriminator: [] }] }],
    screenTransitions: [
      { id: 20, fromScreenId: 10, toScreenId: 999, kind: 'action' },
      { id: 21, fromScreenId: 10, toScreenId: 10, kind: 'state' },
      { id: 22, fromScreenId: 10, kind: 'action' },
    ],
  })

  assert.deepEqual(view.screenTransitions.map((transition) => transition.id), ['21'])
})

test('모르는 화면 전이 갈래는 서버가 쓴 철자 그대로 남는다', () => {
  const view = parseContentMapView({
    scenes: [
      {
        id: 1,
        name: 'Title',
        screens: [
          { id: 10, sceneId: 1, discriminator: [] },
          { id: 11, sceneId: 1, discriminator: [{ active: true }] },
        ],
      },
    ],
    screenTransitions: [{ id: 20, fromScreenId: 10, toScreenId: 11, kind: 'timeout' }],
  })

  // 아는 셋 중 하나로 접으면 서버가 말하지 않은 갈래를 화면이 지어낸다.
  assert.equal(view.screenTransitions[0].kind, 'timeout')
  assert.equal(transitionKindStyle('timeout'), 'unknown')
  assert.equal(transitionKindStyle('auto'), 'auto')
})
