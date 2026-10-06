import { AuthApiError, apiFetch, orchestrationUrlFor } from './authApi'

/**
 * Every email and password endpoint shape lives in this file, so a rename on
 * the server touches one module. The contract is the "API contract" table in
 * `.plan/general/2026-10-06-self-host-with-email-login-and-openrouter-key.md`.
 */

/** What the server reports about the ways this installation lets people sign in. */
export type AuthProviders = {
  password: boolean
  github: boolean
  /** True while the first account is pending or the operator opened public signup. */
  signupOpen: boolean
}

/**
 * Servers that predate `GET /api/auth/providers` only knew GitHub, so a failed
 * lookup falls back to showing the GitHub button next to the email form. The
 * alternative, hiding it, would lock out every GitHub-only deployment whenever
 * the lookup hiccups.
 */
export const FALLBACK_AUTH_PROVIDERS: AuthProviders = { password: true, github: true, signupOpen: false }

/** The shortest password the server accepts; it also rejects more than 72 bytes. */
export const PASSWORD_MIN_LENGTH = 8

export function parseAuthProviders(data: unknown): AuthProviders {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Malformed providers payload')
  }
  const { password, github, signupOpen } = data as Record<string, unknown>
  return {
    password: password !== false,
    github: github === true,
    signupOpen: signupOpen === true,
  }
}

export async function getAuthProviders(signal?: AbortSignal): Promise<AuthProviders> {
  try {
    const response = await fetch(orchestrationUrlFor('/api/auth/providers'), {
      credentials: 'include',
      signal,
    })
    if (!response.ok) return FALLBACK_AUTH_PROVIDERS
    return parseAuthProviders(await response.json())
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return FALLBACK_AUTH_PROVIDERS
  }
}

/** Reads `{code}` from an error body. The body is optional, so a parse failure yields `''`. */
async function refusal(response: Response, failure: string): Promise<AuthApiError> {
  let code = ''
  try {
    const body: unknown = await response.json()
    const value = (body as Record<string, unknown> | null)?.code
    if (typeof value === 'string') code = value
  } catch {
    // Keep the status-only error.
  }
  return new AuthApiError(response.status, failure, code)
}

async function postAnonymousJson(path: string, body: Record<string, string>, failure: string): Promise<void> {
  const response = await fetch(orchestrationUrlFor(path), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw await refusal(response, failure)
  }
}

/** Sets the session cookies on success. A wrong password or unknown email answers 401. */
export function loginWithPassword(email: string, password: string): Promise<void> {
  return postAnonymousJson('/api/auth/login', { email, password }, 'Unable to sign in')
}

/** Creates the account and sets the session cookies. The first account becomes the administrator. */
export function signUpWithPassword(email: string, password: string, name: string): Promise<void> {
  return postAnonymousJson('/api/auth/signup', { email, password, name }, 'Unable to sign up')
}

/** Clears `mustChangePassword` on the server (answers 204). Needs the session, so it goes through `apiFetch`. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await apiFetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!response.ok) {
    throw await refusal(response, 'Unable to change the password')
  }
}
