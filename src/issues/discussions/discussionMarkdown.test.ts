import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseDiscussionMarkdown, parseMarkdownInline, plainMarkdown } from './discussionMarkdown'

describe('parseDiscussionMarkdown', () => {
  it('reads headings, paragraphs, quotes, rules and fenced code', () => {
    const blocks = parseDiscussionMarkdown('## 원인\n본문 첫 줄\n둘째 줄\n\n> 인용\n> 이어서\n\n---\n\n```kotlin\nval a = 1\n```')
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['heading', 'paragraph', 'quote', 'rule', 'code'],
    )
    assert.equal(blocks[0].kind === 'heading' && blocks[0].level, 2)
    assert.equal(blocks[1].kind === 'paragraph' && blocks[1].lines.length, 2)
    assert.deepEqual(blocks[4], { kind: 'code', language: 'kotlin', text: 'val a = 1' })
  })

  it('reads task lists and one level of nesting', () => {
    const [list] = parseDiscussionMarkdown('- [x] 재현\n- [ ] 수정\n  - 하위 항목\n- 일반')
    assert.equal(list.kind, 'list')
    if (list.kind !== 'list') return
    assert.deepEqual(list.items.map((item) => item.task), [true, false, null])
    assert.equal(list.items[1].children.length, 1)
  })

  it('reads ordered lists from their first number', () => {
    const [list] = parseDiscussionMarkdown('3. 셋\n4. 넷')
    assert.ok(list.kind === 'list' && list.ordered && list.start === 3 && list.items.length === 2)
  })

  it('reads pipe tables', () => {
    const [table] = parseDiscussionMarkdown('| 빌드 | 결과 |\n|---|---|\n| 1.0 | 실패 |')
    assert.ok(table.kind === 'table' && table.header.length === 2 && table.rows.length === 1)
  })
})

describe('parseMarkdownInline', () => {
  it('reads emphasis, code and safe links', () => {
    const parts = parseMarkdownInline('**굵게** _기울임_ ~~취소~~ `code` [문서](https://example.com)')
    assert.deepEqual(
      parts.filter((part) => part.kind !== 'text').map((part) => part.kind),
      ['bold', 'italic', 'strike', 'code', 'link'],
    )
  })

  it('keeps unsafe links and unclosed marks as text', () => {
    assert.deepEqual(parseMarkdownInline('[x](javascript:alert(1))'), [{ kind: 'text', text: '[x](javascript:alert(1))' }])
    assert.deepEqual(parseMarkdownInline('**열림'), [{ kind: 'text', text: '**열림' }])
  })

  it('reads [[tc:id]] as a test case reference, and leaves other brackets alone', () => {
    assert.deepEqual(parseMarkdownInline('확인: [[tc:42]] 참고'), [
      { kind: 'text', text: '확인: ' },
      { kind: 'case', caseId: '42' },
      { kind: 'text', text: ' 참고' },
    ])
    assert.deepEqual(parseMarkdownInline('[[tc:abc]]'), [{ kind: 'text', text: '[[tc:abc]]' }])
    assert.deepEqual(parseMarkdownInline('`[[tc:1]]`'), [{ kind: 'code', text: '[[tc:1]]' }])
  })

  it('does not read underscores inside words as italic', () => {
    assert.deepEqual(parseMarkdownInline('snake_case_name'), [{ kind: 'text', text: 'snake_case_name' }])
  })
})

describe('plainMarkdown', () => {
  it('strips marks for list excerpts', () => {
    assert.equal(plainMarkdown('## 제목\n- [x] **완료** [링크](https://a.b)\n```\ncode\n```'), '제목 완료 링크')
  })

  it('shows test case references as their number', () => {
    assert.equal(plainMarkdown('[[tc:42]] 에서 깨짐', id => id === '42' ? 'TC-001' : 'TC-…'), 'TC-001 에서 깨짐')
    assert.equal(plainMarkdown('[[tc:42]] 에서 깨짐'), 'TC-… 에서 깨짐')
  })
})
