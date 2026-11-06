import { AuthApiError } from './authApi'
import type { Messages } from '../i18n/messages'

type LoginMessages = Messages['common']['login']
type PasswordChangeMessages = Messages['common']['passwordChange']

/**
 * Maps a failed email call to a message by the server's `code`, falling back to
 * the status for a body that carried none.
 */
export function loginErrorMessage(error: unknown, mode: 'signIn' | 'signUp', copy: LoginMessages): string {
  if (!(error instanceof AuthApiError)) return copy.errorGeneric
  if (error.code === 'too_many_attempts' || error.status === 429) return copy.errorTooManyAttempts
  switch (error.code) {
    case 'invalid_credentials': return copy.errorInvalidCredentials
    case 'account_disabled': return copy.errorAccountDisabled
    case 'signup_closed': return copy.errorSignupClosed
    case 'email_taken': return copy.errorEmailTaken
    case 'invalid_email': return copy.errorInvalidEmail
    case 'invalid_password': return copy.errorInvalidPassword
    case 'invalid_name': return copy.errorInvalidName
  }
  if (mode === 'signIn') {
    if (error.status === 401) return copy.errorInvalidCredentials
    if (error.status === 403) return copy.errorAccountDisabled
    return copy.errorGeneric
  }
  if (error.status === 409) return copy.errorEmailTaken
  if (error.status === 403) return copy.errorSignupClosed
  if (error.status === 400) return copy.errorInvalidInput
  return copy.errorGeneric
}

export function passwordChangeErrorMessage(error: unknown, copy: PasswordChangeMessages): string {
  if (!(error instanceof AuthApiError)) return copy.errorGeneric
  switch (error.code) {
    case 'invalid_current_password': return copy.errorWrongCurrent
    case 'invalid_password': return copy.errorRejected
    case 'same_password': return copy.errorSame
    case 'password_not_set': return copy.errorNotSet
  }
  if (error.status === 400) return copy.errorRejected
  return copy.errorGeneric
}

/** The `?error=` values the server's GitHub callback appends to `/login`. */
export function oauthErrorMessage(code: string, login: LoginMessages): string {
  if (code === 'oauth') return login.errorOauth
  if (code === 'server') return login.errorServer
  if (code === 'disabled') return login.errorAccountDisabled
  if (code === 'signup_closed') return login.errorSignupClosed
  return login.errorGeneric
}
