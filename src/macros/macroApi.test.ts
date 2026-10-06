/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMacroDetail, parseMacroList, parseMacroSummary } from './macroApi.ts'
import { compareMacros, macroSignature, type MacroSummary } from './macroTypes.ts'

/*
 * 파싱은 낯선 서버 값이 화면이 되거나 빈 종이가 되는 자리다. 여기서 못 박는 규칙:
 * 행 하나가 나쁘다고 사용자가 목록 전체를 잃지 않고, source 는 서버가 쓴 글자 그대로
 * 통과한다.
 *
 * 이 endpoint 둘은 ARTEL-943 이 아직 만드는 중이라 응답을 직접 본 적이 없다. 그래서
 * 이 테스트들은 "서버가 이렇게 준다" 를 증명하지 않는다. 명세대로 왔을 때와, 명세가
 * 말하지 않아 `macroApi.ts` 가 추측한 모양으로 왔을 때 화면이 서는지를 증명한다.
 */

const documented = {
  number: 3,
  name: 'openShop',
  parameters: [
    { name: 'slot', type: 'int' },
    { name: 'confirm', type: 'bool' },
  ],
  screens: [{ id: '91', name: '마을 상점' }],
  updatedAt: '2026-10-05T04:12:00Z',
}

test('명세대로의 목록 항목을 필드별로 읽는다', () => {
  assert.deepEqual(parseMacroSummary(documented), {
    number: '3',
    name: 'openShop',
    parameters: [
      { name: 'slot', type: 'int' },
      { name: 'confirm', type: 'bool' },
    ],
    screens: [{ id: '91', name: '마을 상점' }],
    updatedAt: '2026-10-05T04:12:00Z',
  })
})

test('number 는 숫자로 와도 문자열로 와도 같은 문자열이 된다', () => {
  // 숫자를 그대로 들고 다니면 주소에서 읽은 "3" 이 목록의 3 을 못 찾는다.
  assert.equal(parseMacroSummary({ ...documented, number: 3 })?.number, '3')
  assert.equal(parseMacroSummary({ ...documented, number: '3' })?.number, '3')
})

test('number 가 없는 행은 버린다. 그것 말고는 아무것도 필수가 아니다', () => {
  assert.equal(parseMacroSummary({ name: 'openShop' }), null)

  // 이름도 parameter 도 screen 도 없는 macro 는 얇은 항목이지 깨진 응답이 아니다.
  assert.deepEqual(parseMacroSummary({ number: 7 }), {
    number: '7',
    name: '',
    parameters: [],
    screens: [],
    updatedAt: '',
  })
})

test('screens 키가 아예 없는 응답은 빈 배열을 실은 응답과 같다', () => {
  // 그 둘을 가르면 서버가 이 필드를 싣기 전의 모든 macro 가 "불러오지 못함"이 된다.
  const withoutKey = parseMacroSummary({ number: 1, name: 'resetAll' })
  const withEmpty = parseMacroSummary({ number: 1, name: 'resetAll', screens: [] })
  assert.deepEqual(withoutKey?.screens, [])
  assert.deepEqual(withEmpty?.screens, [])
})

test('parameter 는 선언 순서를 지키고, 이름 없는 것만 빠진다', () => {
  const parsed = parseMacroSummary({
    number: 1,
    parameters: [
      { name: 'first', type: 'string' },
      { type: 'int' },
      { name: 'third' },
    ],
  })

  // 순서가 곧 호출 순서라 정렬하거나 섞으면 서명이 거짓이 된다. `type` 이 빈
  // parameter 는 살린다 — 이름만으로도 서명은 읽힌다.
  assert.deepEqual(parsed?.parameters, [
    { name: 'first', type: 'string' },
    { name: 'third', type: '' },
  ])
})

test('이름 없는 screen 은 null 로, id 없는 screen 은 버린다', () => {
  const parsed = parseMacroSummary({
    number: 1,
    screens: [{ id: 5 }, { id: '5', name: '  ' }, { name: '이름만' }, { id: '6', name: '상점' }],
  })

  // 숫자 id 를 받아 문자열로 맞추고, 같은 id 가 두 번 오면 하나로 합친다.
  assert.deepEqual(parsed?.screens, [
    { id: '5', name: null },
    { id: '6', name: '상점' },
  ])
})

test('목록 봉투는 배열이어도 { macros } 여도 읽힌다', () => {
  // 명세가 봉투를 말하지 않았다. 틀린 쪽을 골라 두면 서버가 머지되는 날 화면이
  // "macro 가 없습니다" 라는 틀린 사실을 조용히 말한다.
  const asArray = parseMacroList([documented])
  const asEnvelope = parseMacroList({ macros: [documented] })
  assert.deepEqual(asArray, asEnvelope)
  assert.equal(asArray.length, 1)
})

test('목록은 읽을 수 없는 행만 버리고 나머지를 남긴다', () => {
  const parsed = parseMacroList([documented, { name: 'number 가 없음' }, { number: 9 }])
  assert.deepEqual(
    parsed.map((macro) => macro.number),
    ['3', '9'],
  )
})

test('같은 number 가 두 번 오면 먼저 온 것만 남는다', () => {
  // 번호가 선택의 키다. 둘을 남기면 하나를 골랐을 때 어느 쪽이 열릴지 알 수 없다.
  const parsed = parseMacroList([
    { number: 3, name: '먼저' },
    { number: '3', name: '나중' },
  ])
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].name, '먼저')
})

test('봉투가 아예 다른 모양이면 빈 목록이 된다', () => {
  assert.deepEqual(parseMacroList(null), [])
  assert.deepEqual(parseMacroList({ items: [documented] }), [])
})

const indentedSource = [
  'macro openShop(slot: int)',
  '  tap "shop_button"',
  '  if visible("confirm_dialog")',
  '    tap "confirm"',
  '    wait 0.5',
  '  end',
  'end',
  '',
].join('\n')

test('source 는 들여쓰기와 줄바꿈 그대로 통과한다', () => {
  const parsed = parseMacroDetail({ ...documented, source: indentedSource })

  // 들여쓰기가 문법의 일부라(`if` 몸통) 다듬는 순간 다른 뜻의 글이 된다. trim 도
  // 줄바꿈 정리도 하지 않는다는 것을 바이트 단위로 못 박는다.
  assert.equal(parsed?.source, indentedSource)
  assert.equal(parsed?.source.split('\n').length, 8)
  assert.ok(parsed?.source.includes('\n    tap "confirm"'))
  // 끝의 빈 줄도 남는다.
  assert.ok(parsed?.source.endsWith('\n'))
})

test('상세는 목록 항목의 모든 필드를 함께 싣는다', () => {
  const parsed = parseMacroDetail({ ...documented, source: 'tap "x"' })
  assert.equal(parsed?.number, '3')
  assert.equal(parsed?.name, 'openShop')
  assert.equal(parsed?.parameters.length, 2)
  assert.deepEqual(parsed?.screens, [{ id: '91', name: '마을 상점' }])
})

test('source 가 없는 상세는 빈 문자열이지 실패가 아니다', () => {
  assert.equal(parseMacroDetail({ number: 1 })?.source, '')
  // number 가 없으면 상세도 읽을 수 없다.
  assert.equal(parseMacroDetail({ source: 'tap "x"' }), null)
})

test('서명은 parameter 가 없어도 괄호를 남긴다', () => {
  // 빈 문자열로 두면 이름 뒤에 아무것도 없어서 "서명을 아직 못 읽었다"로 보인다.
  assert.equal(macroSignature([]), '()')
  assert.equal(macroSignature([{ name: 'slot', type: 'int' }]), '(slot: int)')
  assert.equal(
    macroSignature([
      { name: 'slot', type: 'int' },
      { name: 'confirm', type: 'bool' },
    ]),
    '(slot: int, confirm: bool)',
  )
})

test('정렬은 이름 오름차순, 동점은 번호를 숫자로 비교한다', () => {
  const macro = (number: string, name: string): MacroSummary => ({
    number,
    name,
    parameters: [],
    screens: [],
    updatedAt: '',
  })

  // 번호를 문자열로 비교하면 10 이 2 보다 앞에 선다.
  const sorted = [macro('10', 'same'), macro('2', 'same'), macro('1', 'alpha')]
    .sort(compareMacros)
    .map((entry) => entry.number)
  assert.deepEqual(sorted, ['1', '2', '10'])
})
