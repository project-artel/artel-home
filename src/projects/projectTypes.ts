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

export const GENRE_LABELS: Record<Genre, string> = {
  ACTION: 'Action',
  RPG: 'RPG',
  PUZZLE: 'Puzzle',
  SIMULATION: 'Simulation',
  STRATEGY: 'Strategy',
  SPORTS: 'Sports',
  SHOOTER: 'Shooter',
  CASUAL: 'Casual',
  OTHER: 'Other',
}

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
   * Reserved for a parsing pipeline that does not exist yet, so this is always
   * `PENDING`. Render it as a static label or not at all: never as a spinner or
   * a progress indicator, because nothing will ever advance it.
   */
  parseStatus: 'PENDING'
}

/**
 * A user's role in one project. Users and projects are many-to-many, and
 * "ownership" is just a membership row with `OWNER`.
 *
 * Only an owner can delete. An unknown or missing value degrades to `MEMBER`,
 * which is the safe direction: it hides a destructive action rather than
 * offering one the server will refuse.
 */
export type ProjectRole = 'OWNER' | 'MEMBER'

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
