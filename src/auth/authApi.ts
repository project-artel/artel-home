import type { AuthUser } from './authTypes'

const orchestrationUrl = (import.meta.env.VITE_ORCHESTRATION_URL ?? 'http://localhost:8080').replace(/\/$/, '')

export function getOAuthLoginUrl(path: string): string {
  return `${orchestrationUrl}${path}`
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
