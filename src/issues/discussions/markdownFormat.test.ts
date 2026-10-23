import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyFormat } from './markdownFormat'

describe('applyFormat', () => {
  it('wraps the selection and keeps it selected', () => {
    assert.deepEqual(applyFormat('a bc d', 2, 4, 'bold'), { next: 'a **bc** d', start: 4, end: 6 })
  })

  it('puts a placeholder when nothing is selected', () => {
    assert.deepEqual(applyFormat('', 0, 0, 'italic'), { next: '_text_', start: 1, end: 5 })
  })

  it('prefixes every selected line', () => {
    assert.equal(applyFormat('one\ntwo', 0, 7, 'number').next, '1. one\n2. two')
    assert.equal(applyFormat('one\ntwo', 5, 5, 'task').next, 'one\n- [ ] two')
  })

  it('selects the url placeholder of a new link', () => {
    const result = applyFormat('see docs', 4, 8, 'link')
    assert.equal(result.next, 'see [docs](url)')
    assert.equal(result.next.slice(result.start, result.end), 'url')
  })

  it('fences a multi-line selection as a code block', () => {
    assert.equal(applyFormat('a\nb', 0, 3, 'code').next, '```\na\nb\n```')
  })
})
