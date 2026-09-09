import assert from 'node:assert/strict'
import test from 'node:test'
import { parseChatMarkdown, parseInline, type Block } from './chatMarkdown'

function texts(block: Block): string[] {
  if (block.kind === 'paragraph') {
    return block.lines.map((line) => line.map((part) => part.text).join(''))
  }
  return block.items.map((item) => item.content.map((part) => part.text).join(''))
}

test('마크다운이 없는 본문은 한 문단 그대로다', () => {
  const blocks = parseChatMarkdown('전투 씬에서 카드를 낸다.')
  assert.deepEqual(blocks, [
    { kind: 'paragraph', lines: [[{ kind: 'text', text: '전투 씬에서 카드를 낸다.' }]] },
  ])
})

test('빈 줄이 문단을 가른다', () => {
  const blocks = parseChatMarkdown('첫 문단\n\n둘째 문단')
  assert.equal(blocks.length, 2)
  assert.deepEqual(texts(blocks[0]), ['첫 문단'])
  assert.deepEqual(texts(blocks[1]), ['둘째 문단'])
})

test('한 문단 안의 줄바꿈은 줄로 남는다', () => {
  // 25건 중 1건뿐이지만, 붙여 버리면 그 1건이 다른 뜻이 된다.
  const blocks = parseChatMarkdown('첫 줄\n둘째 줄')
  assert.equal(blocks.length, 1)
  assert.deepEqual(texts(blocks[0]), ['첫 줄', '둘째 줄'])
})

test('순서 없는 목록을 읽는다', () => {
  const blocks = parseChatMarkdown('- 첫 항목\n- 둘째 항목')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].kind, 'list')
  assert.equal(blocks[0].kind === 'list' && blocks[0].ordered, false)
  assert.deepEqual(texts(blocks[0]), ['첫 항목', '둘째 항목'])
})

test('번호 목록을 읽고, 번호를 본문에 남기지 않는다', () => {
  const blocks = parseChatMarkdown('1. 첫 항목\n2. 둘째 항목')
  assert.equal(blocks[0].kind === 'list' && blocks[0].ordered, true)
  assert.deepEqual(texts(blocks[0]), ['첫 항목', '둘째 항목'])
})

test('번호 목록과 하이픈 목록은 서로 다른 목록이다', () => {
  const blocks = parseChatMarkdown('1. 번호\n- 하이픈')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].kind === 'list' && blocks[0].ordered, true)
  assert.equal(blocks[1].kind === 'list' && blocks[1].ordered, false)
})

test('들여쓴 항목은 바로 위 항목에 붙는다', () => {
  const blocks = parseChatMarkdown('1. 자동 전환\n   - TurnBattleScene → GameClearScene\n   - EndingScene → Map_scene')
  assert.equal(blocks.length, 1)
  const list = blocks[0]
  assert.equal(list.kind, 'list')
  if (list.kind !== 'list') return
  assert.equal(list.items.length, 1)
  assert.deepEqual(
    list.items[0].children.map((child) => child.map((part) => part.text).join('')),
    ['TurnBattleScene → GameClearScene', 'EndingScene → Map_scene'],
  )
})

test('위에 붙일 항목이 없으면 들여쓴 항목도 버리지 않는다', () => {
  const blocks = parseChatMarkdown('  - 들여써서 시작한 목록')
  assert.equal(blocks.length, 1)
  assert.deepEqual(texts(blocks[0]), ['들여써서 시작한 목록'])
})

test('목록 뒤의 산문은 목록에 딸려 들어가지 않는다', () => {
  const blocks = parseChatMarkdown('- 항목\n그다음 문장')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].kind, 'list')
  assert.equal(blocks[1].kind, 'paragraph')
})

test('볼드와 인라인 코드를 가른다', () => {
  assert.deepEqual(parseInline('**진입** 시 `HpText` 갱신'), [
    { kind: 'bold', text: '진입' },
    { kind: 'text', text: ' 시 ' },
    { kind: 'code', text: 'HpText' },
    { kind: 'text', text: ' 갱신' },
  ])
})

test('목록 항목 안에서도 볼드와 코드를 읽는다', () => {
  const blocks = parseChatMarkdown('1. **Route lookup timeouts**: `find_path` 가 느리다')
  const list = blocks[0]
  assert.equal(list.kind, 'list')
  if (list.kind !== 'list') return
  assert.deepEqual(list.items[0].content, [
    { kind: 'bold', text: 'Route lookup timeouts' },
    { kind: 'text', text: ': ' },
    { kind: 'code', text: 'find_path' },
    { kind: 'text', text: ' 가 느리다' },
  ])
})

test('닫히지 않은 표시는 글자 그대로 남는다', () => {
  // 고쳐 주지 않는다. 사용자가 보는 것은 모델이 쓴 그 글자다.
  assert.deepEqual(parseInline('2 ** 3 은 곱셈이 아니다'), [
    { kind: 'text', text: '2 ** 3 은 곱셈이 아니다' },
  ])
  assert.deepEqual(parseInline('`열기만 한 백틱'), [{ kind: 'text', text: '`열기만 한 백틱' }])
})

test('코드 안의 별표는 볼드가 아니다', () => {
  assert.deepEqual(parseInline('`a ** b`'), [{ kind: 'code', text: 'a ** b' }])
})

test('빈 볼드는 강조가 아니라 네 글자다', () => {
  assert.deepEqual(parseInline('****'), [{ kind: 'text', text: '****' }])
})

test('빈 본문은 블록을 만들지 않는다', () => {
  assert.deepEqual(parseChatMarkdown(''), [])
  assert.deepEqual(parseChatMarkdown('\n\n'), [])
})
