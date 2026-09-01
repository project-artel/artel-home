import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, readJson } from '../projects/projectApi'
import {
  type CapabilityCounts,
  type ConditionNode,
  type ContentMapGap,
  type ContentMapHeader,
  type ContentMapScene,
  type ContentMapScreen,
  type ContentMapStep,
  type ContentMapVerification,
  type ContentMapView,
  type PendingDocument,
  type SceneCapability,
  type SceneThumbnail,
  type SceneTransition,
  type ScreenImage,
  type ScreenTransition,
} from './contentMapTypes'

/*
 * 콘텐츠 맵 조회 하나와, 그 응답을 화면이 믿고 그릴 수 있는 모양으로 바꾸는 일.
 *
 * 읽기 전용이다. 근거 문서는 SDK 가 스스로 올리고 서버가 적재하므로, 이
 * 콘솔에서 쓰는 경로는 스캔을 시키는 것 하나뿐이고 그것은
 * `requestEvidenceScan.ts` 에 따로 있다.
 *
 * 관대하게 읽는다. 이 화면이 존재하는 이유가 "빌드에 무엇이 들어 있는지
 * 아무 데서도 볼 수 없다"는 것인데, 필드 하나가 비었다고 전체를 버리면
 * 사용자는 정확히 그 상태로 되돌아간다. 그래서 항목을 식별하지 못할 때만
 * 그 항목을 버리고, 나머지는 전부 화면이 감출 줄 아는 값으로 낮춘다.
 */

/**
 * id 를 문자열로 정규화한다.
 *
 * 이 엔드포인트들은 id 를 Long 으로 보낸다. 숫자를 그대로 들고 다니면
 * 어떤 자리에서는 `1` 과 `"1"` 이 다른 Map 키가 되어 씬과 전이가 서로를
 * 찾지 못한다. 문자열 하나로 통일하는 편이 그 버그를 아예 없앤다.
 */
function asId(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/** 음이 아닌 정수만. 그 밖은 전부 `fallback` 으로 낮춘다. */
function asCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

/**
 * 숫자로 올 수도 문자열로 올 수도 있는 표시용 값.
 *
 * `schemaVersion` 과 `capture` 는 명세에 타입이 없다. 그대로 보여 주기만 할
 * 값이므로 둘 다 받아서 문자열로 만든다 — 타입 하나를 골라 두고 다른 쪽이
 * 오면 빈칸이 되는 것보다 낫다.
 */
function asDisplayValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecordOrEmpty(value: unknown): Record<string, unknown> {
  return asRecord(value) ?? {}
}

/**
 * 능력 집계.
 *
 * 아는 네 상태와 `total` 만 읽는다. 모르는 숫자 키를 상태로 승격시키면
 * 서버가 `capabilities` 에 넣은 버전이나 id 하나가 상태로 그려지고
 * `total` 까지 그만큼 부푼다 — 없는 사실을 두 번 말하는 셈이다.
 */
function parseCapabilities(data: unknown): CapabilityCounts {
  const record = asRecordOrEmpty(data)

  const runnable = asCount(record.runnable)
  const needsProbe = asCount(record.needsProbe)
  const notAStep = asCount(record.notAStep)
  const unreachablePrecondition = asCount(record.unreachablePrecondition)

  // `total` 이 빠졌거나 상태 합보다 작으면 합을 쓴다. 상태별 막대가 합보다
  // 긴 요약 줄은 사용자가 볼 수 있는 자기모순이다.
  const parts = runnable + needsProbe + notAStep + unreachablePrecondition

  return {
    total: Math.max(asCount(record.total), parts),
    runnable,
    needsProbe,
    notAStep,
    unreachablePrecondition,
  }
}

/**
 * 조건 트리의 마디 하나.
 *
 * 여기가 이 파일에서 유일하게 **관대하지 않은** 자리다. 나머지 파서는 필드
 * 하나가 비면 화면이 감출 줄 아는 값으로 낮추지만, 조건은 그렇게 다룰 수
 * 없다. 못 읽은 마디를 `always` 로 낮추면 화면은 "아무 때나 된다"고 말하게
 * 되고, 그 줄을 읽은 QA 는 실제로는 선행 조건이 있는 조작을 조건 없이
 * 테스트한다. 그래서 모르는 `kind` 는 낮추지 않고 `unrecognisedKind` 로
 * 남겨서, 우리가 못 읽었다는 사실 자체를 화면에 올린다.
 *
 * 서버가 정규화해서 보내므로 `kind` 는 늘 소문자이고 이름표 없는 마디는
 * 오지 않는다. 이 함수는 그 약속을 다시 확인하지 않고, 어긋나면 어긋난
 * 그대로 보인다.
 */
export function parseCondition(data: unknown): ConditionNode {
  const record = asRecord(data)
  if (record === null) return { kind: 'unrecognisedKind', reportedKind: '' }

  const kind = asString(record.kind)

  switch (kind) {
    case 'always':
      return { kind: 'always' }

    case 'test':
      return {
        kind: 'test',
        left: asString(record.left),
        operator: asString(record.operator),
        right: asString(record.right),
        context: asNullableString(record.context),
        subjectLost: asNullableString(record.subjectLost),
        offset: asCount(record.offset),
      }

    case 'gesture':
      return { kind: 'gesture', input: asString(record.input), offset: asCount(record.offset) }

    case 'every':
    case 'either': {
      const parts = toArray(record.parts).map(parseCondition)
      // 부분이 하나도 없는 묶음은 조건이 아니다. 빈 `every` 를 그리면 화면이
      // "이것을 전부 만족해야 한다"고 말해 놓고 아무것도 대지 못한다.
      if (parts.length === 0) return { kind: 'unrecognisedKind', reportedKind: kind }
      return { kind, parts }
    }

    case 'unknown':
      return {
        kind: 'unknown',
        reason: asString(record.reason),
        unread: asNullableString(record.unread),
      }

    default:
      return { kind: 'unrecognisedKind', reportedKind: kind }
  }
}

/**
 * 조작 단계 하나. `id` 가 없으면 버린다 — 같은 씬 안에 요약·입력키·상태가
 * 전부 같은 단계가 여럿 있고, 그것들을 가르는 것은 id 와 조건뿐이다.
 */
export function parseStep(data: unknown): ContentMapStep | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  return {
    id,
    summary: asString(record.summary),
    status: asString(record.status),
    interaction: asString(record.interaction),
    inputKey: asNullableString(record.inputKey),
    controlLabel: asNullableString(record.controlLabel),
    controlPath: asNullableString(record.controlPath),
    givenText: asNullableString(record.givenText),
    given: record.given === null || record.given === undefined ? null : parseCondition(record.given),
  }
}

/**
 * 씬의 단계 목록.
 *
 * 절이 없으면 `null` 을, 있으면 배열을 돌려준다. 이 구분이 이 함수의 전부다:
 * 이 절을 아직 보내지 않는 서버의 응답에서 화면이 "단계가 0개"라고 말하면,
 * 씬에 정말로 조작이 없다는 것과 우리가 물어보지 않았다는 것이 한 문장으로
 * 합쳐진다. 절이 있지만 배열이 아닌 응답도 같은 이유로 "절 없음"으로 읽는다 —
 * 배열이 아닌 것에서 단계를 세는 것보다 아무 말도 하지 않는 편이 정직하다.
 */
function parseSteps(data: unknown): ContentMapStep[] | null {
  if (!Array.isArray(data)) return null

  const steps: ContentMapStep[] = []
  for (const raw of data) {
    const step = parseStep(raw)
    // 같은 id 가 두 번 와도 접지 않는다. 이 목록은 서로 구분되지 않는 줄이
    // 여럿이라는 사실 자체를 보여 주는 곳이고, 접으면 그 사실이 사라진다.
    if (step !== null) steps.push(step)
  }
  return steps
}

/**
 * 대표 이미지 절.
 *
 * `state` 가 이 빌드가 아는 두 값 중 하나일 때만 읽는다. 모르는 상태를
 * `available` 로 접으면 화면이 없는 이미지를 그리려 들고, `unavailable` 로
 * 접으면 서버가 말하지 않은 실패를 지어낸다. 둘 다 틀리므로 통째로 버린다 —
 * 그때 화면은 "서버가 이 씬에 대해 아무 말도 안 했다" 갈래를 탄다.
 *
 * `available` 인데 `url` 이 비어 있으면 그릴 것이 없다. 그것도 버린다.
 */
export function parseThumbnail(data: unknown): SceneThumbnail | null {
  const record = asRecord(data)
  if (record === null) return null

  const state = asString(record.state)
  if (state === 'available') {
    const url = asString(record.url)
    if (url.length === 0) return null
    return {
      state: 'available',
      url,
      width: asNullableCount(record.width),
      height: asNullableCount(record.height),
    }
  }
  if (state === 'unavailable') {
    return { state: 'unavailable', reason: asString(record.reason) }
  }
  return null
}

/** 픽셀 크기. 없거나 말이 안 되는 값이면 null 로 둔다 — 0 은 크기가 아니다. */
function asNullableCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/**
 * 화면 하나. `id` 와 `sceneId` 가 모두 있어야 그릴 수 있으므로 그때만 버린다 — 어느 씬 안에
 * 놓을지 모르는 화면은 컨테이너 밖을 떠돌게 되고, 그것은 이 그림이 말하려는 것과 정반대다.
 *
 * `discriminator` 는 해석하지 않고 직렬화만 한다. 서버도 읽지 않고 그대로 옮기는 열린 JSON 이라,
 * 여기서 모양을 정하면 관측 쪽이 조건 어휘를 늘리는 날 이 화면이 먼저 깨진다. 문자열로 만들어 두면
 * 두 화면이 서로 다른 화면인지를 눈으로 확인할 수도 있고, 그것이 이 값의 유일한 용도다.
 *
 * 직렬화가 실패할 수 있는 값(순환 참조)은 `fetch` 가 만든 JSON 에서는 나오지 않지만, 이 파서는
 * 테스트에서 손으로 만든 값도 받는다. 실패하면 빈 문자열로 낮춘다 — 화면 하나를 통째로 버리는
 * 것보다 판별 근거만 비는 편이 낫다.
 */
export function parseScreen(data: unknown): ContentMapScreen | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  const sceneId = asId(record.sceneId)
  if (id === null || sceneId === null) return null

  return {
    id,
    sceneId,
    // `null` 과 `''` 를 가른다. 앞은 아무도 이름을 붙이지 않은 것이고 뒤는 빈 이름을 붙인 것이다.
    name: typeof record.name === 'string' ? record.name : null,
    discriminator: asJsonText(record.discriminator),
    observedCount: asCount(record.observedCount),
    firstSeenQaRunId: asId(record.firstSeenQaRunId),
    image: parseScreenImage(record.image),
  }
}

/**
 * 화면 캡처의 주소.
 *
 * `url` 이 없으면 그릴 것이 없으므로 통째로 버린다 — 그때 화면은 "아직 캡처가 없다" 갈래를 탄다.
 * 오늘 살아 있는 DB 의 화면은 전부 그 갈래이고, **그것이 지금의 정상 상태다.** 캡처를 내보내는
 * 경로가 아직 없기 때문이지 이 파서가 무언가를 놓쳐서가 아니다.
 *
 * 두 시각은 없어도 이미지를 버리지 않는다. 그림 자체가 이 절의 값어치이고, 언제 찍혔는지는
 * 덧붙이는 사실이다.
 */
export function parseScreenImage(data: unknown): ScreenImage | null {
  const record = asRecord(data)
  if (record === null) return null

  const url = asString(record.url)
  if (url.length === 0) return null

  return {
    url,
    expiresAt: asNullableString(record.expiresAt),
    capturedAt: asNullableString(record.capturedAt),
  }
}

/** 열린 JSON 을 사람이 볼 수 있는 한 줄로. 해석하지 않는다. */
function asJsonText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/**
 * 씬의 화면 목록.
 *
 * 절이 없으면 빈 배열이다. 단계 목록(`parseSteps`)과 달리 `null` 을 따로 두지 않는 이유는, 화면이
 * 비어 있는 것이 **이 절을 보내지 않는 서버**와 **아직 QA 런이 없는 빌드**에서 똑같이 정상이기
 * 때문이다. 두 사실에 대해 사용자가 할 일이 같으므로 — 런을 한 번 돌린다 — 가르지 않는다.
 *
 * 같은 id 가 두 번 오면 접는다. 화면 전이가 화면 id 로 오는데 같은 id 의 노드가 둘이면 선이 어느
 * 쪽에 붙을지 정해지지 않는다.
 */
function parseScreens(data: unknown): ContentMapScreen[] {
  const screens: ContentMapScreen[] = []
  const seen = new Set<string>()
  for (const raw of toArray(data)) {
    const screen = parseScreen(raw)
    if (screen === null || seen.has(screen.id)) continue
    seen.add(screen.id)
    screens.push(screen)
  }
  return screens
}

/**
 * 화면 전이 하나. 세 id 가 다 있어야 그릴 수 있다.
 *
 * `id` 까지 요구하는 이유는 이것이 선택 대상이자 React key 이기 때문이다. 같은 두 화면 사이에
 * 서로 다른 기능으로 가는 전이가 여럿 있을 수 있어서, 두 끝만으로는 서로 구분되지 않는다.
 */
export function parseScreenTransition(data: unknown): ScreenTransition | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  const fromScreenId = asId(record.fromScreenId)
  const toScreenId = asId(record.toScreenId)
  if (id === null || fromScreenId === null || toScreenId === null) return null

  return {
    id,
    fromScreenId,
    toScreenId,
    capabilityId: asId(record.capabilityId),
    capabilitySummary: asNullableString(record.capabilitySummary),
    kind: asString(record.kind),
    // 빠졌으면 false 다. 없는 경계 넘김을 그리는 것보다 씬 안의 상태 변화로 읽는 편이 조용하다 —
    // 두 화면이 다른 씬에 있으면 배치가 어차피 컨테이너를 가로지르게 그린다.
    crossesScene: record.crossesScene === true,
    observedCount: asCount(record.observedCount),
    firstSeenQaRunId: asId(record.firstSeenQaRunId),
  }
}

/**
 * 씬 하나. `id` 가 없으면 버린다 — 전이가 가리킬 수 없는 씬은 그래프에
 * 놓을 자리가 없고, 지어낸 id 는 다음 응답에서 다른 씬이 된다.
 */
export function parseScene(data: unknown): ContentMapScene | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  return {
    id,
    name: asString(record.name),
    walked: record.walked === true,
    capabilities: parseCapabilities(record.capabilities),
    steps: parseSteps(record.steps),
    thumbnail: parseThumbnail(record.thumbnail),
    screens: parseScreens(record.screens),
    capabilityList: parseCapabilityList(record.capabilityList),
  }
}

/**
 * capability 하나. `id` 가 없으면 버린다 — 이 목록의 유일한 쓸모가 screen transition 이 들고 온
 * id 로 `origin` 과 `verification` 을 되찾는 것이라, 찾을 수 없는 행은 자리만 차지한다.
 *
 * 나머지 칸은 전부 서버 철자 그대로 둔다. 아는 값으로 좁히면 서버가 어휘를 늘리는 날 배지가
 * 없는 상태를 말하게 된다.
 */
export function parseCapability(data: unknown): SceneCapability | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  return {
    id,
    summary: asString(record.summary),
    status: asString(record.status),
    origin: asString(record.origin),
    verification: asString(record.verification),
    actionability: asString(record.actionability),
    observability: asString(record.observability),
    applicability: asString(record.applicability),
    interaction: asString(record.interaction),
  }
}

/**
 * 씬의 capability 목록.
 *
 * 절이 없으면 빈 배열이다. `steps` 와 달리 `null` 을 따로 두지 않는 이유는, 이 목록이 화면에 직접
 * 그려지는 절이 아니라 **색인의 재료**이기 때문이다 — 비면 배지가 붙지 않고, 그 사실은 배지가 붙는
 * 자리에서 이미 보인다.
 *
 * 같은 id 가 두 번 오면 접는다. 색인이 id 로 찾으므로 둘째 행은 어차피 닿지 않는다.
 */
function parseCapabilityList(data: unknown): SceneCapability[] {
  const capabilities: SceneCapability[] = []
  const seen = new Set<string>()
  for (const raw of toArray(data)) {
    const capability = parseCapability(raw)
    if (capability === null || seen.has(capability.id)) continue
    seen.add(capability.id)
    capabilities.push(capability)
  }
  return capabilities
}

/** 전이 하나. 출발 씬을 모르면 그릴 수 없으므로 그때만 버린다. */
export function parseTransition(data: unknown): SceneTransition | null {
  const record = asRecord(data)
  if (record === null) return null

  const fromSceneId = asId(record.fromSceneId)
  if (fromSceneId === null) return null

  return {
    fromSceneId,
    toSceneName: asString(record.toSceneName),
    toSceneId: asId(record.toSceneId),
    capabilityId: asId(record.capabilityId),
    source: asString(record.source),
    verifiedAt: asNullableString(record.verifiedAt),
    given: record.given === null || record.given === undefined ? null : parseCondition(record.given),
  }
}

function parseGap(data: unknown): ContentMapGap | null {
  const record = asRecord(data)
  if (record === null) return null

  const reason = asString(record.reason)
  if (reason.length === 0) return null

  return { reason, count: asCount(record.count) }
}

function parseVerification(data: unknown): ContentMapVerification {
  const record = asRecordOrEmpty(data)
  const total = asCount(record.total)
  // 확인된 수가 전체보다 큰 비율은 그릴 수 없다. 서버가 그렇게 말하면
  // 막대가 칸을 넘기 전에 여기서 자른다.
  return { verified: Math.min(asCount(record.verified), total), total }
}

function parsePendingDocument(data: unknown): PendingDocument | null {
  const record = asRecord(data)
  if (record === null) return null

  const documentId = asId(record.documentId)
  if (documentId === null) return null

  return {
    documentId,
    receivedAt: asString(record.receivedAt),
    ingestFailedAt: asNullableString(record.ingestFailedAt),
    ingestError: asNullableString(record.ingestError),
  }
}

/**
 * 맵 머리말. `id` 가 없으면 null 을 돌려주고, 화면은 그것을 "한 번도 올린
 * 적 없음"으로 읽는다 — 식별할 수 없는 맵은 있으나 마나이기 때문이다.
 */
function parseHeader(data: unknown): ContentMapHeader | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asId(record.id)
  if (id === null) return null

  return {
    id,
    capture: asDisplayValue(record.capture),
    schemaVersion: asDisplayValue(record.schemaVersion),
    evidenceDigest: asString(record.evidenceDigest),
    unity: asNullableString(record.unity),
    platform: asNullableString(record.platform),
    sdkVersion: asNullableString(record.sdkVersion),
    ingestedAt: asNullableString(record.ingestedAt),
  }
}

/**
 * 응답 전체.
 *
 * 씬에 없는 id 를 가리키는 전이는 버리지 **않는다**. 이름만 아는 목적지는
 * 명세가 인정하는 정상 상태이고(`toSceneId: null`), 지식 그래프와 달리 여기서는
 * 그 이름 자체가 사용자에게 쓸모 있는 정보다 — 아직 콘텐츠 맵에 없는 씬으로
 * 가는 길이 있다는 뜻이니까. 레이아웃 쪽에서 이름 전용 노드를 만들어 준다.
 *
 * 같은 `(from, to, capability, source)` 가 두 번 오면 하나로 접는다. 두 개는
 * 나란한 두 곡선으로 그려져 전이가 둘 있다고 말하게 된다.
 */
export function parseContentMapView(data: unknown): ContentMapView {
  const record = asRecord(data)

  const scenes: ContentMapScene[] = []
  const sceneIds = new Set<string>()
  for (const raw of toArray(record?.scenes)) {
    const scene = parseScene(raw)
    if (scene === null || sceneIds.has(scene.id)) continue
    sceneIds.add(scene.id)
    scenes.push(scene)
  }

  const edges: SceneTransition[] = []
  const seen = new Set<string>()
  for (const raw of toArray(record?.edges)) {
    const edge = parseTransition(raw)
    if (edge === null) continue
    const key = `${edge.fromSceneId} ${edge.toSceneId ?? edge.toSceneName} ${edge.capabilityId ?? ''} ${edge.source}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push(edge)
  }

  // 화면이 없는 응답에서는 전이도 그릴 수 없다. 그런 전이를 남기면 배치가 끝이 없는 선을
  // 하나 들고 있게 되므로, 두 끝이 모두 실제 화면인 것만 남긴다.
  const screenIds = new Set(scenes.flatMap((scene) => scene.screens.map((screen) => screen.id)))
  const screenTransitions: ScreenTransition[] = []
  const transitionIds = new Set<string>()
  for (const raw of toArray(record?.screenTransitions)) {
    const transition = parseScreenTransition(raw)
    if (transition === null || transitionIds.has(transition.id)) continue
    if (!screenIds.has(transition.fromScreenId) || !screenIds.has(transition.toScreenId)) continue
    transitionIds.add(transition.id)
    screenTransitions.push(transition)
  }

  const gaps: ContentMapGap[] = []
  const gapReasons = new Set<string>()
  for (const raw of toArray(record?.gaps)) {
    const gap = parseGap(raw)
    // 같은 사유가 두 번 오면 첫 번째만 남긴다. 화면은 `reason` 을 React key
    // 로 쓰므로, 겹치면 두 항목 중 하나가 아무 말 없이 사라진다.
    if (gap === null || gapReasons.has(gap.reason)) continue
    gapReasons.add(gap.reason)
    gaps.push(gap)
  }

  const pendingDocuments: PendingDocument[] = []
  for (const raw of toArray(record?.pendingDocuments)) {
    const pending = parsePendingDocument(raw)
    if (pending !== null) pendingDocuments.push(pending)
  }

  return {
    contentMap: parseHeader(record?.contentMap),
    scenes,
    edges,
    screenTransitions,
    gaps,
    verification: parseVerification(record?.verification),
    pendingDocuments,
  }
}

/** 두 id 모두 서버가 정한 불투명한 값이므로 이스케이프만 하고 해석하지 않는다. */
export function contentMapPath(projectId: string, buildId: string, suffix = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}/game-builds/${encodeURIComponent(buildId)}/content-map${suffix}`
}

/** `GET .../content-map` — 이 빌드가 지금 어떤 모양인지. */
export async function getContentMap(
  projectId: string,
  buildId: string,
  signal?: AbortSignal,
): Promise<ContentMapView> {
  const response = await apiFetch(contentMapPath(projectId, buildId), { signal })
  return parseContentMapView(await readJson(response))
}
