/**
 * 한 게임 빌드의 콘텐츠 맵 — 서버가 증거 문서에서 뽑아낸 씬·능력·전이.
 *
 * `source`, `capture`, gap `reason` 은 모두 서버가 소유한 열린 어휘다. 이 빌드가 아는 값으로 좁혀 두면 서버가 값을 하나
 * 추가하는 날부터 화면이 그 항목을 조용히 버리거나 — 더 나쁘게 — 다른
 * 값으로 잘못 표시한다. 그래서 전부 평범한 문자열로 두고, 아래의 `KNOWN_*`
 * 목록은 오직 선 모양이나 라벨을 고를 때만 쓴다. 목록 밖의 값은 명시적인
 * "알 수 없음" 갈래를 타고, 서버가 말한 그대로 화면에 남는다.
 *
 * id 는 이 엔드포인트들에서 Long(숫자)로 온다. 문자열로 정규화해서 들고
 * 다니는 이유는 downstream 에서 전부 Map 키이자 React key 이기 때문이다.
 */

/** 이 빌드가 라벨을 붙일 줄 아는 능력 상태. 순서가 곧 요약 줄의 순서다. */
export const KNOWN_CAPABILITY_STATUSES = [
  'runnable',
  'needsProbe',
  'notAStep',
  'unreachablePrecondition',
] as const

/**
 * 한 씬의 능력 집계. 아는 네 상태와 그 합뿐이다.
 *
 * `capabilities` 안의 모르는 키는 읽지 않는다. 서버가 그 객체에 숫자 필드를
 * 하나 추가한다고 해서 그게 상태라는 보장이 없기 때문이다 — 버전이나 id 일
 * 수도 있다. 그런 값을 상태로 그리면 없는 상태를 하나 지어내는 동시에
 * `total` 까지 부풀린다. 상태 어휘가 실제로 늘어나면 그때 이 목록에 넣는다.
 */
export type CapabilityCounts = {
  total: number
  runnable: number
  needsProbe: number
  notAStep: number
  unreachablePrecondition: number
}

export type ContentMapScene = {
  id: string
  name: string
  /** QA 가 실제로 이 씬을 밟아 본 적이 있는지. */
  walked: boolean
  capabilities: CapabilityCounts
}

/**
 * 씬에서 씬으로 가는 전이 하나.
 *
 * `toSceneId` 가 null 이면 목적지가 이름으로만 알려져 있다는 뜻이다 —
 * 정적 분석이 씬 이름을 읽었지만 그 이름의 씬이 아직 콘텐츠 맵에 없다.
 * 그 전이를 버리면 화면은 "이 씬에서 나가는 길이 없다"고 잘못 말하게 된다.
 */
export type SceneTransition = {
  fromSceneId: string
  toSceneName: string
  toSceneId: string | null
  capabilityId: string | null
  /** `static` | `runtime`, 그리고 서버가 나중에 추가할 무엇이든. */
  source: string
  /** 런타임으로 확인된 시각. null 이면 아직 확인되지 않은 전이다. */
  verifiedAt: string | null
}

/** 이 빌드가 선 모양을 정해 둔 전이 출처. */
export const KNOWN_EDGE_SOURCES = ['static', 'runtime'] as const

export type KnownEdgeSource = (typeof KNOWN_EDGE_SOURCES)[number]

/** 선을 어떤 패턴으로 그릴지. 모르는 출처는 하나의 정직한 갈래로 모은다. */
export type EdgeSourceStyle = KnownEdgeSource | 'unknown'

export function edgeSourceStyle(source: string): EdgeSourceStyle {
  return (KNOWN_EDGE_SOURCES as readonly string[]).includes(source)
    ? (source as KnownEdgeSource)
    : 'unknown'
}

/**
 * 서버가 기록한 결손 사유와 그 개수.
 *
 * `reason` 어휘는 아직 공개되지 않았다. 그래서 번역하지 않고 서버가 쓴
 * 문자열을 그대로 보여 준다 — 추측한 라벨은 없는 뜻을 만들어 낸다.
 */
export type ContentMapGap = {
  reason: string
  count: number
}

export type ContentMapVerification = {
  verified: number
  total: number
}

/**
 * 아직 콘텐츠 맵에 반영되지 않은 문서.
 *
 * `ingestFailedAt` 이 있으면 시도했다가 실패한 것이고, 없으면 아직 시도하지
 * 않은 것이다. 두 사실은 사용자가 할 일이 다르므로 합치지 않는다.
 */
export type PendingDocument = {
  documentId: string
  receivedAt: string
  ingestFailedAt: string | null
  ingestError: string | null
}

/**
 * 콘텐츠 맵 자체의 머리말.
 *
 * `ingestedAt === null` 은 "업로드는 됐지만 아직 읽히지 않았다"는 뜻이고,
 * 이 객체 전체가 null 인 것(= 한 번도 올린 적 없음)과 다른 상태다.
 */
export type ContentMapHeader = {
  id: string
  /** 캡처 식별자. 형식이 명세에 없어 문자열로 두고 그대로 보여 준다. */
  capture: string
  schemaVersion: string
  evidenceDigest: string
  unity: string | null
  platform: string | null
  sdkVersion: string | null
  ingestedAt: string | null
}

/** `GET .../content-map` 가 돌려주는 것 전부. */
export type ContentMapView = {
  contentMap: ContentMapHeader | null
  scenes: ContentMapScene[]
  edges: SceneTransition[]
  gaps: ContentMapGap[]
  verification: ContentMapVerification
  pendingDocuments: PendingDocument[]
}

/** 씬 여럿의 능력 집계를 하나로 더한다. */
export function sumCapabilities(scenes: readonly ContentMapScene[]): CapabilityCounts {
  const total: CapabilityCounts = {
    total: 0,
    runnable: 0,
    needsProbe: 0,
    notAStep: 0,
    unreachablePrecondition: 0,
  }

  for (const scene of scenes) {
    total.total += scene.capabilities.total
    for (const status of KNOWN_CAPABILITY_STATUSES) {
      total[status] += scene.capabilities[status]
    }
  }

  return total
}
