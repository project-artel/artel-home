import { apiFetch } from '../auth/authApi'
import {
  isGenre,
  isProjectRole,
  type DocumentUploader,
  type DownloadTicket,
  type Genre,
  type ProjectDetail,
  type ProjectDocument,
  type ProjectDraft,
  type ProjectPage,
  type ProjectPatch,
  type ProjectRole,
  type ProjectSummary,
  type UploadTicket,
} from './projectTypes'

/**
 * A failure the server described. `fields` carries the per-input messages from
 * a `400`; components render those inline and fall back to `message`.
 */
export class ProjectApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly fields: Record<string, string>

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ProjectApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }

  /** Not a member — the server will not even confirm the project exists. */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** A member, but not an owner. Only `DELETE` can produce this. */
  get isForbidden(): boolean {
    return this.status === 403
  }
}

/*
 * The helpers below are exported so sibling API modules (`gameApi.ts`) share
 * one error type, one error-mapping rule, and one tolerant-parsing vocabulary.
 * They are deliberately not moved to a neutral module: every one of them is
 * about the project-scoped API this file defines, and a second copy is how the
 * two would drift on something that matters, like which status codes carry
 * field errors.
 */

export function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Non-negative integers only; anything else degrades to `fallback`. */
function asCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function asGenre(value: unknown): Genre {
  return isGenre(value) ? value : 'OTHER'
}

/** `fields` is only useful when every entry is a printable string. */
function asFieldErrors(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (record === null) return {}

  const fields: Record<string, string> = {}
  for (const [key, message] of Object.entries(record)) {
    if (typeof message === 'string' && message.length > 0) {
      fields[key] = message
    }
  }
  return fields
}

function asHeaders(value: unknown): Record<string, string> {
  return asFieldErrors(value)
}

/*
 * Errors this module detects itself carry a `CLIENT_*` code so components can
 * localize them via `apiErrorMessage`. The English message stays as a fallback
 * for render sites that print `error.message` directly.
 */
const genericFailureMessage = 'The request could not be completed. Please try again.'

/**
 * Turns a non-OK response into a `ProjectApiError`. A body that is missing,
 * empty, or not JSON is normal for a 5xx behind a proxy, so it must not throw
 * a second, less useful error on top of the first.
 */
export async function toApiError(response: Response): Promise<ProjectApiError> {
  let code: string | null = null
  let message = ''
  let fields: Record<string, string> = {}

  try {
    const body = asRecord(await response.json())
    if (body !== null) {
      code = asNullableString(body.code)
      message = asString(body.message)
      fields = asFieldErrors(body.fields)
    }
  } catch {
    // Keep the generic message below.
  }

  return new ProjectApiError(
    response.status,
    message.length > 0 ? message : genericFailureMessage,
    // A body with neither message nor code gets the client's generic wording,
    // so the code follows it; a server-provided code is never overwritten.
    code ?? (message.length > 0 ? null : 'CLIENT_GENERIC'),
    fields,
  )
}

export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw await toApiError(response)
  }

  try {
    return await response.json()
  } catch {
    throw new ProjectApiError(
      response.status,
      'The server returned an unreadable response.',
      'CLIENT_UNREADABLE_RESPONSE',
    )
  }
}

export function jsonRequest(body: unknown): RequestInit {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function parseUploader(data: unknown): DocumentUploader | null {
  const record = asRecord(data)
  if (record === null) return null

  const displayName = asNullableString(record.displayName)
  if (displayName === null) return null

  return { id: asString(record.id), displayName }
}

/**
 * Only `id` and `fileName` are required, because those are what identifies a
 * version to the user and what every action needs. Version, size, timestamp,
 * and uploader all degrade to values the UI knows how to hide.
 */
function parseDocument(data: unknown): ProjectDocument | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const fileName = asNullableString(record.fileName)
  if (id === null || fileName === null) return null

  return {
    id,
    version: asCount(record.version),
    fileName,
    contentType: asString(record.contentType),
    sizeBytes: asCount(record.sizeBytes),
    uploadedAt: asString(record.uploadedAt),
    uploadedBy: parseUploader(record.uploadedBy),
    parseStatus: 'PENDING',
  }
}

/** Anything but a recognised role is read as `MEMBER`, hiding owner-only actions. */
function asRole(value: unknown): ProjectRole {
  return isProjectRole(value) ? value : 'MEMBER'
}

/**
 * Only `id` and `name` are required. A row missing anything else still renders
 * usefully, and dropping a whole page of projects over one cosmetic field
 * would leave the user with no way forward.
 */
function parseSummary(data: unknown): ProjectSummary | null {
  const record = asRecord(data)
  if (record === null) return null

  const id = asNullableString(record.id)
  const name = asNullableString(record.name)
  if (id === null || name === null) return null

  return {
    id,
    name,
    genre: asGenre(record.genre),
    description: asNullableString(record.description),
    documentCount: asCount(record.documentCount),
    latestDocument: parseDocument(record.latestDocument),
    myRole: asRole(record.myRole),
    updatedAt: asString(record.updatedAt),
  }
}

function parseDetail(data: unknown): ProjectDetail {
  const record = asRecord(data)
  const id = asNullableString(record?.id)
  const name = asNullableString(record?.name)

  if (record === null || id === null || name === null) {
    throw new ProjectApiError(
      200,
      'The server returned a project without an id or a name.',
      'CLIENT_MALFORMED_PROJECT',
    )
  }

  return {
    id,
    name,
    genre: asGenre(record.genre),
    description: asNullableString(record.description),
    myRole: asRole(record.myRole),
    document: parseDocument(record.document),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt),
  }
}

/**
 * `total` falls back to the number of items actually parsed so a malformed
 * count can never convince "Load more" that another page exists.
 */
function parsePage(data: unknown, requestedPage: number, requestedSize: number): ProjectPage {
  const record = asRecord(data)
  const rawItems = record !== null && Array.isArray(record.items) ? record.items : []
  const items = rawItems
    .map(parseSummary)
    .filter((item): item is ProjectSummary => item !== null)

  return {
    items,
    page: asCount(record?.page, requestedPage),
    size: asCount(record?.size, requestedSize),
    total: asCount(record?.total, items.length),
  }
}

function parseDocumentList(data: unknown): ProjectDocument[] {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.items)
      ? (asRecord(data)?.items as unknown[])
      : []

  return list
    .map(parseDocument)
    .filter((document): document is ProjectDocument => document !== null)
}

function parseUploadTicket(data: unknown): UploadTicket {
  const record = asRecord(data)
  const uploadUrl = asNullableString(record?.uploadUrl)
  const objectKey = asNullableString(record?.objectKey)

  if (uploadUrl === null || objectKey === null) {
    throw new ProjectApiError(
      200,
      'The server did not return a usable upload location.',
      'CLIENT_MALFORMED_UPLOAD_TICKET',
    )
  }

  return {
    uploadUrl,
    objectKey,
    requiredHeaders: asHeaders(record?.requiredHeaders),
    expiresAt: asString(record?.expiresAt),
  }
}

function parseDownloadTicket(data: unknown): DownloadTicket {
  const record = asRecord(data)
  // The contract names this `downloadUrl`; `url` is accepted as well so a
  // narrower server field name cannot break the only action on the panel.
  const downloadUrl = asNullableString(record?.downloadUrl) ?? asNullableString(record?.url)

  if (downloadUrl === null) {
    throw new ProjectApiError(
      200,
      'The server did not return a download link.',
      'CLIENT_MALFORMED_DOWNLOAD_TICKET',
    )
  }

  return { downloadUrl, expiresAt: asString(record?.expiresAt) }
}

/** Project and document IDs are opaque strings, so they are escaped, not parsed. */
export function projectPath(projectId: string, suffix = ''): string {
  return `/api/projects/${encodeURIComponent(projectId)}${suffix}`
}

export async function listProjects(options: {
  page: number
  size: number
  signal?: AbortSignal
}): Promise<ProjectPage> {
  const query = new URLSearchParams({
    page: String(options.page),
    size: String(options.size),
  })
  const response = await apiFetch(`/api/projects?${query.toString()}`, { signal: options.signal })
  return parsePage(await readJson(response), options.page, options.size)
}

export async function createProject(draft: ProjectDraft): Promise<ProjectDetail> {
  const response = await apiFetch('/api/projects', {
    method: 'POST',
    ...jsonRequest(draft),
  })
  return parseDetail(await readJson(response))
}

export async function getProject(projectId: string, signal?: AbortSignal): Promise<ProjectDetail> {
  const response = await apiFetch(projectPath(projectId), { signal })
  return parseDetail(await readJson(response))
}

export async function updateProject(projectId: string, patch: ProjectPatch): Promise<ProjectDetail> {
  const response = await apiFetch(projectPath(projectId), {
    method: 'PATCH',
    ...jsonRequest(patch),
  })
  return parseDetail(await readJson(response))
}

/**
 * A soft delete on the server. Every later read returns `404`, so the UI must
 * treat this as final: there is no restore path to offer.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await apiFetch(projectPath(projectId), { method: 'DELETE' })
  if (!response.ok) {
    throw await toApiError(response)
  }
}

export async function createUploadTicket(
  projectId: string,
  file: { fileName: string; contentType: string; sizeBytes: number },
): Promise<UploadTicket> {
  const response = await apiFetch(projectPath(projectId, '/documents/upload-url'), {
    method: 'POST',
    ...jsonRequest(file),
  })
  return parseUploadTicket(await readJson(response))
}

/**
 * Registers the object the browser just uploaded. Only after this call does a
 * document version exist; an unregistered object is garbage the server reaps.
 */
export async function registerDocument(
  projectId: string,
  objectKey: string,
): Promise<ProjectDocument> {
  const response = await apiFetch(projectPath(projectId, '/documents'), {
    method: 'POST',
    ...jsonRequest({ objectKey }),
  })

  const document = parseDocument(await readJson(response))
  if (document === null) {
    throw new ProjectApiError(
      201,
      'The document was stored but the server described it oddly.',
      'CLIENT_MALFORMED_DOCUMENT',
    )
  }
  return document
}

/** Newest version first, per the contract. */
export async function listDocuments(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectDocument[]> {
  const response = await apiFetch(projectPath(projectId, '/documents'), { signal })
  return parseDocumentList(await readJson(response))
}

/**
 * Resolved on click so a presigned URL is never baked into the DOM, where it
 * would outlive its own expiry and leak through a copied link.
 */
export async function createDownloadTicket(
  projectId: string,
  documentId: string,
): Promise<DownloadTicket> {
  const response = await apiFetch(
    projectPath(projectId, `/documents/${encodeURIComponent(documentId)}/download-url`),
  )
  return parseDownloadTicket(await readJson(response))
}
