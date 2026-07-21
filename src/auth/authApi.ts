import type { AuthUser } from './authTypes'

const orchestrationUrl = (import.meta.env.VITE_ORCHESTRATION_URL ?? 'http://localhost:8080').replace(/\/$/, '')

export function getOAuthLoginUrl(path: string): string {
  return `${orchestrationUrl}${path}`
}

export class UnauthorizedError extends Error {
  constructor() {
    super('The session is no longer valid')
    this.name = 'UnauthorizedError'
  }
}

let unauthorizedHandler: (() => void) | null = null

/**
 * Registers the single listener notified when any authenticated call is
 * rejected with 401. Access tokens expire after 15 minutes, so expiry during
 * an active session is routine and must return the app to the login boundary.
 */
export function setUnauthorizedHandler(handler: () => void): () => void {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) {
      unauthorizedHandler = null
    }
  }
}

/**
 * Performs a credentialed call against the orchestration server. Every
 * authenticated request must go through here so session expiry is handled in
 * one place. `getCurrentUser` deliberately bypasses it: a 401 there means
 * "not signed in yet", not "the session just expired".
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${orchestrationUrl}${path}`, {
    ...init,
    credentials: 'include',
  })

  if (response.status === 401) {
    unauthorizedHandler?.()
    throw new UnauthorizedError()
  }

  return response
}

function parseAuthUser(data: unknown): AuthUser {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Malformed session payload')
  }

  const record = data as Record<string, unknown>
  const { id, provider, login, displayName, avatarUrl } = record

  if (
    typeof id !== 'string' ||
    typeof provider !== 'string' ||
    typeof login !== 'string' ||
    typeof displayName !== 'string' ||
    (avatarUrl !== null && typeof avatarUrl !== 'string')
  ) {
    throw new Error('Malformed session payload')
  }

  return { id, provider, login, displayName, avatarUrl }
}

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  const response = await fetch(`${orchestrationUrl}/api/auth/me`, {
    credentials: 'include',
    signal,
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error('Unable to check the current session')
  }

  return parseAuthUser(await response.json())
}

export async function endSession(): Promise<void> {
  const response = await fetch(`${orchestrationUrl}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok && response.status !== 401) {
    throw new Error('Unable to end the current session')
  }
}
