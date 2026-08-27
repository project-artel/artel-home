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

/**
 * 서버가 정규화해서 보내는 조건 트리의 마디 하나.
 *
 * 명세는 두 가지를 약속한다: `kind` 는 늘 소문자이고, 이름표 없는 마디는
 * 오지 않는다. 그 약속이 있기 때문에 이 화면은 **다시 관대해지지 않는다** —
 * 목록에 없는 `kind` 를 아는 모양으로 접으면 서버가 말하지 않은 조건을
 * 화면이 지어내게 되고, 그 줄을 읽은 QA 는 반대로 된 테스트 케이스를 쓴다.
 * 모르는 값은 `unrecognisedKind` 로 남아서 서버가 뭐라고 했는지 그대로
 * 보인다.
 *
 * `unrecognisedKind` 에 대문자가 섞인 것은 우연이 아니다. 소문자 `kind` 만
 * 온다는 약속 덕분에 이 이름은 서버가 보낸 어떤 값과도 겹칠 수 없고, 그래서
 * 서버가 나중에 어휘를 늘려도 이 갈래를 조용히 덮어쓰지 못한다.
 *
 * `unknown` 과 `always` 는 절대 같은 모양으로 그리지 않는다. `always` 는
 * "아무 때나 된다"는 사실이고 `unknown` 은 "우리가 못 읽었다"는 사실이다.
 * 둘을 섞으면 조건 없는 단계와 조건을 모르는 단계가 한 줄로 보인다.
 */
export type ConditionNode =
  | { kind: 'always' }
  | {
      kind: 'test'
      left: string
      operator: string
      right: string
      context: string | null
      /** 서버가 좌변의 주체를 놓친 자리. 있으면 그 조건은 반쪽만 읽힌 것이다. */
      subjectLost: string | null
      offset: number
    }
  | { kind: 'gesture'; input: string; offset: number }
  | { kind: 'every' | 'either'; parts: ConditionNode[] }
  | { kind: 'unknown'; reason: string; unread: string | null }
  | { kind: 'unrecognisedKind'; reportedKind: string }

/** 마디의 갈래로 CSS 한 조각을 고른다. 색은 반복일 뿐이고 이름은 늘 글로 적힌다. */
export type ConditionKind = ConditionNode['kind']

/**
 * 씬에서 할 수 있는 조작 하나.
 *
 * `status` 와 `interaction` 은 서버가 쓴 철자를 그대로 들고 다닌다. 아는
 * 값으로 좁혀 두면 서버가 어휘를 늘리는 날 화면이 그 단계를 조용히 다른
 * 것으로 부른다. 라벨을 고를 때만 아래 `stepStatusStyle` · `interactionStyle`
 * 을 쓰고, 목록에 없으면 서버 문자열이 그대로 화면에 남는다.
 *
 * `notAStep` 인 기능은 여기 오지 않는다. 단계가 아닌 것을 단계 목록에 넣지
 * 않는다는 것이 서버 쪽 규칙이고, 그래서 `steps.length` 는 대체로
 * `capabilities.total` 보다 작다.
 */
export type ContentMapStep = {
  id: string
  summary: string
  /** `runnable` | `needs-probe` | `unreachable-precondition`, 그리고 무엇이든. */
  status: string
  /** `click` | `press` | `drag` | `none`, 그리고 무엇이든. */
  interaction: string
  inputKey: string | null
  controlLabel: string | null
  controlPath: string | null
  /**
   * 조건을 사람이 읽는 한 문장으로 옮긴 것. 지금은 늘 null 이고 ARTEL-447 이
   * 채운다. 화면은 이것이 있으면 이것을 먼저 쓰므로, 그날 아무것도 고치지
   * 않아도 조건 줄이 트리에서 문장으로 바뀐다.
   */
  givenText: string | null
  given: ConditionNode | null
}

/** 이 빌드가 라벨을 붙일 줄 아는 단계 상태. 요약 줄의 상태 이름과 같은 것들이다. */
export type StepStatusStyle =
  | 'runnable'
  | 'needsProbe'
  | 'unreachablePrecondition'
  | 'unknown'

/*
 * 서버는 상태를 kebab-case 로 보내고 요약 줄은 camelCase 키로 센다. 두 철자를
 * 잇는 표는 여기 하나뿐이다 — 화면 여기저기서 문자열을 바꿔 쓰기 시작하면
 * 어느 쪽이 서버 어휘인지 아무도 모르게 된다.
 */
const STEP_STATUS_STYLES = new Map<string, StepStatusStyle>([
  ['runnable', 'runnable'],
  ['needs-probe', 'needsProbe'],
  ['unreachable-precondition', 'unreachablePrecondition'],
])

export function stepStatusStyle(status: string): StepStatusStyle {
  return STEP_STATUS_STYLES.get(status) ?? 'unknown'
}

/** 이 빌드가 이름을 아는 상호작용. 목록 밖의 값은 서버 철자 그대로 보인다. */
export const KNOWN_INTERACTIONS = ['click', 'press', 'drag', 'none'] as const

export type KnownInteraction = (typeof KNOWN_INTERACTIONS)[number]

export type InteractionStyle = KnownInteraction | 'unknown'

export function interactionStyle(interaction: string): InteractionStyle {
  return (KNOWN_INTERACTIONS as readonly string[]).includes(interaction)
    ? (interaction as KnownInteraction)
    : 'unknown'
}

/**
 * 한 단계의 조건을 무엇으로 그릴지.
 *
 * **순서가 계약이다.** `givenText` 가 있으면 그것을 쓰고, 없을 때만 트리를
 * 그린다. ARTEL-447 이 문장을 채우는 날 이 함수 하나 때문에 화면이 저절로
 * 좋아지고, 그 전까지는 트리가 그 자리를 지킨다.
 *
 * 문장이 있어도 트리를 같이 들려 보낸다. 화면은 그것을 접어 두었다가 사용자가
 * 펼칠 때만 보여 준다 — 요약을 먼저 보이고 원본은 명시적으로 펼치게 하라는
 * `DESIGN.md` 의 규칙 그대로다.
 */
export type StepCondition =
  | { form: 'sentence'; text: string; tree: ConditionNode | null }
  | { form: 'tree'; tree: ConditionNode }
  | { form: 'none' }

export function stepCondition(step: ContentMapStep): StepCondition {
  const text = step.givenText?.trim() ?? ''
  if (text.length > 0) return { form: 'sentence', text, tree: step.given }
  if (step.given !== null) return { form: 'tree', tree: step.given }
  // 조건 절이 아예 없다. `always` 와 다르다 — 저쪽은 서버가 "아무 때나 된다"고
  // 말한 것이고 이쪽은 아무 말도 하지 않은 것이다.
  return { form: 'none' }
}

/**
 * 씬 대표 이미지, 또는 만들지 못한 이유.
 *
 * **세 상태를 가른다.** `thumbnail` 자체가 null 이면 서버가 캡처를 아예
 * 신고하지 않은 것이고 — 이 절을 보내지 않는 옛 서버이거나, 캡처를 올리지
 * 않는 옛 SDK 다 — `unavailable` 은 시도했다가 못 찍었다는 사실이다. 둘을
 * 같은 자리표시로 그리면 "아직 안 올렸다"와 "이 씬은 못 찍는다"가 한 모양이
 * 되고, 사용자는 기다려야 할지 고쳐야 할지 알 수 없다.
 *
 * `url` 은 서명된 단기 주소다. 만료되면 이미지가 깨지므로 화면은 그 실패를
 * 자리표시로 받아 낸다 — 깨진 이미지 아이콘은 사실을 말하지 않는다.
 */
export type SceneThumbnail =
  | { state: 'available'; url: string; width: number | null; height: number | null }
  | { state: 'unavailable'; reason: string }

export type ContentMapScene = {
  id: string
  name: string
  /** QA 가 실제로 이 씬을 밟아 본 적이 있는지. */
  walked: boolean
  capabilities: CapabilityCounts
  /**
   * 이 씬에서 할 수 있는 조작들.
   *
   * `null` 과 빈 배열은 다른 사실이다. `null` 은 응답에 `steps` 절이 아예
   * 없다는 뜻이고 — 이 절을 아직 보내지 않는 서버다 — 그때 화면은 그 절을
   * 통째로 그리지 않는다. 빈 배열은 서버가 "이 씬에는 단계가 없다"고 말한
   * 것이고, 그건 화면에 적을 값어치가 있는 사실이다.
   */
  steps: ContentMapStep[] | null
  /** 대표 이미지. null 이면 서버가 이 씬에 대해 캡처를 말하지 않았다. */
  thumbnail: SceneThumbnail | null
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
  /**
   * 이 전이가 일어나는 조건. 단계 쪽 `given` 과 같은 트리다.
   *
   * null 은 "조건 없음"이 아니라 "조건 근거가 없음"이다. 자동 전이에는 기능이
   * 없어 조건도 없고, 그 사실은 `always` 와 다르다.
   */
  given: ConditionNode | null
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
