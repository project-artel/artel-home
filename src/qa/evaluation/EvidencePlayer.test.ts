import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { EvidencePlayer } from './EvidencePlayer'
import { evaluationCopy } from './evaluationCopy'

test('원본 45초에서 시작하는 TC도 controls는 0초와 TC 길이를 표시한다', () => {
  const html = renderToStaticMarkup(createElement(EvidencePlayer, { copy: evaluationCopy.ko,
    clips: [{ id: 'same-recording', from: 45, to: 60, startedAt: '2026-10-28T00:00:00Z',
      endedAt: '2026-10-28T00:01:00Z', state: 'READY', url: '/test-video.mp4' }] }))
  assert.match(html, /0:00 \/ 0:15/)
  assert.match(html, /aria-label="재생"/)
  assert.match(html, /type="range"[^>]*max="15"[^>]*value="0"/)
  assert.doesNotMatch(html, /<video[^>]*controls/)
})
