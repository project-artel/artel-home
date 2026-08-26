/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseContentMapView } from './contentMapApi.ts'
import { sumCapabilities } from './contentMapTypes.ts'

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
