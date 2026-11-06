import assert from 'node:assert/strict'
import test from 'node:test'
import { draftIdOfNumber, draftNumber, parseDrafts, parseRunStreamEvent } from './runChatApi'

// 자동저장을 끈 턴의 draft(ARTEL-1075). 서버는 바뀔 때마다 전부를 `draft` 프레임으로 보내고, 새로고침한
// 화면은 같은 모양을 `GET …/chat/draft` 로 받는다 — 두 길이 같게 읽혀야 한다.

test('draft 프레임을 읽는다', () => {
  const parsed = parseRunStreamEvent(
    JSON.stringify({
      type: 'draft',
      drafts: [
        {
          draft_id: 'new-1',
          scenario_id: null,
          title: '새 흐름',
          description: '',
          steps: [{ action: '메뉴를 연다', case_id: 3 }],
          absorbed_scenario_ids: [],
        },
        {
          draft_id: 'edit-7',
          scenario_id: 7,
          title: '고친 흐름',
          description: 'd',
          steps: [],
          absorbed_scenario_ids: [8],
        },
      ],
    }),
  )
  assert.ok(parsed !== null && parsed.type === 'draft')
  assert.deepEqual(
    parsed.drafts.map((draft) => [draft.draftId, draft.scenarioId, draft.title, draft.absorbedScenarioIds]),
    [
      ['new-1', null, '새 흐름', []],
      ['edit-7', 7, '고친 흐름', [8]],
    ],
  )
  assert.equal(parsed.drafts[0].steps[0].case_id, 3)
})

test('비어 오면 draft 가 없는 것이다', () => {
  const parsed = parseRunStreamEvent(JSON.stringify({ type: 'draft', drafts: [] }))
  assert.ok(parsed !== null && parsed.type === 'draft')
  assert.deepEqual(parsed.drafts, [])
})

test('이름 없는 항목은 버린다', () => {
  assert.deepEqual(parseDrafts([{ title: '이름 없음' }, null, 'x']), [])
  assert.deepEqual(parseDrafts(undefined), [])
})

test('draft 번호는 새것이 음수, 고친 것은 시나리오 번호이고 되돌릴 수 있다', () => {
  assert.equal(draftNumber('new-3'), -3)
  assert.equal(draftNumber('edit-7'), 7)
  assert.equal(draftNumber('other'), null)
  assert.equal(draftIdOfNumber(-3), 'new-3')
  assert.equal(draftIdOfNumber(7), 'edit-7')
})
