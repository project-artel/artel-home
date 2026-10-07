import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { messages } from '../i18n/messages'
import { AuthApiError } from './authApi'
import { loginErrorMessage, oauthErrorMessage, passwordChangeErrorMessage } from './passwordFormErrors'

const en = messages.en.common

describe('loginErrorMessage', () => {
  it('maps server codes', () => {
    assert.equal(loginErrorMessage(new AuthApiError(401, '', 'invalid_credentials'), 'signIn', en.login), en.login.errorInvalidCredentials)
    assert.equal(loginErrorMessage(new AuthApiError(429, '', 'too_many_attempts'), 'signIn', en.login), en.login.errorTooManyAttempts)
    assert.equal(loginErrorMessage(new AuthApiError(409, '', 'email_taken'), 'signUp', en.login), en.login.errorEmailTaken)
    assert.equal(loginErrorMessage(new AuthApiError(403, '', 'signup_closed'), 'signUp', en.login), en.login.errorSignupClosed)
    assert.equal(loginErrorMessage(new AuthApiError(400, '', 'invalid_password'), 'signUp', en.login), en.login.errorInvalidPassword)
  })
})

describe('passwordChangeErrorMessage', () => {
  it('maps server codes', () => {
    assert.equal(passwordChangeErrorMessage(new AuthApiError(400, '', 'invalid_current_password'), en.passwordChange), en.passwordChange.errorWrongCurrent)
    assert.equal(passwordChangeErrorMessage(new AuthApiError(409, '', 'password_not_set'), en.passwordChange), en.passwordChange.errorNotSet)
  })
})

describe('oauthErrorMessage', () => {
  it('explains the GitHub redirect codes', () => {
    assert.equal(oauthErrorMessage('disabled', en.login), en.login.errorAccountDisabled)
    assert.equal(oauthErrorMessage('signup_closed', en.login), en.login.errorSignupClosed)
    assert.equal(oauthErrorMessage('anything', en.login), en.login.errorGeneric)
  })
})
