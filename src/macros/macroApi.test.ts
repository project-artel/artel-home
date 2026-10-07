/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMacroDetail, parseMacroList, parseMacroSummary } from './macroApi.ts'
import {
  compareMacros,
  macroScreenLabel,
  macroSignature,
  type MacroSummary,
} from './macroTypes.ts'

/*
 * 파싱은 낯선 서버 값이 화면이 되거나 빈 종이가 되는 자리다. 여기서 못 박는 규칙:
 * 행 하나가 나쁘다고 사용자가 목록 전체를 잃지 않고, source 는 서버가 쓴 글자 그대로
 * 통과한다.
 *
 * 아래 `documented` 는 `artel-orchestration-server` 의 `MacroViewDtos.kt` (ARTEL-943,
 * PR #286) 에서 옮긴 모양이다. 그쪽이 아직 머지되지 않았으므로 이 테스트들은 "서버가
 * 실제로 이렇게 준다" 를 증명하지 않는다. 그 DTO 대로 왔을 때 화면이 선다는 것과,
 * 계약이 nullable 이라고 말한 자리가 비어도 안 깨진다는 것을 증명한다.
 */

const documented = {
  id: 7,
  name: 'attack_with_combined_card',
  parameters: [
    { name: 'card_a', type: 'string' },
    { name: 'repeat', type: null },
  ],
  screens: [{ id: 41, name: '손패', sceneName: 'TurnBattleScene' }],
  updatedAt: '2026-10-06T05:21:17.775Z',
}

test('명세대로의 목록 항목을 필드별로 읽는다', () => {
  assert.deepEqual(parseMacroSummary(documented), {
    id: '7',
    name: 'attack_with_combined_card',
    parameters: [
      { name: 'card_a', type: 'string' },
      { name: 'repeat', type: null },
    ],
    screens: [{ id: '41', name: '손패', sceneName: 'TurnBattleScene' }],
    updatedAt: '2026-10-06T05:21:17.775Z',
  })
})

test('목록은 items 로 한 겹 싸여 온다', () => {
  // 최상위 배열이 아니다. 이 저장소의 목록 응답 관례가 `items` 이고, 그것을 못 읽으면
  // 화면은 오류가 아니라 "macro 가 없습니다" 라는 틀린 사실을 조용히 말한다.
  const parsed = parseMacroList({ items: [documented] })
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, '7')
})

test('최상위 배열도 받아 둔다', () => {
  // 서버가 아직 머지되지 않아 모양이 한 번 더 움직일 수 있다. 방어이지 호환이 아니다.
  assert.deepEqual(parseMacroList([documented]), parseMacroList({ items: [documented] }))
})

test('봉투를 못 읽으면 빈 목록이 된다', () => {
  assert.deepEqual(parseMacroList(null), [])
  assert.deepEqual(parseMacroList({ macros: [documented] }), [])
})

test('id 는 숫자로 와도 문자열로 와도 같은 문자열이 된다', () => {
  // 숫자를 그대로 들고 다니면 주소에서 읽은 "7" 이 목록의 7 을 못 찾는다.
  assert.equal(parseMacroSummary({ ...documented, id: 7 })?.id, '7')
  assert.equal(parseMacroSummary({ ...documented, id: '7' })?.id, '7')
})

test('id 가 없는 행은 버린다. 그것 말고는 아무것도 필수가 아니다', () => {
  assert.equal(parseMacroSummary({ name: 'attack' }), null)

  // 이름도 parameter 도 screen 도 없는 macro 는 얇은 항목이지 깨진 응답이 아니다.
  assert.deepEqual(parseMacroSummary({ id: 7 }), {
    id: '7',
    name: '',
    parameters: [],
    screens: [],
    updatedAt: '',
  })
})

test('screens 키가 아예 없는 응답은 빈 배열을 실은 응답과 같다', () => {
  // 그 둘을 가르면 서버가 이 필드를 싣기 전의 모든 macro 가 "불러오지 못함"이 된다.
  assert.deepEqual(parseMacroSummary({ id: 1, name: 'resetAll' })?.screens, [])
  assert.deepEqual(parseMacroSummary({ id: 1, name: 'resetAll', screens: [] })?.screens, [])
})

test('parameter 의 type 은 null 이 정상이고, 순서는 선언 순서 그대로다', () => {
  const parsed = parseMacroSummary({
    id: 1,
    parameters: [
      { name: 'first', type: 'string' },
      { name: 'second', type: null },
      { name: 'third', type: '  ' },
      { type: 'int' },
    ],
  })

  // 저장된 tree 가 타입을 말하지 않으면 `null` 이고, 그때도 이름과 순서는 남는다.
  // 빈 문자열도 `null` 로 접는다. 이름이 없는 것만 버린다 — 서명에 쓸 수 없다.
  assert.deepEqual(parsed?.parameters, [
    { name: 'first', type: 'string' },
    { name: 'second', type: null },
    { name: 'third', type: null },
  ])
})

test('screen 은 name 이 null 이어도 sceneName 으로 알아본다', () => {
  const parsed = parseMacroSummary({
    id: 1,
    screens: [
      { id: 41, name: null, sceneName: 'TurnBattleScene' },
      { id: '41', name: '중복', sceneName: 'TurnBattleScene' },
      { name: 'id 없음', sceneName: 'TurnBattleScene' },
      { id: 42, name: '상점', sceneName: 'TownScene' },
    ],
  })

  // 숫자 id 를 문자열로 맞추고, 같은 id 가 두 번 오면 하나로 합친다. id 가 없는
  // 관계는 가리키는 곳이 없어 버린다.
  assert.deepEqual(parsed?.screens, [
    { id: '41', name: null, sceneName: 'TurnBattleScene' },
    { id: '42', name: '상점', sceneName: 'TownScene' },
  ])
})

test('목록은 읽을 수 없는 행만 버리고 나머지를 남긴다', () => {
  const parsed = parseMacroList({ items: [documented, { name: 'id 가 없음' }, { id: 9 }] })
  assert.deepEqual(
    parsed.map((macro) => macro.id),
    ['7', '9'],
  )
})

test('같은 id 가 두 번 오면 먼저 온 것만 남는다', () => {
  // id 가 선택의 키다. 둘을 남기면 하나를 골랐을 때 어느 쪽이 열릴지 알 수 없다.
  const parsed = parseMacroList({
    items: [
      { id: 7, name: '먼저' },
      { id: '7', name: '나중' },
    ],
  })
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].name, '먼저')
})

const indentedSource = [
  'def attack_with_combined_card(card_a, repeat):',
  '    tap("hand_card_" + card_a)',
  '    if visible("combine_confirm"):',
  '        tap("confirm")',
  '        wait(0.5)',
  '    tap("end_turn")',
  '',
].join('\n')

test('source 는 들여쓰기와 줄바꿈 그대로 통과한다', () => {
  const parsed = parseMacroDetail({ ...documented, source: indentedSource })

  // 들여쓰기가 문법의 일부라(`if` 몸통) 다듬는 순간 다른 뜻의 글이 된다. trim 도
  // 줄바꿈 정리도 하지 않는다는 것을 바이트 단위로 못 박는다.
  assert.equal(parsed?.source, indentedSource)
  assert.equal(parsed?.source.split('\n').length, 7)
  assert.ok(parsed?.source.includes('\n        tap("confirm")'))
  // 끝의 빈 줄도 남는다.
  assert.ok(parsed?.source.endsWith('\n'))
})

test('상세는 래퍼 없는 평평한 객체이고 목록의 모든 칸을 함께 싣는다', () => {
  const parsed = parseMacroDetail({ ...documented, source: 'tap("x")' })
  assert.equal(parsed?.id, '7')
  assert.equal(parsed?.name, 'attack_with_combined_card')
  assert.equal(parsed?.parameters.length, 2)
  assert.deepEqual(parsed?.screens, [{ id: '41', name: '손패', sceneName: 'TurnBattleScene' }])
  assert.equal(parsed?.source, 'tap("x")')
})

test('source 가 없는 상세는 빈 문자열이지 실패가 아니다', () => {
  assert.equal(parseMacroDetail({ id: 1 })?.source, '')
  // id 가 없으면 상세도 읽을 수 없다.
  assert.equal(parseMacroDetail({ source: 'tap("x")' }), null)
})

test('서명은 타입을 모르는 parameter 를 이름만으로 쓴다', () => {
  // `: null` 을 적으면 서버가 말하지 않은 것을 화면이 지어내는 것이 된다.
  assert.equal(
    macroSignature([
      { name: 'card_a', type: 'string' },
      { name: 'repeat', type: null },
    ]),
    '(card_a: string, repeat)',
  )
  // parameter 가 없어도 괄호를 남긴다. 빈 문자열은 "서명을 아직 못 읽었다"로 보인다.
  assert.equal(macroSignature([]), '()')
})

test('screen 이름은 씬을 앞에 두고, 이름이 없으면 id 로 가린다', () => {
  assert.equal(
    macroScreenLabel({ id: '41', name: '손패', sceneName: 'TurnBattleScene' }),
    'TurnBattleScene · 손패',
  )
  // 같은 씬의 이름 없는 화면이 둘 달려 있을 때 둘을 가를 유일한 값이 id 다.
  assert.equal(
    macroScreenLabel({ id: '41', name: null, sceneName: 'TurnBattleScene' }),
    'TurnBattleScene · #41',
  )

  // `sceneName` 은 계약상 NOT NULL 이지만 파서가 빈 값도 받아 둔다. 그대로 이으면
  // `· 손패` 처럼 앞이 허전한 가운뎃점이 남으므로, 있는 조각만 잇는다.
  assert.equal(macroScreenLabel({ id: '41', name: '손패', sceneName: '' }), '손패')
  assert.equal(macroScreenLabel({ id: '41', name: null, sceneName: '' }), '#41')
})

test('정렬은 이름 오름차순, 동점은 id 를 숫자로 비교한다', () => {
  const macro = (id: string, name: string): MacroSummary => ({
    id,
    name,
    parameters: [],
    screens: [],
    updatedAt: '',
  })

  // id 를 문자열로 비교하면 10 이 2 보다 앞에 선다.
  assert.deepEqual(
    [macro('10', 'same'), macro('2', 'same'), macro('1', 'alpha')]
      .sort(compareMacros)
      .map((entry) => entry.id),
    ['1', '2', '10'],
  )

  // 숫자로 안 읽히는 id 에서 `NaN` 을 돌려주면 정렬 결과가 구현에 따라 달라진다.
  assert.equal(compareMacros(macro('x', 'same'), macro('2', 'same')), 0)
})
