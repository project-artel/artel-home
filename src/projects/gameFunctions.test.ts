import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  describeParam,
  describeParamRange,
  isCatalogEmpty,
  parseGameFunctionCatalog,
} from './gameFunctions'

const CHEAT = {
  name: 'give_gold',
  description: "Adds gold to the player's wallet.",
  params: [{ name: 'amount', type: 'int', min: 1, max: 1000000, default: null, values: null }],
  target: null,
  group: null,
}

describe('parseGameFunctionCatalog', () => {
  it('계약의 예시 항목을 읽는다', () => {
    const catalog = parseGameFunctionCatalog({
      revision: 3,
      receivedAt: '2026-10-14T08:00:00Z',
      cheats: [CHEAT],
      behaviors: [
        {
          name: 'auto_attack',
          description: 'Attacks the nearest enemy.',
          params: [{ name: 'range', type: 'float', min: null, max: null, default: 8, values: null }],
          target: { component: 'PlayerController' },
          group: 'combat',
        },
      ],
    })

    assert.ok(catalog)
    assert.equal(catalog.revision, 3)
    assert.equal(catalog.receivedAt, '2026-10-14T08:00:00Z')
    assert.equal(catalog.cheats[0].params[0].max, 1000000)
    assert.equal(catalog.behaviors[0].targetComponent, 'PlayerController')
    assert.equal(catalog.behaviors[0].group, 'combat')
    assert.equal(catalog.behaviors[0].params[0].defaultValue, 8)
  })

  it('catalog 를 한 번도 보내지 않은 build 는 revision 0 의 빈 목록이다', () => {
    const catalog = parseGameFunctionCatalog({ revision: 0, receivedAt: null, cheats: [], behaviors: [] })
    assert.ok(catalog)
    assert.equal(catalog.revision, 0)
    assert.equal(catalog.receivedAt, null)
    assert.ok(isCatalogEmpty(catalog))
  })

  it('이름이 없는 항목과 이름이 없는 인자는 버린다', () => {
    const catalog = parseGameFunctionCatalog({
      revision: 1,
      cheats: [{ description: 'no name' }, { ...CHEAT, params: [{ type: 'int' }, ...CHEAT.params] }],
      behaviors: 'not a list',
    })
    assert.ok(catalog)
    assert.equal(catalog.cheats.length, 1)
    assert.equal(catalog.cheats[0].params.length, 1)
    assert.deepEqual(catalog.behaviors, [])
  })

  it('객체가 아닌 응답은 빈 catalog 가 아니라 null 이다', () => {
    assert.equal(parseGameFunctionCatalog(null), null)
    assert.equal(parseGameFunctionCatalog('oops'), null)
  })

  it('음수나 숫자가 아닌 revision 은 0 으로 읽는다', () => {
    assert.equal(parseGameFunctionCatalog({ revision: -2 })?.revision, 0)
    assert.equal(parseGameFunctionCatalog({ revision: '3' })?.revision, 0)
  })
})

describe('describeParam', () => {
  it('범위가 한쪽만 있어도 읽는다', () => {
    const base = { name: 'n', type: 'int', defaultValue: null, values: null }
    assert.equal(describeParamRange({ ...base, min: 1, max: 5 }), '1 – 5')
    assert.equal(describeParamRange({ ...base, min: 1, max: null }), '≥ 1')
    assert.equal(describeParamRange({ ...base, min: null, max: 5 }), '≤ 5')
    assert.equal(describeParamRange({ ...base, min: null, max: null }), null)
  })

  it('enum 은 범위 대신 값 이름을 잇는다', () => {
    const text = describeParam({
      name: 'mode', type: 'enum', min: null, max: null, defaultValue: null, values: ['easy', 'hard'],
    })
    assert.equal(text, 'mode: enum (easy | hard)')
  })

  it('범위가 없는 인자는 이름과 type 만 적는다', () => {
    assert.equal(
      describeParam({ name: 'flag', type: 'bool', min: null, max: null, defaultValue: null, values: null }),
      'flag: bool',
    )
  })
})
