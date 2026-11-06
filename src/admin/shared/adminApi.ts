import { apiFetch, UnauthorizedError } from '../../auth/authApi'

/*
 * Response helpers shared by every screen under `/admin`.
 *
 * They came over from admin-page with the screens. The request itself goes
 * through artel-home's own `apiFetch`, so session refresh and the global
 * unauthorized handler stay in one place; a 401 here signs the user out the
 * same way it does on every other console screen.
 */

export { apiFetch, UnauthorizedError }

/** The server refused, or the body did not match the contract. `status` 0 means no response was read. */
export class AdminApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

/** Reads the body as JSON. An error body has no guaranteed shape, so only the status is kept. */
export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new AdminApiError(response.status, `Request refused (HTTP ${response.status})`)
  }

  try {
    return await response.json()
  } catch {
    throw new AdminApiError(response.status, 'Response body is not JSON')
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AdminApiError(0, 'Response is not an object')
  }
  return value as Record<string, unknown>
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new AdminApiError(0, `Response has no ${field}`)
  }
  return value
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * A numeric field. Numeric strings are accepted too: `costUsd` is `NUMERIC` on
 * the server and may be serialized as a string, and silently turning that into
 * 0 would make every cost comparison wrong.
 */
export function asNumber(value: unknown, fallback: number): number {
  return asNullableNumber(value) ?? fallback
}

/** A number where null means "unknown", not 0. Cost and average duration are like this. */
export function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
