import { apiFetch } from '../auth/authApi'
import {
  asNullableString,
  asRecord,
  asString,
  isOneOf,
  ProjectApiError,
  readJson,
} from '../projects/projectApi'

/*
 * The knowledge entries and macros a QA run created, updated, or deleted, and
 * the call that reverts one of them.
 *
 *   GET  /api/qa-runs/:qaRunId/changes
 *   POST /api/qa-runs/:qaRunId/changes/:kind/:targetId/revert
 *
 * `:kind` in the path is lower case (`knowledge` | `macro`); `kind` in the body
 * is upper case. The revert answers 409 when the item is no longer revertible,
 * and the body's `message` is the reason shown to the person.
 */

export const QA_CHANGE_KINDS = ['KNOWLEDGE', 'MACRO'] as const
export type QaChangeKind = (typeof QA_CHANGE_KINDS)[number]

export const QA_CHANGE_TYPES = ['CREATE', 'UPDATE', 'DELETE'] as const
export type QaChangeType = (typeof QA_CHANGE_TYPES)[number]

export const QA_CHANGE_DECISIONS = ['APPLIED', 'REVERTED'] as const
export type QaChangeDecision = (typeof QA_CHANGE_DECISIONS)[number]

export const QA_CHANGE_BLOCK_REASONS = ['SUPERSEDED', 'ALREADY_REVERTED', 'BEFORE_UNKNOWN'] as const
export type QaChangeBlockReason = (typeof QA_CHANGE_BLOCK_REASONS)[number]

export interface QaChange {
  kind: QaChangeKind
  targetId: string
  name: string
  change: QaChangeType
  /** Text before the run; null for CREATE. */
  before: string | null
  /** Text after the run; null for DELETE. */
  after: string | null
  qaTryId: string | null
  changedAt: string
  decision: QaChangeDecision
  revertible: boolean
  notRevertibleReason: QaChangeBlockReason | null
}

const QA_RUNS_ROOT = '/api/qa-runs'

function asId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * One item, or null when it cannot be identified (kind, target, or change type
 * missing or unknown). Everything else degrades: an unknown `decision` reads as
 * APPLIED and an unknown reason as none, so one odd field does not hide a change
 * a person might want to revert.
 */
export function parseQaChange(data: unknown): QaChange | null {
  const record = asRecord(data)
  if (record === null) return null

  const targetId = asId(record.targetId)
  if (!isOneOf(record.kind, QA_CHANGE_KINDS) || targetId === null || !isOneOf(record.change, QA_CHANGE_TYPES)) {
    return null
  }

  const decision = isOneOf(record.decision, QA_CHANGE_DECISIONS) ? record.decision : 'APPLIED'
  const reason = isOneOf(record.notRevertibleReason, QA_CHANGE_BLOCK_REASONS)
    ? record.notRevertibleReason
    : null

  return {
    kind: record.kind,
    targetId,
    name: asString(record.name),
    change: record.change,
    before: asNullableString(record.before),
    after: asNullableString(record.after),
    qaTryId: asId(record.qaTryId),
    changedAt: asString(record.changedAt),
    decision,
    // Revertible only while applied; the server says the same, this keeps a
    // contradictory payload from showing a button that can only fail.
    revertible: record.revertible === true && decision === 'APPLIED',
    notRevertibleReason: reason,
  }
}

/** The `{ items: [...] }` envelope; items that cannot be identified are dropped. */
export function parseQaChangeList(data: unknown): QaChange[] {
  const items = asRecord(data)?.items
  if (!Array.isArray(items)) {
    throw new ProjectApiError(200, 'The server returned an unreadable response.', 'CLIENT_UNREADABLE_RESPONSE')
  }
  return items.flatMap((raw) => {
    const change = parseQaChange(raw)
    return change === null ? [] : [change]
  })
}

export function qaChangeKey(change: Pick<QaChange, 'kind' | 'targetId'>): string {
  return `${change.kind}:${change.targetId}`
}

function changesPath(qaRunId: string): string {
  return `${QA_RUNS_ROOT}/${encodeURIComponent(qaRunId)}/changes`
}

/** `GET /api/qa-runs/:id/changes` — oldest change first, as the server orders them. */
export async function listQaChanges(qaRunId: string, signal?: AbortSignal): Promise<QaChange[]> {
  const response = await apiFetch(changesPath(qaRunId), { signal })
  return parseQaChangeList(await readJson(response))
}

/**
 * `POST …/changes/:kind/:targetId/revert` — resolves to the updated item.
 * A 409 rejects with a `ProjectApiError` whose `message` is the server's reason.
 */
export async function revertQaChange(
  qaRunId: string,
  change: Pick<QaChange, 'kind' | 'targetId'>,
): Promise<QaChange> {
  const path = `${changesPath(qaRunId)}/${change.kind.toLowerCase()}/${encodeURIComponent(change.targetId)}/revert`
  const response = await apiFetch(path, { method: 'POST' })
  const updated = parseQaChange(await readJson(response))
  if (updated === null) {
    throw new ProjectApiError(response.status, 'The server returned an unreadable response.', 'CLIENT_UNREADABLE_RESPONSE')
  }
  return updated
}
