import assert from 'node:assert/strict'
import test from 'node:test'
import { sendRunChatMessage } from './runChatApi'

// 챗봇에서 고른 모델(ARTEL-1428)은 QA 실행과 같은 `model` · `keySource` 로 메시지에 실린다. 고르지 않으면 두 칸 모두
// 안 나가야 서버가 지금처럼 기본 모델 · 공용 키로 돈다.

async function sentBody(run: () => Promise<void>): Promise<Record<string, unknown>> {
  const originalFetch = globalThis.fetch
  let body: Record<string, unknown> = {}
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = JSON.parse(String(init?.body ?? '{}'))
    return new Response('메시지 전송 완료', { status: 200 })
  }) as typeof fetch
  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
  }
  return body
}

test('고른 모델은 model · keySource 로 실린다', async () => {
  const body = await sentBody(() =>
    sendRunChatMessage('2', '9', '만들어줘', false, undefined, false, [], { model: 'claude/claude-sonnet-5-5', keySource: 'user' }),
  )
  assert.equal(body.model, 'claude/claude-sonnet-5-5')
  assert.equal(body.keySource, 'user')
})

test('고르지 않으면 두 칸 모두 안 나간다', async () => {
  const body = await sentBody(() => sendRunChatMessage('2', '9', '만들어줘', false))
  assert.equal('model' in body, false)
  assert.equal('keySource' in body, false)
})
