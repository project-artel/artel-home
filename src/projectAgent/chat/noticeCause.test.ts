/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noticeKeyAction } from './noticeCause.ts'

test('user key causes link to the account page', () => {
  assert.deepEqual(noticeKeyAction('llm_key_missing', 'user', false), { keyLink: '/account' })
  assert.deepEqual(noticeKeyAction('llm_auth_failed', 'user', true), { keyLink: '/account' })
})

test('platform key causes link to admin settings only for an admin', () => {
  assert.deepEqual(noticeKeyAction('llm_key_missing', 'platform', true), { keyLink: '/admin/settings' })
  assert.deepEqual(noticeKeyAction('llm_key_missing', 'platform', false), { keyLink: null })
})

test('other causes and missing causes have no action', () => {
  assert.equal(noticeKeyAction('llm_rate_limited', 'user', true), null)
  assert.equal(noticeKeyAction(null, null, true), null)
  assert.deepEqual(noticeKeyAction('llm_auth_failed', null, true), { keyLink: null })
})
