import assert from 'node:assert/strict'
import test from 'node:test'
import { chatErrorText } from './chatErrors'

const messages = { llm: 'LLM', catalog: 'CATALOG', busy: 'BUSY', generic: 'GENERIC' }

test('모델 호출 오류는 원문 대신 안내 문구다', () => {
  const raw = "Error code: 401 - {'error': {'message': 'Missing Authentication header', 'code': 401}}"
  assert.equal(chatErrorText('llm_error', raw, messages), 'LLM')
})

test('모르는 code 와 검증 오류도 원문을 내지 않는다', () => {
  assert.equal(chatErrorText('validation_error', '1 validation error for ...', messages), 'GENERIC')
  assert.equal(chatErrorText('turn_failed', 'Traceback ...', messages), 'GENERIC')
  assert.equal(chatErrorText('', '', messages), 'GENERIC')
})

test('시한 초과는 오케스트레이션이 쓴 안내를 그대로 보인다', () => {
  assert.equal(chatErrorText('turn_timeout', '5분간 아무 소식이 없어 기다림을 끝냅니다.', messages), '5분간 아무 소식이 없어 기다림을 끝냅니다.')
  assert.equal(chatErrorText('turn_timeout', '', messages), 'GENERIC')
})

test('모델 목록 · 바쁨은 각자의 안내다', () => {
  assert.equal(chatErrorText('model_catalog_unavailable', 'x', messages), 'CATALOG')
  assert.equal(chatErrorText('busy', 'x', messages), 'BUSY')
})
