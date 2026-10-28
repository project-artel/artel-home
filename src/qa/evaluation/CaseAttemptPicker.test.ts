import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CaseAttemptPicker } from './CaseAttemptPicker'
import { groupCaseAttempts } from './caseAttemptGroups'
import { evaluationCopy } from './evaluationCopy'
import type { Attempt } from './evaluationApi'

function attempt(id: string, testCaseId: string, time: number): Attempt {
  return { id, testCaseId, qaTryId: '6', startedAt: null, finishedAt: null,
    createdAt: new Date(Date.UTC(2026, 9, 28, 0, 0, time)).toISOString(),
    verdict: 'PASSED', logId: null, review: null, note: null,
    caseSnapshot: { scene: null, precondition: null, step: `절차 ${testCaseId}`, expected: null } }
}
function render(options: Attempt[], current: Attempt) {
  return renderToStaticMarkup(createElement(CaseAttemptPicker, {
    id: 'picker', options, current, onSelect: () => {}, copy: evaluationCopy.ko,
  }))
}

test('TC를 중복 없이 자연수 순으로 표시하고 오래된 직접 링크보다 최신 시도를 우선한다', () => {
  const old = attempt('old', '2', 0)
  const latest = attempt('latest', '2', 10)
  const rows = [old, attempt('ten', '10', 5), latest, attempt('one', '1', 1)]
  const groups = groupCaseAttempts(rows)
  assert.deepEqual(groups.map(([id]) => id), ['1', '2', '10'])
  assert.deepEqual(groups[1][1].map(row => row.id), ['latest', 'old'])
  assert.equal(rows[0], old)
  assert.equal(groupCaseAttempts([]).length, 0)
})

test('TC 선택은 dropdown 대신 단일 선택 tab과 연결된 panel을 사용한다', () => {
  const rows = [attempt('one', '1', 0), attempt('two', '2', 1), attempt('retry', '2', 2)]
  const html = render(rows, rows[2])
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2)
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1)
  assert.match(html, /id="picker-case-2" aria-controls="picker-panel" aria-selected="true" tabindex="0"/)
  assert.doesNotMatch(html, /<select|<option/)
  assert.match(html, /role="group" aria-label="검증 시도"/)
  assert.equal((html.match(/aria-pressed=/g) ?? []).length, 2)
})

test('오래된 시도를 검토 중이면 선택 TC의 판정도 그 시도와 일치한다', () => {
  const old = { ...attempt('old', '2', 0), verdict: 'FAILED' as const, review: 'PASSED' as const }
  const latest = attempt('new', '2', 10)
  const html = render([old, latest], old)
  assert.match(html, /aria-label="TC 2 · 실패 → 통과"/)
  assert.match(html, /qe-case-glyph--FAILED/)
  assert.equal((html.match(/role="tab"/g) ?? []).length, 1)
})

test('시도가 하나면 반복 시도 선택 바를 생략하고 미검토 상태를 표시한다', () => {
  const row = attempt('only', '5', 0)
  const html = render([row], row)
  assert.match(html, /통과 → 미검토/)
  assert.doesNotMatch(html, /role="group"/)
})
