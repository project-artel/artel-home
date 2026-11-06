/**
 * The genre enum is closed and agreed with the orchestration server
 * (ARTEL-58). The `<select>` is generated from this list, so a value the
 * server does not accept can never be submitted.
 */
export const GENRES = [
  'ACTION',
  'RPG',
  'PUZZLE',
  'SIMULATION',
  'STRATEGY',
  'SPORTS',
  'SHOOTER',
  'CASUAL',
  'OTHER',
] as const

export type Genre = (typeof GENRES)[number]

/** `OTHER` is the escape hatch and the create-form default. */
export const DEFAULT_GENRE: Genre = 'OTHER'

export const NAME_MAX_LENGTH = 80
export const DESCRIPTION_MAX_LENGTH = 2000

/**
 * Planning documents are PDF only, and the ceiling is deliberately expressed in
 * decimal megabytes. The client is allowed to be stricter than the server but
 * never looser, and 50 * 1000 * 1000 is the smaller of the two readings of
 * "50 MB".
 */
export const DOCUMENT_MAX_BYTES = 50 * 1000 * 1000
export const DOCUMENT_CONTENT_TYPE = 'application/pdf'
export const DOCUMENT_ACCEPT = '.pdf,application/pdf'

export type DocumentUploader = {
  id: string
  displayName: string
}

/**
 * orchestration server 의 `ParseStatus` enum 값 그대로다 (ARTEL-759
 * cross-repository 계약). 이쪽에서 새 값을 만들지 않는다.
 */
export const PARSE_STATUSES = ['PENDING', 'EXTRACTING', 'EXTRACTED', 'FAILED'] as const

export type ParseStatus = (typeof PARSE_STATUSES)[number]

export type ProjectDocument = {
  id: string
  /**
   * 1-based and monotonic per project. Degraded to `0` when the server omits
   * it, which the UI reads as "no version to show" rather than "version zero".
   */
  version: number
  fileName: string
  contentType: string
  /** `0` when unknown; the UI hides the size rather than printing "0 B". */
  sizeBytes: number
  uploadedAt: string
  /** `null` when the server omits it — attribution is cosmetic, not required. */
  uploadedBy: DocumentUploader | null
  /**
   * 서버가 준 값을 그대로 읽고, `/documents/events` SSE (ARTEL-760) 로 계속
   * 최신 값을 유지한다. 모르는 값은 화면을 깨뜨리는 대신 `PENDING` 으로
   * 내려앉는다 — `projectApi.ts` 의 `isOneOf` 참고.
   */
  parseStatus: ParseStatus
  /**
   * `parseStatus` 가 `EXTRACTING` 인데 그 추출을 들고 있어야 할 서버가 그
   * 작업을 잃어버렸을 때만 `true` 다 — 보통 서버 재시작이다. 이 행은 굳은
   * 것이지 진행 중인 것이 아니다. "상태를 알 수 없음"으로 그리고, 진행
   * 중으로는 절대 그리지 않는다.
   */
  stale: boolean
}

/** 역할 선택지를 이 목록에서 만든다. 서버가 받지 않는 값을 고를 수 없게 하려는 것이다. */
export const PROJECT_ROLES = ['OWNER', 'MEMBER'] as const

/**
 * A user's role in one project. Users and projects are many-to-many, and
 * "ownership" is just a membership row with `OWNER`.
 *
 * Only an owner can delete. An unknown or missing value degrades to `MEMBER`,
 * which is the safe direction: it hides a destructive action rather than
 * offering one the server will refuse.
 */
export type ProjectRole = (typeof PROJECT_ROLES)[number]

export type ProjectSummary = {
  /** Opaque server-owned identifier. Never parsed, split, or used in arithmetic. */
  id: string
  name: string
  genre: Genre
  description: string | null
  documentCount: number
  latestDocument: ProjectDocument | null
  myRole: ProjectRole
  updatedAt: string
}

export type ProjectPage = {
  items: ProjectSummary[]
  page: number
  size: number
  total: number
}

/**
 * The detail response deliberately has no `documentCount`: the detail screen
 * loads the full version history anyway, so a second count would be a value
 * that can disagree with the list beside it.
 *
 * `document` is the latest version only; the full history is a separate call.
 */
export type ProjectDetail = {
  id: string
  name: string
  genre: Genre
  description: string | null
  myRole: ProjectRole
  document: ProjectDocument | null
  createdAt: string
  updatedAt: string
}

export type ProjectDraft = {
  name: string
  description: string
  genre: Genre
}

export type ProjectPatch = Partial<ProjectDraft>

export type UploadTicket = {
  uploadUrl: string
  objectKey: string
  requiredHeaders: Record<string, string>
  expiresAt: string
}

export type DownloadTicket = {
  downloadUrl: string
  expiresAt: string
}

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value)
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return value === 'OWNER' || value === 'MEMBER'
}
